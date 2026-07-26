package com.mywealthmanagement.businessfinancialsservice.ledger;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.Comparator;
import java.util.List;

/**
 * Keyed HMAC hash chain over journal entries (GL.4) — mirrors the audit-service design. Each
 * entry's hash covers the previous entry's hash plus this entry's own content, so altering or
 * deleting any past row invalidates every later hash. Deliberately hashes only date-level +
 * financial content (no timestamps), sidestepping the microsecond-truncation pitfall that bit
 * the audit-service on Linux.
 */
@Component
public class LedgerChain {

    static final String GENESIS = "GENESIS";

    private final byte[] key;

    public LedgerChain(@Value("${ledger.chain.key:dev-ledger-chain-key}") String key) {
        this.key = key.getBytes(StandardCharsets.UTF_8);
    }

    /** Deterministic representation of an entry's signed content (id, date, source, lines). */
    public static String canonical(JournalEntry e, List<JournalLine> lines) {
        StringBuilder sb = new StringBuilder();
        sb.append("v1|").append(e.getId()).append('|')
                .append(e.getEntryDate()).append('|')
                .append(nn(e.getSourceType())).append('|')
                .append(nn(e.getSourceRef())).append('|')
                .append(e.getReversalOf() == null ? "" : e.getReversalOf()).append('|');
        lines.stream()
                .sorted(Comparator.comparingInt(JournalLine::getPosition).thenComparingLong(JournalLine::getAccountId))
                .forEach(l -> sb.append(l.getAccountId()).append(':')
                        .append(plain(l.getDebit())).append(':')
                        .append(plain(l.getCredit())).append(';'));
        return sb.toString();
    }

    /** entry_hash = HMAC-SHA256(key, prevHash + "\n" + canonical), hex. */
    public String hash(String prevHash, JournalEntry e, List<JournalLine> lines) {
        return hmacHex((prevHash == null ? GENESIS : prevHash) + "\n" + canonical(e, lines));
    }

    private String hmacHex(String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            byte[] out = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(out.length * 2);
            for (byte b : out) hex.append(Character.forDigit((b >> 4) & 0xF, 16)).append(Character.forDigit(b & 0xF, 16));
            return hex.toString();
        } catch (Exception ex) {
            throw new IllegalStateException("ledger hash failed", ex);
        }
    }

    private static String plain(BigDecimal v) {
        return (v == null ? BigDecimal.ZERO : v).stripTrailingZeros().toPlainString();
    }

    private static String nn(String s) {
        return s == null ? "" : s;
    }
}
