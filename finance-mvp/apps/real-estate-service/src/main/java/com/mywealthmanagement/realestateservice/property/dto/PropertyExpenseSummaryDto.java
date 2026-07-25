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
    private BigDecimal grandTotal;      // total EXPENSES (incl. labor) for the year
    private BigDecimal totalYtd;        // year-to-date EXPENSE total (incl. labor)
    private BigDecimal totalThisMonth;  // current-month EXPENSE total (incl. labor)
    private long missingReceiptCount;   // rows in the year with a blank receipt ref
    private int expenseCount;           // number of expenses in the year
    private List<CategoryTotal> byCategory; // per-EXPENSE-category totals for the year, desc by amount

    // Income / net position for the year. netIncomeLoss = totalIncome - grandTotal
    // (negative = cash-flow loss). `monthly` carries 12 rows (Jan..Dec) for charts.
    private BigDecimal totalIncome;     // sum of income-category rows for the year
    private BigDecimal netIncomeLoss;   // totalIncome - grandTotal (negative = loss)
    private List<MonthTotal> monthly;   // 12 rows, income & expense per month

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CategoryTotal {
        private String category;
        private BigDecimal total;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class MonthTotal {
        private int month;            // 1..12
        private BigDecimal income;
        private BigDecimal expense;
    }

    /** Convenience for callers that prefer a map view. */
    public static List<CategoryTotal> fromMap(Map<String, BigDecimal> totals) {
        return totals.entrySet().stream()
                .map(e -> new CategoryTotal(e.getKey(), e.getValue()))
                .sorted((a, b) -> b.getTotal().compareTo(a.getTotal()))
                .toList();
    }
}
