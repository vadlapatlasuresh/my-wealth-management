package com.mywealthmanagement.realestateservice.holding;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Vocabulary for private holdings. Exposed via {@code GET /api/v1/private-holdings/taxonomy}
 * so the UI dropdowns and the server-side validation cannot drift apart.
 */
public final class HoldingTaxonomy {

    private HoldingTaxonomy() {
    }

    public static final Set<String> ENTITY_TYPES =
            Set.of("LLC", "LP", "JV", "SYNDICATION", "FUND", "OTHER");

    public static final Set<String> ASSET_TYPES = Set.of(
            "MULTIFAMILY", "SINGLE_FAMILY", "TOWNHOMES", "CONSTRUCTION", "LAND",
            "COMMERCIAL", "MIXED_USE", "RETAIL", "INDUSTRIAL", "OFFICE", "HOSPITALITY", "OTHER");

    public static final Set<String> STATUSES = Set.of("ACTIVE", "EXITED");

    public static final String CONTRIBUTION = "CONTRIBUTION";
    public static final String DISTRIBUTION = "DISTRIBUTION";

    public static final Set<String> DIRECTIONS = Set.of(CONTRIBUTION, DISTRIBUTION);

    /** Allowed categories per direction. */
    public static final Map<String, List<String>> CATEGORIES = Map.of(
            CONTRIBUTION, List.of("INITIAL", "CAPITAL_CALL"),
            DISTRIBUTION, List.of("RENTAL_INCOME", "RETURN_OF_CAPITAL", "CAPITAL_GAIN",
                    "REFINANCE", "SALE_PROCEEDS"));

    /**
     * Distribution categories that give the user their money back rather than paying them a
     * profit. These reduce the unreturned capital basis; the rest are income or gain.
     */
    public static final Set<String> CAPITAL_RETURNING =
            Set.of("RETURN_OF_CAPITAL", "REFINANCE", "SALE_PROCEEDS");

    public static boolean isValidCategory(String direction, String category) {
        List<String> allowed = CATEGORIES.get(direction);
        return allowed != null && allowed.contains(category);
    }
}
