package com.mywealthmanagement.realestateservice.property.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * Rolled-up expense figures for one property. {@code totalYtd} and {@code totalThisMonth}
 * are relative to today; {@code grandTotal} and {@code byCategory} are for the requested
 * {@code year} (the whole list when no year is filtered).
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class PropertyExpenseSummaryDto {
    private Long propertyId;
    private Integer year;               // the year the by-category / grandTotal covers
    private BigDecimal grandTotal;      // total (incl. labor) for the year
    private BigDecimal totalYtd;        // year-to-date total (incl. labor)
    private BigDecimal totalThisMonth;  // current-month total (incl. labor)
    private long missingReceiptCount;   // rows in the year with a blank receipt ref
    private int expenseCount;           // number of expenses in the year
    private List<CategoryTotal> byCategory; // per-category totals for the year, desc by amount

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CategoryTotal {
        private String category;
        private BigDecimal total;
    }

    /** Convenience for callers that prefer a map view. */
    public static List<CategoryTotal> fromMap(Map<String, BigDecimal> totals) {
        return totals.entrySet().stream()
                .map(e -> new CategoryTotal(e.getKey(), e.getValue()))
                .sorted((a, b) -> b.getTotal().compareTo(a.getTotal()))
                .toList();
    }
}
