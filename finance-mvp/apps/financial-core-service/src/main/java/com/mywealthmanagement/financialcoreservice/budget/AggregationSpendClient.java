package com.mywealthmanagement.financialcoreservice.budget;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.math.BigDecimal;
import java.util.Map;

/**
 * Server-to-server lookup of a user's monthly expense total from account-aggregation
 * (shared X-Internal-Key). The weekly budget job has no per-user JWT, so it can't use
 * the normal gateway path; this hits account-aggregation's internal spend endpoint
 * directly. Best-effort: returns null when spend can't be resolved, so the digest can
 * still go out with just the budgeted figure.
 */
@Component
public class AggregationSpendClient {

    private static final Logger log = LoggerFactory.getLogger(AggregationSpendClient.class);

    private final RestClient http;
    private final String internalKey;

    public AggregationSpendClient(
            @Value("${service.account-aggregation.url:http://localhost:8082}") String baseUrl,
            @Value("${audit.ingest.key:${internal.key:dev-internal-audit-key}}") String internalKey) {
        this.http = RestClient.builder().baseUrl(baseUrl).build();
        this.internalKey = internalKey;
    }

    /** Total expense spend for the user in {@code month} (YYYY-MM), or null if unavailable. */
    public BigDecimal spendForMonth(Long userId, String month) {
        if (userId == null) return null;
        try {
            Map<?, ?> res = http.get()
                    .uri("/internal/users/{id}/spend?month={m}", userId, month)
                    .header("X-Internal-Key", internalKey)
                    .retrieve()
                    .body(Map.class);
            Object spent = res == null ? null : res.get("spent");
            return spent == null ? null : new BigDecimal(spent.toString());
        } catch (Exception e) {
            log.debug("spend lookup failed for user {} month {}: {}", userId, month, e.getMessage());
            return null;
        }
    }
}
