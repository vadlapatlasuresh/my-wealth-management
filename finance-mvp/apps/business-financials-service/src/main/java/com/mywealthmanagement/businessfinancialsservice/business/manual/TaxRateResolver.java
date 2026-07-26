package com.mywealthmanagement.businessfinancialsservice.business.manual;

import java.util.List;

/**
 * Picks the sales-tax rate for a customer location (order-to-cash, Phase 1.7). A rate matches
 * when every scope field it specifies (country / region / postal) equals the customer's; a
 * null scope field is a wildcard. Among matches the most specific wins (postal &gt; region &gt;
 * country); if nothing scoped matches, the business's default rate is used.
 */
public final class TaxRateResolver {

    private TaxRateResolver() {}

    /** Returns the best-matching rate for the location, or null when none applies. */
    public static BusinessTaxRate resolve(List<BusinessTaxRate> active, String country, String region, String postal) {
        BusinessTaxRate best = null;
        int bestScore = -1;
        BusinessTaxRate fallback = null;
        for (BusinessTaxRate r : active) {
            if (!r.isActive()) continue;
            if (r.isDefault() && fallback == null) fallback = r;
            if (!matches(r, country, region, postal)) continue;
            int score = (r.getPostal() != null ? 4 : 0)
                    + (r.getRegion() != null ? 2 : 0)
                    + (r.getCountry() != null ? 1 : 0);
            if (score > bestScore) { bestScore = score; best = r; }
        }
        return best != null ? best : fallback;
    }

    private static boolean matches(BusinessTaxRate r, String country, String region, String postal) {
        if (r.getPostal() != null && !eq(r.getPostal(), postal)) return false;
        if (r.getRegion() != null && !eq(r.getRegion(), region)) return false;
        if (r.getCountry() != null && !eq(r.getCountry(), country)) return false;
        return true;
    }

    private static boolean eq(String scope, String value) {
        return value != null && scope.trim().equalsIgnoreCase(value.trim());
    }
}
