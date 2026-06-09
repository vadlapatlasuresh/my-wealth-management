package com.mywealthmanagement.realestateservice.property;

import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Real {@link PropertyValuationProvider} backed by the RentCast AVM API
 * (https://developers.rentcast.io). Active only when
 * {@code realestate.provider=rentcast} and marked {@link Primary} so it is
 * injected ahead of {@link MockPropertyValuationProvider} when present.
 * <p>
 * Requires {@code REALESTATE_PROVIDER_API_KEY}. If the key is missing or any
 * call fails, it degrades to the deterministic mock so the real-estate flow
 * never hard-fails (mirrors {@code StripePaymentProvider}). The same shape of
 * client works for ATTOM/Zillow — only the endpoints and field names change.
 */
@Service
@Primary
@ConditionalOnProperty(name = "realestate.provider", havingValue = "rentcast")
public class RentcastPropertyValuationProvider implements PropertyValuationProvider {

    private static final Logger log = LoggerFactory.getLogger(RentcastPropertyValuationProvider.class);

    private final RestClient restClient;
    private final String apiKey;
    private final MockPropertyValuationProvider fallback;

    public RentcastPropertyValuationProvider(
            @Value("${realestate.provider.base-url:https://api.rentcast.io/v1}") String baseUrl,
            @Value("${realestate.provider.api-key:}") String apiKey,
            MockPropertyValuationProvider fallback) {
        this.restClient = RestClient.builder().baseUrl(baseUrl).build();
        this.apiKey = apiKey;
        this.fallback = fallback;
    }

    private boolean disabled() {
        return apiKey == null || apiKey.isBlank();
    }

    private JsonNode get(String path, String address) {
        String uri = UriComponentsBuilder.fromPath(path)
                .queryParam("address", address)
                .toUriString();
        return restClient.get()
                .uri(uri)
                .header("X-Api-Key", apiKey)
                .header("Accept", "application/json")
                .retrieve()
                .body(JsonNode.class);
    }

    @Override
    public BigDecimal estimateValue(String address, BigDecimal purchasePrice) {
        if (disabled() || address == null || address.isBlank()) {
            return fallback.estimateValue(address, purchasePrice);
        }
        try {
            JsonNode avm = get("/avm/value", address);
            if (avm != null && avm.hasNonNull("price")) {
                return avm.get("price").decimalValue().setScale(4, RoundingMode.HALF_UP);
            }
            log.warn("RentCast AVM value response missing price for '{}'; using mock estimate.", address);
        } catch (Exception e) {
            log.warn("RentCast AVM value lookup failed ({}); using mock estimate.", e.getMessage());
        }
        return fallback.estimateValue(address, purchasePrice);
    }

    @Override
    public PropertyEstimate lookupDetails(String address) {
        if (disabled() || address == null || address.isBlank()) {
            return fallback.lookupDetails(address);
        }
        try {
            JsonNode avm = get("/avm/value", address);
            BigDecimal estimatedValue = avm != null && avm.hasNonNull("price")
                    ? avm.get("price").decimalValue().setScale(4, RoundingMode.HALF_UP)
                    : null;

            // Physical details come from the property record endpoint (returns an array).
            JsonNode props = get("/properties", address);
            JsonNode record = props != null && props.isArray() && props.size() > 0 ? props.get(0)
                    : (props != null && props.isObject() ? props : null);

            Integer beds = intOrNull(record, "bedrooms");
            BigDecimal baths = decimalOrNull(record, "bathrooms");
            Integer sqft = intOrNull(record, "squareFootage");
            Integer yearBuilt = intOrNull(record, "yearBuilt");

            // Long-term rent estimate (best-effort).
            BigDecimal rentEstimate = null;
            try {
                JsonNode rent = get("/avm/rent/long-term", address);
                if (rent != null && rent.hasNonNull("rent")) {
                    rentEstimate = rent.get("rent").decimalValue().setScale(4, RoundingMode.HALF_UP);
                }
            } catch (Exception ignored) {
                // rent is optional; leave null and let the mock fill if everything else failed
            }

            // If the core value lookup yielded nothing, fall back wholesale for a coherent record.
            if (estimatedValue == null && beds == null && sqft == null) {
                return fallback.lookupDetails(address);
            }
            PropertyEstimate mock = fallback.lookupDetails(address);
            return new PropertyEstimate(
                    estimatedValue != null ? estimatedValue : mock.estimatedValue(),
                    beds != null ? beds : mock.beds(),
                    baths != null ? baths : mock.baths(),
                    sqft != null ? sqft : mock.sqft(),
                    yearBuilt != null ? yearBuilt : mock.yearBuilt(),
                    rentEstimate != null ? rentEstimate : mock.rentEstimate()
            );
        } catch (Exception e) {
            log.warn("RentCast property lookup failed ({}); using mock details.", e.getMessage());
            return fallback.lookupDetails(address);
        }
    }

    private Integer intOrNull(JsonNode node, String field) {
        return node != null && node.hasNonNull(field) ? node.get(field).asInt() : null;
    }

    private BigDecimal decimalOrNull(JsonNode node, String field) {
        return node != null && node.hasNonNull(field) ? node.get(field).decimalValue() : null;
    }
}
