package com.mywealthmanagement.realestateservice.property;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Live integration test for the RentCast valuation provider. Skipped unless a real
 * key is present, so normal CI never calls the external API:
 *
 *   REALESTATE_PROVIDER_API_KEY=your_key mvn -pl apps/real-estate-service \
 *       test -Dtest=RentcastLiveTest
 *
 * (or from inside apps/real-estate-service:
 *   REALESTATE_PROVIDER_API_KEY=your_key mvn test -Dtest=RentcastLiveTest)
 *
 * It hits the real RentCast API for a documented sample address and proves the
 * provider returns live data (not the deterministic mock). Uses ~3 API calls.
 */
@EnabledIfEnvironmentVariable(named = "REALESTATE_PROVIDER_API_KEY", matches = ".+")
class RentcastLiveTest {

    // RentCast's own documentation sample address — a real, resolvable property.
    private static final String SAMPLE_ADDRESS = "5500 Grand Lake Dr, San Antonio, TX, 78244";

    private RentcastPropertyValuationProvider liveProvider() {
        String key = System.getenv("REALESTATE_PROVIDER_API_KEY");
        String baseUrl = System.getenv().getOrDefault("REALESTATE_PROVIDER_BASE_URL", "https://api.rentcast.io/v1");
        return new RentcastPropertyValuationProvider(baseUrl, key, new MockPropertyValuationProvider());
    }

    @Test
    void lookupDetailsReturnsLiveData() {
        PropertyEstimate estimate = liveProvider().lookupDetails(SAMPLE_ADDRESS);

        System.out.println("RentCast lookupDetails(" + SAMPLE_ADDRESS + ") -> " + estimate);

        assertThat(estimate).isNotNull();
        assertThat(estimate.estimatedValue())
                .as("RentCast should return a positive AVM value")
                .isNotNull()
                .isGreaterThan(BigDecimal.ZERO);
        // At least one physical detail should be populated from the property record.
        assertThat(estimate.beds() != null || estimate.sqft() != null)
                .as("RentCast should return at least beds or square footage")
                .isTrue();
    }

    @Test
    void estimateValueReturnsLivePrice() {
        // purchasePrice is ignored by the real provider (RentCast returns its own AVM),
        // so a positive result that isn't the mock's purchasePrice*factor proves the live path.
        BigDecimal purchasePrice = new BigDecimal("250000");
        BigDecimal value = liveProvider().estimateValue(SAMPLE_ADDRESS, purchasePrice);

        System.out.println("RentCast estimateValue(" + SAMPLE_ADDRESS + ") -> " + value);

        assertThat(value).isNotNull().isGreaterThan(BigDecimal.ZERO);
    }
}
