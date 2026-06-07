package com.mywealthmanagement.realestateservice.property;

import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Deterministic, offline valuation provider used for demos and local development.
 *
 * A production implementation (e.g. RentCast / ATTOM / Zillow) would call an
 * external API authenticated via the configured {@code realestate.provider.api-key}
 * (see application.properties). This mock derives a stable estimate purely from
 * the address + purchase price so the UI shows consistent numbers.
 */
@Service
public class MockPropertyValuationProvider implements PropertyValuationProvider {

    @Override
    public BigDecimal estimateValue(String address, BigDecimal purchasePrice) {
        if (purchasePrice == null) {
            return BigDecimal.ZERO;
        }
        String key = address == null ? "" : address;
        // Map the address hash into a stable factor in the range ~1.05 - 1.30.
        int bucket = Math.floorMod(key.hashCode(), 26); // 0..25
        BigDecimal factor = BigDecimal.valueOf(1.05)
                .add(BigDecimal.valueOf(bucket).multiply(BigDecimal.valueOf(0.01)));
        return purchasePrice.multiply(factor).setScale(4, RoundingMode.HALF_UP);
    }

    @Override
    public PropertyEstimate lookupDetails(String address) {
        String key = address == null ? "" : address;
        int hash = Math.floorMod(key.hashCode(), 1000); // stable non-negative seed

        int beds = 2 + (hash % 4);                       // 2..5
        BigDecimal baths = BigDecimal.valueOf(1 + (hash % 3)); // 1..3 (x.0)
        int sqft = 900 + (hash % 27) * 100;              // 900..3500
        int yearBuilt = 1960 + (hash % 61);              // 1960..2020

        int pricePerSqft = 180 + (hash % 220);           // $180-$400/sqft
        BigDecimal estimatedValue = BigDecimal.valueOf((long) sqft * pricePerSqft)
                .setScale(4, RoundingMode.HALF_UP);
        BigDecimal rentEstimate = estimatedValue.multiply(BigDecimal.valueOf(0.007))
                .setScale(4, RoundingMode.HALF_UP);

        return new PropertyEstimate(estimatedValue, beds, baths, sqft, yearBuilt, rentEstimate);
    }
}
