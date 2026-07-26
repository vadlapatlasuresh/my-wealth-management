package com.mywealthmanagement.businessfinancialsservice.ledger;

import java.util.List;

/**
 * The default chart of accounts seeded for a business on first ledger use (GL.1), and the
 * type → normal-balance rule. Codes are the well-known accounts the order-to-cash / P2P /
 * payroll postings target in later slices.
 */
public final class ChartOfAccounts {

    private ChartOfAccounts() {}

    public record Seed(String code, String name, String type) {}

    public static final List<Seed> DEFAULTS = List.of(
            new Seed("1000", "Cash", "ASSET"),
            new Seed("1100", "Accounts Receivable", "ASSET"),
            new Seed("1200", "Inventory", "ASSET"),
            new Seed("1500", "Undeposited Funds", "ASSET"),
            new Seed("2000", "Accounts Payable", "LIABILITY"),
            new Seed("2200", "Sales Tax Payable", "LIABILITY"),
            new Seed("2300", "Payroll Liabilities", "LIABILITY"),
            new Seed("3000", "Owner's Equity", "EQUITY"),
            new Seed("3900", "Retained Earnings", "EQUITY"),
            new Seed("4000", "Sales Income", "INCOME"),
            new Seed("4100", "Service Income", "INCOME"),
            new Seed("5000", "Cost of Goods Sold", "EXPENSE"),
            new Seed("6000", "Operating Expenses", "EXPENSE"),
            new Seed("6100", "Payroll Expense", "EXPENSE"),
            new Seed("6200", "Bank & Merchant Fees", "EXPENSE"));

    /** ASSET / EXPENSE are debit-normal; LIABILITY / EQUITY / INCOME are credit-normal. */
    public static String normalBalance(String type) {
        String t = type == null ? "" : type.toUpperCase();
        return (t.equals("ASSET") || t.equals("EXPENSE")) ? "DEBIT" : "CREDIT";
    }

    public static boolean isValidType(String type) {
        if (type == null) return false;
        return switch (type.toUpperCase()) {
            case "ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE" -> true;
            default -> false;
        };
    }
}
