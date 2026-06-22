package com.mywealthmanagement.accountaggregationservice.transaction;

import java.util.List;
import java.util.Locale;

/** Pure rule matching (no DB) — the first rule (in order) that matches a merchant name
 *  wins. Case-insensitive. Easily unit-tested. */
public final class CategoryRuleMatcher {

    private CategoryRuleMatcher() {}

    /** The category to apply for {@code name}, or null if no rule matches. */
    public static String categoryFor(String name, List<CategoryRule> rules) {
        if (name == null || rules == null) return null;
        String n = name.toLowerCase(Locale.ROOT);
        for (CategoryRule r : rules) {
            String p = r.getPattern() == null ? "" : r.getPattern().toLowerCase(Locale.ROOT);
            if (p.isEmpty()) continue;
            boolean hit = switch (r.getMatchType() == null ? "" : r.getMatchType().toUpperCase(Locale.ROOT)) {
                case "EQUALS" -> n.equals(p);
                case "STARTS_WITH" -> n.startsWith(p);
                default -> n.contains(p); // CONTAINS (default)
            };
            if (hit) return r.getCategory();
        }
        return null;
    }
}
