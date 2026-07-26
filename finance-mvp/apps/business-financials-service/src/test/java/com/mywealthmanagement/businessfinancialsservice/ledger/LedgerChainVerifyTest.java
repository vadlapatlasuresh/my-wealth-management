package com.mywealthmanagement.businessfinancialsservice.ledger;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * The tamper-evident hash chain (GL.4): hashes are deterministic + content-sensitive, a
 * clean chain verifies, and altering a past line is detected.
 */
class LedgerChainVerifyTest {

    private static final long USER = 1L;
    private static final long BIZ = 7L;

    private final LedgerChain chain = new LedgerChain("test-key");

    private LedgerAccountRepository accountRepo;
    private JournalEntryRepository entryRepo;
    private JournalLineRepository lineRepo;
    private LedgerService service;

    @BeforeEach
    void setup() {
        accountRepo = mock(LedgerAccountRepository.class);
        entryRepo = mock(JournalEntryRepository.class);
        lineRepo = mock(JournalLineRepository.class);
        service = new LedgerService(accountRepo, entryRepo, lineRepo, chain);
    }

    private JournalLine line(long acct, String debit, String credit, int pos) {
        JournalLine l = new JournalLine();
        l.setAccountId(acct); l.setDebit(new BigDecimal(debit)); l.setCredit(new BigDecimal(credit)); l.setPosition(pos);
        return l;
    }

    private JournalEntry entry(long id, String src, String ref, List<JournalLine> lines) {
        JournalEntry e = new JournalEntry();
        e.setId(id); e.setUserId(USER); e.setBusinessId(BIZ);
        e.setEntryDate(LocalDate.of(2026, 7, 26)); e.setSourceType(src); e.setSourceRef(ref);
        e.setLines(lines);
        return e;
    }

    @Test
    void hash_isDeterministicAndContentSensitive() {
        JournalEntry e = entry(1, "INVOICE", "10", List.of(line(1100, "108.00", "0", 0), line(4000, "0", "108.00", 1)));
        String h1 = chain.hash(LedgerChain.GENESIS, e, e.getLines());
        String h2 = chain.hash(LedgerChain.GENESIS, e, e.getLines());
        assertThat(h1).isEqualTo(h2).hasSize(64);

        // Change a line amount -> different hash.
        e.getLines().get(0).setDebit(new BigDecimal("999.00"));
        assertThat(chain.hash(LedgerChain.GENESIS, e, e.getLines())).isNotEqualTo(h1);
    }

    @Test
    void verify_validForACleanChain_detectsTampering() {
        List<JournalLine> lines1 = List.of(line(1100, "108.00", "0", 0), line(4000, "0", "108.00", 1));
        List<JournalLine> lines2 = List.of(line(1000, "108.00", "0", 0), line(1100, "0", "108.00", 1));
        JournalEntry e1 = entry(1, "INVOICE", "10", lines1);
        JournalEntry e2 = entry(2, "PAYMENT", "10", lines2);

        // Stamp real hashes as post() would.
        e1.setPrevHash(LedgerChain.GENESIS);
        e1.setEntryHash(chain.hash(LedgerChain.GENESIS, e1, lines1));
        e2.setPrevHash(e1.getEntryHash());
        e2.setEntryHash(chain.hash(e1.getEntryHash(), e2, lines2));

        when(entryRepo.findByBusinessIdAndUserIdOrderByIdAsc(BIZ, USER)).thenReturn(List.of(e1, e2));
        when(lineRepo.findByEntryIdOrderByPositionAsc(1L)).thenReturn(lines1);
        when(lineRepo.findByEntryIdOrderByPositionAsc(2L)).thenReturn(lines2);

        Map<String, Object> ok = service.verifyChain(BIZ, USER);
        assertThat(ok.get("valid")).isEqualTo(true);
        assertThat(ok.get("count")).isEqualTo(2);

        // Now tamper: someone edits e1's first line amount in the DB (hash unchanged).
        lines1.get(0).setDebit(new BigDecimal("5000.00"));
        Map<String, Object> bad = service.verifyChain(BIZ, USER);
        assertThat(bad.get("valid")).isEqualTo(false);
        assertThat(bad.get("firstBrokenEntryId")).isEqualTo(1L);
    }
}
