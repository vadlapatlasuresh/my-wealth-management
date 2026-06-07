package com.mywealthmanagement.realestateservice.property;

import java.math.BigDecimal;

/**
 * A lightweight estimate of a property's value and physical details, derived from
 * an address by a {@link PropertyValuationProvider}. Returned by the lookup
 * endpoint so the UI can auto-fill a new property form. Not persisted directly.
 */
public record PropertyEstimate(
        BigDecimal estimatedValue,
        Integer beds,
        BigDecimal baths,
        Integer sqft,
        Integer yearBuilt,
        BigDecimal rentEstimate
) {
}
