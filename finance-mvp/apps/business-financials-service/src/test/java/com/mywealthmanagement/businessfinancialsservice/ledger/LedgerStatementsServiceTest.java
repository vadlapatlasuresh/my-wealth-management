package com.mywealthmanagement.businessfinancialsservice.ledger;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * Financial statements derived from the ledger (GL.3). Scenario: an invoice for $108
 * (income $100 + tax $8) is issued and paid — so Cash $108, AR $0, Tax Payable $8,
 * Income $100. The three statements must reflect that and the Balance Sheet must balance.
 */
@ExtendWith(MockitoExtension.class)
class LedgerStatementsServiceTest {

    private static final long USER = 1L;
    private static final long BIZ = 7L;
    private static final LocalDate FROM = LocalDate.of(2026, 1, 1);
    private static final LocalDate TO = LocalDate.of(2026, 12, 31);

    @Mock private LedgerService ledger;
    @Mock private LedgerAccountRepository accountRepo;
    @Mock private JournalLineRepository lineRepo;
    @InjectMocks private LedgerStatementsService svc;

    private LedgerAccount acct(long id, String code, String type) {
        LedgerAccount a = new LedgerAccount();
        a.setId(id); a.setUserId(USER); a.setBusinessId(BIZ);
        a.setCode(code); a.setName(code); a.setType(type);
        a.setNormalBalance(ChartOfAccounts.normalBalance(type));
        return a;
    }

    private Object[] sum(long accountId, String debit, String credit) {
        return new Object[]{ accountId, new BigDecimal(debit), new BigDecimal(credit) };
    }

    private void chart() {
        lenient().when(accountRepo.findByBusinessIdAndUserIdOrderByCodeAsc(BIZ, USER)).thenReturn(List.of(
                acct(1000, "1000", "ASSET"), acct(1100, "1100", "ASSET"),
                acct(2200, "2200", "LIABILITY"), acct(4000, "4000", "INCOME")));
    }

    @Test
    void profitAndLoss_reportsIncomeAndNet() {
        chart();
        when(lineRepo.sumByAccountBetween(BIZ, USER, FROM, TO)).thenReturn(List.<Object[]>of(sum(4000, "0", "100.00")));

        Map<String, Object> pnl = svc.profitAndLoss(BIZ, USER, FROM, TO);

        assertThat((BigDecimal) pnl.get("totalIncome")).isEqualByComparingTo("100.00");
        assertThat((BigDecimal) pnl.get("totalExpense")).isEqualByComparingTo("0");
        assertThat((BigDecimal) pnl.get("netProfit")).isEqualByComparingTo("100.00");
    }

    @Test
    void balanceSheet_balancesAssetsToLiabilitiesPlusEquity() {
        chart();
        when(lineRepo.sumByAccountUpTo(BIZ, USER, TO)).thenReturn(List.<Object[]>of(
                sum(1000, "108.00", "0"),     // cash
                sum(1100, "108.00", "108.00"),// AR net 0
                sum(2200, "0", "8.00"),       // tax payable
                sum(4000, "0", "100.00")));   // income -> equity via net income

        Map<String, Object> bs = svc.balanceSheet(BIZ, USER, TO);

        assertThat((BigDecimal) bs.get("totalAssets")).isEqualByComparingTo("108.00");
        assertThat((BigDecimal) bs.get("totalLiabilities")).isEqualByComparingTo("8.00");
        assertThat((BigDecimal) bs.get("totalEquity")).isEqualByComparingTo("100.00"); // net income
        assertThat(bs.get("balanced")).isEqualTo(true);
    }

    @Test
    void cashFlow_reconcilesToNetChangeInCash() {
        chart();
        // Period movements (same as cumulative since it's the only activity).
        when(lineRepo.sumByAccountBetween(BIZ, USER, FROM, TO)).thenReturn(List.<Object[]>of(
                sum(1000, "108.00", "0"), sum(1100, "108.00", "108.00"),
                sum(2200, "0", "8.00"), sum(4000, "0", "100.00")));
        when(lineRepo.sumByAccountUpTo(BIZ, USER, TO)).thenReturn(List.<Object[]>of(
                sum(1000, "108.00", "0"), sum(2200, "0", "8.00"), sum(4000, "0", "100.00")));
        when(lineRepo.sumByAccountUpTo(eq(BIZ), eq(USER), eq(FROM.minusDays(1)))).thenReturn(List.of());

        Map<String, Object> cf = svc.cashFlow(BIZ, USER, FROM, TO);

        assertThat((BigDecimal) cf.get("netIncome")).isEqualByComparingTo("100.00");
        assertThat((BigDecimal) cf.get("operatingCash")).isEqualByComparingTo("108.00"); // 100 + 8 tax
        assertThat((BigDecimal) cf.get("endingCash")).isEqualByComparingTo("108.00");
        assertThat((BigDecimal) cf.get("netChangeInCash")).isEqualByComparingTo("108.00");
        assertThat((BigDecimal) cf.get("financingCash")).isEqualByComparingTo("0");
    }
}
