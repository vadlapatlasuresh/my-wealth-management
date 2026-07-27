package com.mywealthmanagement.businessfinancialsservice.business.manual;

import java.util.List;

/**
 * Matching logic for transaction rules (Phase 3a). Case-insensitive; evaluates rules in order
 * and returns the category of the first active rule that matches the merchant/description.
 */
public final class TxnRuleMatcher {

    private TxnRuleMatcher() {}

    /** Category from the first matching active rule, or null if none match. */
    public static String resolve(List<BusinessTxnRule> rules, String merchant, String description) {
        for (BusinessTxnRule r : rules) {
            if (r.isActive() && matches(r, merchant, description)) return r.getSetCategory();
        }
        return null;
    }

    public static boolean matches(BusinessTxnRule rule, String merchant, String description) {
        String field = "DESCRIPTION".equalsIgnoreCase(rule.getMatchField()) ? description : merchant;
        if (field == null || rule.getMatchValue() == null) return false;
        String hay = field.toLowerCase().trim();
        String needle = rule.getMatchValue().toLowerCase().trim();
        if (needle.isEmpty()) return false;
        return switch (rule.getMatchType() == null ? "CONTAINS" : rule.getMatchType().toUpperCase()) {
            case "EQUALS" -> hay.equals(needle);
            case "STARTS_WITH" -> hay.startsWith(needle);
            default -> hay.contains(needle);
        };
    }
}
