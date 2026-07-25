package com.mywealthmanagement.realestateservice.property;

import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Stream;

/**
 * The suggested, tax-relevant categories for a rental property, split into income and
 * expense buckets. Kept server-side so the UI dropdown, the income/expense split in
 * summaries, and exports all share one source of truth. Mirrors the delivered
 * Rental_Property_Expense_Tracker spreadsheet plus the personal-landlord tax categories
 * (Schedule E).
 *
 * These are SUGGESTIONS, not a closed set — a user may enter a custom category. Only
 * income classification is name-based (see {@link #isIncome}); anything not recognized as
 * income is treated as an expense.
 */
public final class ExpenseCategories {

    /** Money coming in. "Rental Income" is auto-selected for linked monthly rent. */
    public static final List<String> INCOME = List.of(
            "Rental Income",
            "Other Income"
    );

    /** Deductible operating expenses + non-cash depreciation. */
    public static final List<String> EXPENSE = List.of(
            "Mortgage Interest Paid",
            "Property Taxes",
            "Insurance & PMI",
            "HOA",
            "Utilities",
            "Repairs",
            "Maintenance (Cleaning & Lawn)",
            "Management Fees",
            "Equipment",
            "Supplies",
            "Travel & Expenses",
            "Advertising Costs",
            "Legal and Professional Fees",
            "State Taxes",
            "Depreciation Value",
            "Other Miscellaneous Expenses"
    );

    /** Income first, then expenses — the order the dropdown renders. */
    public static final List<String> ALL =
            Stream.concat(INCOME.stream(), EXPENSE.stream()).toList();

    private static final Set<String> INCOME_LOWER =
            INCOME.stream().map(s -> s.toLowerCase(Locale.ROOT)).collect(java.util.stream.Collectors.toSet());

    /** True when this category represents money IN (rent, other income). */
    public static boolean isIncome(String category) {
        return category != null && INCOME_LOWER.contains(category.trim().toLowerCase(Locale.ROOT));
    }

    /**
     * A category is valid as long as it's a non-blank label within the column limit.
     * Custom categories are allowed; the DTO's {@code @NotBlank}/{@code @Size} already
     * enforce presence and length, so this is a light backstop.
     */
    public static boolean isValid(String category) {
        return category != null && !category.isBlank() && category.length() <= 60;
    }

    private ExpenseCategories() {
    }
}
