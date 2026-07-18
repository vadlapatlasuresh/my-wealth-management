package com.mywealthmanagement.realestateservice.property;

import java.util.List;

/**
 * The fixed set of tax-relevant rental expense categories. Kept server-side so the UI
 * dropdown, validation, and summaries all share one source of truth. Mirrors the
 * categories in the delivered Rental_Property_Expense_Tracker spreadsheet.
 */
public final class ExpenseCategories {

    public static final List<String> ALL = List.of(
            "Cleaning Expenses",
            "Maintenance Expenses",
            "Repairs",
            "Property Management Fees",
            "Advertising Costs",
            "Utilities",
            "Insurance",
            "Property Taxes",
            "Mortgage Interest",
            "Legal and Professional Fees",
            "Supplies",
            "Travel Expenses",
            "Other Miscellaneous Expenses"
    );

    public static boolean isValid(String category) {
        return category != null && ALL.contains(category);
    }

    private ExpenseCategories() {
    }
}
