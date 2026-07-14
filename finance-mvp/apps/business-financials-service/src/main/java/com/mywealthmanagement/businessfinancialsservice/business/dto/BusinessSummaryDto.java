package com.mywealthmanagement.businessfinancialsservice.business.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

/**
 * Ledger-derived KPIs for a single business over a chosen period. Every figure
 * here is computed from {@code business_transactions}, {@code business_invoices}
 * and {@code business_accounts} — there is no stored/denormalized snapshot, so a
 * per-business summary and the consolidated rollup can never disagree.
 *
 * <p>Flow metrics ({@code revenue}, {@code expenses}, {@code netProfit}) are
 * summed over [from, to]. Balances ({@code cashOnHand}, {@code creditOwed}) and
 * {@code outstandingInvoices} are point-in-time (today), independent of period.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class BusinessSummaryDto {
    private Long businessId;
    private String name;

    // Period flows
    private BigDecimal revenue;
    private BigDecimal expenses;
    private BigDecimal netProfit;

    // Point-in-time balances (today), independent of the selected period
    private BigDecimal cashOnHand;
    private BigDecimal creditOwed;

    // Point-in-time accounts-receivable
    private BigDecimal outstandingInvoices;
    private long outstandingInvoiceCount;
}
