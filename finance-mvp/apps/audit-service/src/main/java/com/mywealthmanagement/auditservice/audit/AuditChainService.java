package com.mywealthmanagement.auditservice.audit;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Tamper-evident hash chain over the audit log.
 *
 * Each event's entry_hash = SHA-256( prev_hash | canonical(content) ), where
 * prev_hash is the previous event's entry_hash. Because every hash depends on the
 * one before it, altering or deleting any past row invalidates every later hash —
 * which {@link #verify()} detects.
 *
 * NOTE: append() is synchronized so the chain stays consistent. That is correct
 * for a single audit-service instance (the intended deployment). For a horizontally
 * scaled audit-service, replace the in-process lock with a DB advisory lock or a
 * single-writer ingestion queue.
 */
@Service
@RequiredArgsConstructor
public class AuditChainService {

    static final String GENESIS = "GENESIS";

    private final AuditEventRepository repository;

    /** Compute the chain links and persist. Returns the saved event. */
    public synchronized AuditEvent append(AuditEvent e) {
        if (e.getCreatedAt() == null) e.setCreatedAt(LocalDateTime.now());
        AuditEvent last = repository.findTopByOrderByIdDesc();
        String prev = (last != null && last.getEntryHash() != null) ? last.getEntryHash() : GENESIS;
        e.setPrevHash(prev);
        e.setEntryHash(hash(prev, e));
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
            String recomputed = hash(e.getPrevHash() == null ? GENESIS : e.getPrevHash(), e);
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

    /** Canonical, order-stable serialization of the hashed content. */
    private static String hash(String prev, AuditEvent e) {
        String canonical = String.join("|",
                ns(prev), ns(e.getUserId()), ns(e.getActorType()), ns(e.getAction()),
                ns(e.getService()), ns(e.getMethod()), ns(e.getPath()),
                e.getStatus() == null ? "" : e.getStatus().toString(),
                ns(e.getSourceIp()), ns(e.getOutcome()), ns(e.getMetadata()),
                e.getCreatedAt() == null ? "" : e.getCreatedAt().toString());
        return sha256Hex(canonical);
    }

    private static String ns(String s) {
        return s == null ? "" : s;
    }

    private static String sha256Hex(String input) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(d.length * 2);
            for (byte b : d) sb.append(Character.forDigit((b >> 4) & 0xF, 16)).append(Character.forDigit(b & 0xF, 16));
            return sb.toString();
        } catch (Exception ex) {
            throw new IllegalStateException("SHA-256 unavailable", ex);
        }
    }

    /** Result of a chain integrity check. */
    public record ChainStatus(boolean valid, int count, Long brokenAtId, String detail) {}
}
