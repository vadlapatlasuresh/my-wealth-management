package com.mywealthmanagement.realestateservice.deal;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Single source of truth for the directory taxonomy: listing categories, their allowed
 * descriptive property types, and listing statuses. Exposed to the frontend via
 * {@code GET /api/v1/deals/taxonomy} so the dropdowns and the server-side validation
 * never drift apart.
 *
 * <p>Every term here is descriptive of the physical property. Nothing in this taxonomy
 * describes returns, yield, or deal structure — those categories were removed when the
 * board became a passive directory.
 */
public final class DealTaxonomy {

    private DealTaxonomy() {
    }

    public static final Set<String> CATEGORIES = Set.of("REAL_ESTATE", "BUSINESS", "OTHER");

    /** Allowed descriptive property types per category. */
    public static final Map<String, List<String>> SUBCATEGORIES = Map.of(
            "REAL_ESTATE", List.of("MULTIFAMILY", "SINGLE_FAMILY", "TOWNHOMES", "CONSTRUCTION", "LAND", "COMMERCIAL", "MIXED_USE"),
            "BUSINESS", List.of("RETAIL", "INDUSTRIAL", "OFFICE", "HOSPITALITY", "GENERAL"),
            "OTHER", List.of("GENERAL")
    );

    public static final Set<String> STATUSES = Set.of("DRAFT", "OPEN", "CLOSED");

    /** True if {@code subcategory} is valid for the given {@code category}. */
    public static boolean isValidSubcategory(String category, String subcategory) {
        List<String> allowed = SUBCATEGORIES.get(category);
        return allowed != null && allowed.contains(subcategory);
    }
}
