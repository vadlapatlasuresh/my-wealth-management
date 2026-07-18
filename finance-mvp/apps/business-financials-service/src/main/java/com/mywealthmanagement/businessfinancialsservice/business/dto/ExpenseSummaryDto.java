package com.mywealthmanagement.businessfinancialsservice.business.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.List;

/**
 * Rolled-up expense figures for one business, or for every business when returned by the
 * consolidated endpoint (in which case {@link #byBusiness} is populated).
 *
 * <p>{@link #standaloneTotal} and {@link #linkedTotal} are reported separately on purpose:
 * only the standalone portion is spend that the transaction ledger does not already know
 * about, so the caller can reconcile against P&amp;L without double-counting.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ExpenseSummaryDto {
    private Long businessId;          // null for the consolidated (all-businesses) summary
    private String from;              // ISO date, inclusive
    private String to;                // ISO date, inclusive

    private BigDecimal total;             // standaloneTotal + linkedTotal
    private BigDecimal standaloneTotal;   // NEW spend, not in the ledger
    private BigDecimal linkedTotal;       // documents ledger spend — do NOT add to P&L

    private int count;
    private int missingReceiptCount;
    private int uncategorizedCount;

    private List<Bucket> byCategory;
    private List<Bucket> byVendor;
    private List<Bucket> byMonth;     // label = YYYY-MM, ascending — drives the trend chart
    private List<Bucket> byBusiness;  // consolidated only; label = business name

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Bucket {
        private String label;
        private BigDecimal total;
        private int count;
    }
}
