package com.mywealthmanagement.businessfinancialsservice.business.manual;

import com.mywealthmanagement.businessfinancialsservice.business.dto.BusinessSummaryDto;
import com.mywealthmanagement.businessfinancialsservice.business.dto.ConsolidatedDashboardDto;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Computes ledger-derived, period-aware KPIs for the business dashboards.
 *
 * <p>Single source of truth: every number comes from {@code business_transactions},
 * {@code business_invoices} and {@code business_accounts}. The consolidated rollup
 * uses the same aggregation with the {@code business_id} filter dropped, so the
 * per-business breakdown always sums to the totals — by construction, not by luck.
 */
@Service
@RequiredArgsConstructor
public class BusinessSummaryService {

    private final ManualBusinessRepository businessRepo;
    private final BusinessAccountRepository accountRepo;
    private final BusinessTransactionRepository transactionRepo;
    private final BusinessInvoiceRepository invoiceRepo;

    /** KPIs for a single business over the resolved period. */
    public BusinessSummaryDto summarize(Long userId, ManualBusiness biz, LocalDate from, LocalDate to) {
        BigDecimal revenue = transactionRepo.sumInflow(userId, biz.getId(), from, to);
        BigDecimal expenses = transactionRepo.sumOutflow(userId, biz.getId(), from, to);
        BigDecimal outstanding = invoiceRepo.sumOutstanding(userId, biz.getId());
        long outstandingCount = invoiceRepo.countOutstanding(userId, biz.getId());

        Balances b = balances(accountRepo.findByBusinessIdAndUserIdOrderByCreatedAtAsc(biz.getId(), userId));

        return new BusinessSummaryDto(
                biz.getId(), biz.getName(),
                revenue, expenses, revenue.subtract(expenses),
                b.cash, b.credit,
                outstanding, outstandingCount);
    }

    /** The consolidated (all-businesses) dashboard for the resolved period. */
    public ConsolidatedDashboardDto consolidate(Long userId, String periodKey, LocalDate from, LocalDate to) {
        List<ManualBusiness> businesses = businessRepo.findByUserIdOrderByCreatedAtAsc(userId);

        List<BusinessSummaryDto> perBusiness = businesses.stream()
                .map(b -> summarize(userId, b, from, to))
                .collect(Collectors.toList());

        // Roll up from the same numbers the per-business rows show, so parts == whole.
        BigDecimal revenue = perBusiness.stream().map(BusinessSummaryDto::getRevenue)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal expenses = perBusiness.stream().map(BusinessSummaryDto::getExpenses)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal cash = perBusiness.stream().map(BusinessSummaryDto::getCashOnHand)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal credit = perBusiness.stream().map(BusinessSummaryDto::getCreditOwed)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal outstanding = perBusiness.stream().map(BusinessSummaryDto::getOutstandingInvoices)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        long outstandingCount = perBusiness.stream()
                .mapToLong(BusinessSummaryDto::getOutstandingInvoiceCount).sum();

        ConsolidatedDashboardDto.Totals totals = new ConsolidatedDashboardDto.Totals(
                perBusiness.size(), revenue, expenses, revenue.subtract(expenses),
                cash, credit, outstanding, outstandingCount);

        return new ConsolidatedDashboardDto(periodKey, from, to, perBusiness, totals);
    }

    /* ---------- balance classification ---------- */

    private record Balances(BigDecimal cash, BigDecimal credit) {}

    /**
     * Splits point-in-time balances into cash (checking/savings) vs. credit owed
     * (credit cards). Case-insensitive and tolerant of null balances/types. LOAN
     * accounts are intentionally excluded from both, matching the current page.
     */
    private Balances balances(List<BusinessAccount> accounts) {
        BigDecimal cash = BigDecimal.ZERO;
        BigDecimal credit = BigDecimal.ZERO;
        for (BusinessAccount a : accounts) {
            BigDecimal bal = a.getBalance() == null ? BigDecimal.ZERO : a.getBalance();
            String type = a.getType() == null ? "" : a.getType().toUpperCase();
            if (type.contains("CREDIT")) {
                credit = credit.add(bal);
            } else if (type.contains("CHECK") || type.contains("SAVING")) {
                cash = cash.add(bal);
            }
        }
        return new Balances(cash, credit);
    }
}
