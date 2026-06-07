package com.mywealthmanagement.realestateservice.deal;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Single source of truth for the deal taxonomy: asset categories and their allowed
 * sub-types, return structures, distribution frequencies, deal statuses, and lead
 * statuses. Exposed to the frontend via {@code GET /api/v1/deals/taxonomy} so the
 * dropdowns and the server-side validation never drift apart.
 */
public final class DealTaxonomy {

    private DealTaxonomy() {
    }

    public static final Set<String> CATEGORIES =
            Set.of("REAL_ESTATE", "BUSINESS", "PRIVATE_EQUITY", "STARTUP", "OTHER");

    /** Allowed subcategories per category. */
    public static final Map<String, List<String>> SUBCATEGORIES = Map.of(
            "REAL_ESTATE", List.of("MULTIFAMILY", "SINGLE_FAMILY", "TOWNHOMES", "CONSTRUCTION", "LAND", "COMMERCIAL", "MIXED_USE"),
            "BUSINESS", List.of("ACQUISITION", "FRANCHISE", "EXPANSION", "GENERAL"),
            "PRIVATE_EQUITY", List.of("BUYOUT", "GROWTH", "VENTURE", "GENERAL"),
            "STARTUP", List.of("PRE_SEED", "SEED", "SERIES_A", "SERIES_B_PLUS", "GENERAL"),
            "OTHER", List.of("GENERAL")
    );

    public static final Set<String> RETURN_TYPES = Set.of("FIXED", "EQUITY", "HYBRID");

    public static final Set<String> DISTRIBUTION_FREQUENCIES =
            Set.of("MONTHLY", "QUARTERLY", "ANNUAL", "AT_EXIT");

    public static final Set<String> STATUSES = Set.of("DRAFT", "OPEN", "CLOSED", "FUNDED");

    public static final Set<String> LEAD_STATUSES = Set.of("NEW", "CONTACTED", "COMMITTED", "PASSED");

    /** True if {@code subcategory} is valid for the given {@code category}. */
    public static boolean isValidSubcategory(String category, String subcategory) {
        List<String> allowed = SUBCATEGORIES.get(category);
        return allowed != null && allowed.contains(subcategory);
    }
}
