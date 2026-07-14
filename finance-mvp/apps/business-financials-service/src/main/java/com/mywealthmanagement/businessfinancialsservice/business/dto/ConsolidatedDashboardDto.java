package com.mywealthmanagement.businessfinancialsservice.business.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * The single top-level dashboard across every business the user owns. Read-only.
 *
 * <p>{@code businesses} is the per-business breakdown and {@code totals} is the
 * rollup. Both come from the same aggregation with/without the {@code business_id}
 * filter, so the parts always sum to the whole — no client-side re-summing, no drift.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ConsolidatedDashboardDto {
    private String period;   // resolved period key, e.g. THIS_MONTH | THIS_YEAR | T12M | CUSTOM
    private LocalDate from;
    private LocalDate to;

    private List<BusinessSummaryDto> businesses;
    private Totals totals;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Totals {
        private int businessCount;
        private BigDecimal revenue;
        private BigDecimal expenses;
        private BigDecimal netProfit;
        private BigDecimal cashOnHand;
        private BigDecimal creditOwed;
        private BigDecimal outstandingInvoices;
        private long outstandingInvoiceCount;
    }
}
