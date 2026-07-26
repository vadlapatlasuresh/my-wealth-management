package com.mywealthmanagement.businessfinancialsservice.ledger;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Derives the core financial statements from the general ledger (GL.3): Profit &amp; Loss,
 * Balance Sheet, and a (simplified indirect) Statement of Cash Flows. Everything is computed
 * from journal lines — the ledger is the single source of truth.
 */
@Service
@RequiredArgsConstructor
public class LedgerStatementsService {

    /** Cash & equivalents accounts for the cash-flow statement. */
    private static final Set<String> CASH_CODES = Set.of("1000", "1500");

    private final LedgerService ledger;
    private final LedgerAccountRepository accountRepo;
    private final JournalLineRepository lineRepo;

    /* ---------------- Profit & Loss ---------------- */

    @Transactional(readOnly = true)
    public Map<String, Object> profitAndLoss(Long businessId, Long userId, LocalDate from, LocalDate to) {
        ledger.ensureAccounts(businessId, userId);
        Map<Long, BigDecimal[]> moves = index(lineRepo.sumByAccountBetween(businessId, userId, from, to));
        List<LedgerAccount> accounts = accountRepo.findByBusinessIdAndUserIdOrderByCodeAsc(businessId, userId);

        List<Map<String, Object>> income = new ArrayList<>();
        List<Map<String, Object>> expenses = new ArrayList<>();
        BigDecimal totalIncome = BigDecimal.ZERO;
        BigDecimal totalExpense = BigDecimal.ZERO;
        for (LedgerAccount a : accounts) {
            BigDecimal[] dc = moves.getOrDefault(a.getId(), zero());
            if ("INCOME".equals(a.getType())) {
                BigDecimal amt = dc[1].subtract(dc[0]); // credit-normal
                if (amt.signum() != 0) { income.add(row(a, amt)); totalIncome = totalIncome.add(amt); }
            } else if ("EXPENSE".equals(a.getType())) {
                BigDecimal amt = dc[0].subtract(dc[1]); // debit-normal
                if (amt.signum() != 0) { expenses.add(row(a, amt)); totalExpense = totalExpense.add(amt); }
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("from", from);
        out.put("to", to);
        out.put("income", income);
        out.put("expenses", expenses);
        out.put("totalIncome", totalIncome);
        out.put("totalExpense", totalExpense);
        out.put("netProfit", totalIncome.subtract(totalExpense));
        return out;
    }

    /* ---------------- Balance Sheet ---------------- */

    @Transactional(readOnly = true)
    public Map<String, Object> balanceSheet(Long businessId, Long userId, LocalDate asOf) {
        ledger.ensureAccounts(businessId, userId);
        Map<Long, BigDecimal[]> bal = index(lineRepo.sumByAccountUpTo(businessId, userId, asOf));
        List<LedgerAccount> accounts = accountRepo.findByBusinessIdAndUserIdOrderByCodeAsc(businessId, userId);

        List<Map<String, Object>> assets = new ArrayList<>();
        List<Map<String, Object>> liabilities = new ArrayList<>();
        List<Map<String, Object>> equity = new ArrayList<>();
        BigDecimal totalAssets = BigDecimal.ZERO, totalLiabilities = BigDecimal.ZERO, totalEquity = BigDecimal.ZERO;
        BigDecimal netIncome = BigDecimal.ZERO; // income − expense to date, folded into equity

        for (LedgerAccount a : accounts) {
            BigDecimal[] dc = bal.getOrDefault(a.getId(), zero());
            switch (a.getType()) {
                case "ASSET" -> {
                    BigDecimal amt = dc[0].subtract(dc[1]);
                    if (amt.signum() != 0) { assets.add(row(a, amt)); totalAssets = totalAssets.add(amt); }
                }
                case "LIABILITY" -> {
                    BigDecimal amt = dc[1].subtract(dc[0]);
                    if (amt.signum() != 0) { liabilities.add(row(a, amt)); totalLiabilities = totalLiabilities.add(amt); }
                }
                case "EQUITY" -> {
                    BigDecimal amt = dc[1].subtract(dc[0]);
                    if (amt.signum() != 0) { equity.add(row(a, amt)); totalEquity = totalEquity.add(amt); }
                }
                case "INCOME" -> netIncome = netIncome.add(dc[1].subtract(dc[0]));
                case "EXPENSE" -> netIncome = netIncome.subtract(dc[0].subtract(dc[1]));
                default -> { }
            }
        }
        // Current-period earnings live in equity so the sheet balances.
        if (netIncome.signum() != 0) {
            Map<String, Object> ni = new LinkedHashMap<>();
            ni.put("code", "3900");
            ni.put("name", "Net income (current period)");
            ni.put("type", "EQUITY");
            ni.put("amount", netIncome);
            equity.add(ni);
            totalEquity = totalEquity.add(netIncome);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("asOf", asOf);
        out.put("assets", assets);
        out.put("liabilities", liabilities);
        out.put("equity", equity);
        out.put("totalAssets", totalAssets);
        out.put("totalLiabilities", totalLiabilities);
        out.put("totalEquity", totalEquity);
        out.put("totalLiabilitiesAndEquity", totalLiabilities.add(totalEquity));
        out.put("balanced", totalAssets.compareTo(totalLiabilities.add(totalEquity)) == 0);
        return out;
    }

    /* ---------------- Statement of Cash Flows (indirect, simplified) ---------------- */

    @Transactional(readOnly = true)
    public Map<String, Object> cashFlow(Long businessId, Long userId, LocalDate from, LocalDate to) {
        ledger.ensureAccounts(businessId, userId);
        List<LedgerAccount> accounts = accountRepo.findByBusinessIdAndUserIdOrderByCodeAsc(businessId, userId);
        Map<Long, LedgerAccount> byId = new HashMap<>();
        accounts.forEach(a -> byId.put(a.getId(), a));
        Map<Long, BigDecimal[]> moves = index(lineRepo.sumByAccountBetween(businessId, userId, from, to));

        // Net income for the period.
        Map<String, Object> pnl = profitAndLoss(businessId, userId, from, to);
        BigDecimal netIncome = (BigDecimal) pnl.get("netProfit");

        List<Map<String, Object>> adjustments = new ArrayList<>();
        BigDecimal operating = netIncome;
        for (LedgerAccount a : accounts) {
            BigDecimal[] dc = moves.getOrDefault(a.getId(), zero());
            if ("ASSET".equals(a.getType()) && !CASH_CODES.contains(a.getCode())) {
                // An increase in a non-cash asset (net debit) uses cash.
                BigDecimal change = dc[0].subtract(dc[1]);
                if (change.signum() != 0) { adjustments.add(row(a, change.negate())); operating = operating.subtract(change); }
            } else if ("LIABILITY".equals(a.getType())) {
                // An increase in a liability (net credit) is a source of cash.
                BigDecimal change = dc[1].subtract(dc[0]);
                if (change.signum() != 0) { adjustments.add(row(a, change)); operating = operating.add(change); }
            }
        }

        // Actual cash movement (fact) + beginning/ending balances.
        BigDecimal endingCash = cashBalance(businessId, userId, to);
        BigDecimal beginningCash = cashBalance(businessId, userId, from.minusDays(1));
        BigDecimal netChange = endingCash.subtract(beginningCash);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("from", from);
        out.put("to", to);
        out.put("netIncome", netIncome);
        out.put("operatingAdjustments", adjustments);
        out.put("operatingCash", operating);
        out.put("investingCash", BigDecimal.ZERO); // no investing accounts modelled yet
        out.put("financingCash", netChange.subtract(operating)); // residual (equity draws/contributions etc.)
        out.put("netChangeInCash", netChange);
        out.put("beginningCash", beginningCash);
        out.put("endingCash", endingCash);
        return out;
    }

    private BigDecimal cashBalance(Long businessId, Long userId, LocalDate asOf) {
        Map<Long, BigDecimal[]> bal = index(lineRepo.sumByAccountUpTo(businessId, userId, asOf));
        BigDecimal cash = BigDecimal.ZERO;
        for (LedgerAccount a : accountRepo.findByBusinessIdAndUserIdOrderByCodeAsc(businessId, userId)) {
            if (CASH_CODES.contains(a.getCode())) {
                BigDecimal[] dc = bal.getOrDefault(a.getId(), zero());
                cash = cash.add(dc[0].subtract(dc[1]));
            }
        }
        return cash;
    }

    /* ---------------- helpers ---------------- */

    private static Map<Long, BigDecimal[]> index(List<Object[]> rows) {
        Map<Long, BigDecimal[]> m = new HashMap<>();
        for (Object[] r : rows) {
            m.put(((Number) r[0]).longValue(), new BigDecimal[]{ (BigDecimal) r[1], (BigDecimal) r[2] });
        }
        return m;
    }

    private static Map<String, Object> row(LedgerAccount a, BigDecimal amount) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("code", a.getCode());
        m.put("name", a.getName());
        m.put("type", a.getType());
        m.put("amount", amount);
        return m;
    }

    private static BigDecimal[] zero() {
        return new BigDecimal[]{ BigDecimal.ZERO, BigDecimal.ZERO };
    }
}
