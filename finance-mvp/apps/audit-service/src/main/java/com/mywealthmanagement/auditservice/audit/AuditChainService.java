package com.mywealthmanagement.auditservice.audit;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * Tamper-evident hash chain over the audit log.
 *
 * Each event's entry_hash covers the previous event's entry_hash, so altering or deleting any past
 * row invalidates every later hash — which {@link #verify()} detects.
 *
 * TWO CHAIN VERSIONS, both verifiable:
 *   v1 (legacy)  entry_hash = SHA-256(prev | canonical_v1(content))          — unkeyed
 *   v2 (current) entry_hash = HMAC-SHA256(key, prev | canonical_v2(content))
 *
 * v2 exists because an unkeyed digest only defends against a careless UPDATE: anyone who can write
 * to this database can rewrite a row and recompute every hash after it, and the chain still
 * verifies clean. Keying the digest means forging history needs DB write access *and* a secret
 * that isn't in the DB. canonical_v2 also covers the actor/target/reason/before/after columns, so
 * those are tamper-evident too — a trail whose "who did this to whom, and why" can be edited
 * freely is not an audit trail.
 *
 * Rows keep the version they were written with, and verification re-derives each row under ITS OWN
 * rules. So enabling v2 doesn't retroactively invalidate real history — and equally a v1 row can't
 * be relabelled v2, because the version is part of what v2 signs.
 *
 * NOTE: append() is synchronized so the chain stays consistent. That is correct for a single
 * audit-service instance (the intended deployment). For a horizontally scaled audit-service,
 * replace the in-process lock with a DB advisory lock or a single-writer ingestion queue.
 */
@Service
@RequiredArgsConstructor
public class AuditChainService {

    static final String GENESIS = "GENESIS";

    /** Legacy unkeyed SHA-256 over the original field set. Only ever read, never written. */
    static final int HASH_V1_SHA256 = 1;
    /** Current: keyed HMAC, covering the actor/target/reason/diff columns too. */
    static final int HASH_V2_HMAC = 2;

    private final AuditEventRepository repository;
    private final AuditChainKeyHolder keyHolder;

    /**
     * Compute the chain links and persist. Returns the saved event.
     *
     * createdAt is truncated to microseconds FIRST, because it is part of the hashed content and
     * the store only keeps microsecond precision (Postgres `timestamp`, and H2 likewise). Hashing
     * a nanosecond value that the database then rounds away produces a row whose entry_hash can
     * never be recomputed from its own persisted fields — verify() reports "hash mismatch" on a
     * completely untouched log, which is indistinguishable from tampering.
     *
     * This bites only where the platform clock has nanosecond resolution: Linux (so CI and
     * production) but not macOS, where LocalDateTime.now() is already microsecond-precise. That is
     * why it stayed hidden — it cannot reproduce on a Mac.
     */
    public synchronized AuditEvent append(AuditEvent e) {
        e.setCreatedAt((e.getCreatedAt() == null ? LocalDateTime.now() : e.getCreatedAt())
                .truncatedTo(ChronoUnit.MICROS));
        AuditEvent last = repository.findTopByOrderByIdDesc();
        String prev = (last != null && last.getEntryHash() != null) ? last.getEntryHash() : GENESIS;
        e.setPrevHash(prev);
        e.setHashVersion(HASH_V2_HMAC);
        e.setEntryHash(hash(prev, e, HASH_V2_HMAC));
        return repository.save(e);
    }

    /** Walk the chain and confirm every link + hash. Rows created before the chain
     *  was enabled (no entry_hash) are skipped — integrity is enforced from activation. */
    public ChainStatus verify() {
        List<AuditEvent> all = repository.findAllByOrderByIdAsc().stream()
                .filter(x -> x.getEntryHash() != null)
                .toList();
        String expectedPrev = GENESIS;
        for (AuditEvent e : all) {
            int version = e.getHashVersion() == null ? HASH_V1_SHA256 : e.getHashVersion();
            String recomputed = hash(e.getPrevHash() == null ? GENESIS : e.getPrevHash(), e, version);
            boolean linkOk = expectedPrev.equals(e.getPrevHash() == null ? GENESIS : e.getPrevHash());
            boolean hashOk = recomputed.equals(e.getEntryHash());
            if (!linkOk || !hashOk) {
                return new ChainStatus(false, all.size(), e.getId(),
                        !linkOk ? "broken link" : "hash mismatch");
            }
            expectedPrev = e.getEntryHash();
        }
        return new ChainStatus(true, all.size(), null, "ok");
    }

    /** The current head of the chain, or GENESIS when empty. Used to anchor checkpoints. */
    public synchronized String currentHead() {
        AuditEvent last = repository.findTopByOrderByIdDesc();
        return (last != null && last.getEntryHash() != null) ? last.getEntryHash() : GENESIS;
    }

    /** Dispatch to the formula the row was written with. */
    private String hash(String prev, AuditEvent e, int version) {
        return version >= HASH_V2_HMAC ? hmacV2(prev, e) : sha256V1(prev, e);
    }

    /**
     * v1: the original canonical form. FROZEN — changing a single character here would make every
     * pre-existing row fail verification and look exactly like tampering. New fields go in v2 only.
     */
    private static String sha256V1(String prev, AuditEvent e) {
        String canonical = String.join("|",
                ns(prev), ns(e.getUserId()), ns(e.getActorType()), ns(e.getAction()),
                ns(e.getService()), ns(e.getMethod()), ns(e.getPath()),
                e.getStatus() == null ? "" : e.getStatus().toString(),
                ns(e.getSourceIp()), ns(e.getOutcome()), ns(e.getMetadata()),
                e.getCreatedAt() == null ? "" : e.getCreatedAt().toString());
        return sha256Hex(canonical);
    }

    /**
     * v2: keyed, and covers the semantic columns — the ones that say who was acted upon and why.
     *
     * Geo city/country stay OUT: they are derived enrichment recomputed from source_ip, so
     * including them would make a GeoIP database refresh look like tampering.
     */
    private String hmacV2(String prev, AuditEvent e) {
        String canonical = String.join("|",
                String.valueOf(HASH_V2_HMAC),
                ns(prev), ns(e.getUserId()), ns(e.getActorType()), ns(e.getAction()),
                ns(e.getService()), ns(e.getMethod()), ns(e.getPath()),
                e.getStatus() == null ? "" : e.getStatus().toString(),
                ns(e.getSourceIp()), ns(e.getOutcome()), ns(e.getMetadata()),
                e.getCreatedAt() == null ? "" : e.getCreatedAt().toString(),
                ns(e.getActorKind()), ns(e.getActorId()), ns(e.getTargetUserId()),
                ns(e.getReason()), ns(e.getBeforeJson()), ns(e.getAfterJson()), ns(e.getTicketRef()));
        return hmacHex(keyHolder.key(), canonical);
    }

    private static String ns(String s) {
        return s == null ? "" : s;
    }

    private static String sha256Hex(String input) {
        try {
            return hex(MessageDigest.getInstance("SHA-256").digest(input.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            throw new IllegalStateException("SHA-256 unavailable", ex);
        }
    }

    static String hmacHex(byte[] key, String input) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return hex(mac.doFinal(input.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            throw new IllegalStateException("HmacSHA256 unavailable", ex);
        }
    }

    private static String hex(byte[] d) {
        StringBuilder sb = new StringBuilder(d.length * 2);
        for (byte b : d) sb.append(Character.forDigit((b >> 4) & 0xF, 16)).append(Character.forDigit(b & 0xF, 16));
        return sb.toString();
    }

    /** Result of a chain integrity check. */
    public record ChainStatus(boolean valid, int count, Long brokenAtId, String detail) {}
}
