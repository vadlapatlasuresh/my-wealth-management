package com.mywealthmanagement.businessfinancialsservice.ledger;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Double-entry invariants of the general ledger (GL.1). */
@ExtendWith(MockitoExtension.class)
class LedgerServiceTest {

    private static final long USER = 1L;
    private static final long BIZ = 7L;

    @Mock private LedgerAccountRepository accountRepo;
    @Mock private JournalEntryRepository entryRepo;
    @Mock private JournalLineRepository lineRepo;
    @Mock private LedgerChain chain;

    @InjectMocks private LedgerService ledger;

    private LedgerAccount account(long id, String code, String type) {
        LedgerAccount a = new LedgerAccount();
        a.setId(id); a.setUserId(USER); a.setBusinessId(BIZ);
        a.setCode(code); a.setName(code); a.setType(type);
        a.setNormalBalance(ChartOfAccounts.normalBalance(type));
        return a;
    }

    private void chartExists() {
        lenient().when(accountRepo.existsByBusinessId(BIZ)).thenReturn(true);
        lenient().when(accountRepo.findByBusinessIdAndCode(BIZ, "1100")).thenReturn(Optional.of(account(11, "1100", "ASSET")));
        lenient().when(accountRepo.findByBusinessIdAndCode(BIZ, "4000")).thenReturn(Optional.of(account(40, "4000", "INCOME")));
    }

    private LedgerService.LineInput line(String code, String debit, String credit) {
        return new LedgerService.LineInput(code, debit == null ? null : new BigDecimal(debit),
                credit == null ? null : new BigDecimal(credit), null);
    }

    @Test
    void ensureAccounts_seedsDefaultsWhenEmpty() {
        when(accountRepo.existsByBusinessId(BIZ)).thenReturn(false);
        when(accountRepo.findByBusinessIdAndUserIdOrderByCodeAsc(BIZ, USER)).thenReturn(List.of());

        ledger.ensureAccounts(BIZ, USER);

        verify(accountRepo).saveAll(any());
    }

    @Test
    void post_savesBalancedEntry() {
        chartExists();
        when(entryRepo.save(any(JournalEntry.class))).thenAnswer(i -> { JournalEntry e = i.getArgument(0); e.setId(100L); return e; });
        when(lineRepo.saveAll(any())).thenAnswer(i -> i.getArgument(0));

        JournalEntry e = ledger.post(BIZ, USER, LocalDate.of(2026, 7, 26), "Invoice", "INVOICE", "500",
                List.of(line("1100", "1100.00", null), line("4000", null, "1100.00")));

        assertThat(e.getId()).isEqualTo(100L);
        assertThat(e.getLines()).hasSize(2);
        assertThat(e.getSourceType()).isEqualTo("INVOICE");
    }

    @Test
    void post_rejectsUnbalancedEntry() {
        chartExists();
        assertThatThrownBy(() -> ledger.post(BIZ, USER, null, null, null, null,
                List.of(line("1100", "100.00", null), line("4000", null, "50.00"))))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("does not balance");
    }

    @Test
    void post_rejectsLineThatIsBothDebitAndCredit() {
        chartExists();
        assertThatThrownBy(() -> ledger.post(BIZ, USER, null, null, null, null,
                List.of(line("1100", "10.00", "10.00"), line("4000", null, "10.00"))))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("either a debit or a credit");
    }

    @Test
    void reverse_swapsDebitsAndCredits_andRefusesDoubleReversal() {
        JournalEntry original = new JournalEntry();
        original.setId(100L); original.setUserId(USER); original.setBusinessId(BIZ);
        JournalLine l1 = new JournalLine(); l1.setAccountId(11L); l1.setDebit(new BigDecimal("1100.00")); l1.setCredit(BigDecimal.ZERO); l1.setPosition(0);
        JournalLine l2 = new JournalLine(); l2.setAccountId(40L); l2.setDebit(BigDecimal.ZERO); l2.setCredit(new BigDecimal("1100.00")); l2.setPosition(1);
        when(entryRepo.findByIdAndBusinessIdAndUserId(100L, BIZ, USER)).thenReturn(Optional.of(original));
        when(entryRepo.existsByBusinessIdAndReversalOf(BIZ, 100L)).thenReturn(false, true);
        when(lineRepo.findByEntryIdOrderByPositionAsc(100L)).thenReturn(List.of(l1, l2));
        when(entryRepo.save(any(JournalEntry.class))).thenAnswer(i -> { JournalEntry e = i.getArgument(0); e.setId(101L); return e; });
        when(lineRepo.saveAll(any())).thenAnswer(i -> i.getArgument(0));

        JournalEntry rev = ledger.reverse(BIZ, USER, 100L, null, null);

        assertThat(rev.getReversalOf()).isEqualTo(100L);
        assertThat(rev.getSourceType()).isEqualTo("REVERSAL");
        assertThat(rev.getLines().get(0).getCredit()).isEqualByComparingTo("1100.00"); // was a debit
        assertThat(rev.getLines().get(1).getDebit()).isEqualByComparingTo("1100.00");  // was a credit

        // Second attempt is refused.
        assertThatThrownBy(() -> ledger.reverse(BIZ, USER, 100L, null, null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("already been reversed");
    }

    @Test
    void trialBalance_netsDebitsAndCreditsAndBalances() {
        when(accountRepo.existsByBusinessId(BIZ)).thenReturn(true);
        when(lineRepo.sumByAccount(BIZ, USER)).thenReturn(List.<Object[]>of(
                new Object[]{ 11L, new BigDecimal("1100.00"), new BigDecimal("0") },
                new Object[]{ 40L, new BigDecimal("0"), new BigDecimal("1100.00") }));
        when(accountRepo.findByBusinessIdAndUserIdOrderByCodeAsc(BIZ, USER))
                .thenReturn(List.of(account(11, "1100", "ASSET"), account(40, "4000", "INCOME")));

        Map<String, Object> tb = ledger.trialBalance(BIZ, USER);

        assertThat(tb.get("balanced")).isEqualTo(true);
        assertThat((BigDecimal) tb.get("totalDebit")).isEqualByComparingTo("1100.00");
        assertThat((BigDecimal) tb.get("totalCredit")).isEqualByComparingTo("1100.00");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = (List<Map<String, Object>>) tb.get("rows");
        assertThat(rows).hasSize(2);
    }
}
