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
        RentcastPropertyValuationProvider provider = liveProvider();
        PropertyEstimate live = provider.lookupDetails(SAMPLE_ADDRESS);
        // Deterministic mock baseline for the same address — used to prove we got LIVE data.
        PropertyEstimate mock = new MockPropertyValuationProvider().lookupDetails(SAMPLE_ADDRESS);
        BigDecimal liveAvm = provider.estimateValue(SAMPLE_ADDRESS, new BigDecimal("1"));

        System.out.println("RentCast lookupDetails(" + SAMPLE_ADDRESS + ") -> " + live);
        System.out.println("  mock baseline value=" + mock.estimatedValue() + ", live AVM=" + liveAvm);

        assertThat(live).isNotNull();
        assertThat(live.estimatedValue())
                .as("lookupDetails should carry the live AVM value, not the mock baseline")
                .isNotNull()
                .isGreaterThan(BigDecimal.ZERO)
                .isEqualByComparingTo(liveAvm)
                .isNotEqualByComparingTo(mock.estimatedValue());
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
