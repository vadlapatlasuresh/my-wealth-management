package com.mywealthmanagement.authservice.family;

import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * Reads a GUARDIAN's own linked cards and spend transactions from account-aggregation-service, over
 * its internal, {@code X-Internal-Key}-guarded seam ({@code /internal/users/{userId}/...}).
 *
 * <p><b>Why this is safe.</b> Every call passes the guardian's own userId — the same principal the
 * caller is acting as — so it only ever reads that user's data. The Family feature attaches a card
 * only after verifying the caller owns it (via {@link #cardsOf}), and only that owner can sync it.
 * Nothing here reads another user's live bank feed; matched transactions are then materialized as
 * household-owned rows by {@link FamilySpendingService}.
 */
@Component
public class AggregationClient {

    private static final Logger log = LoggerFactory.getLogger(AggregationClient.class);

    private final RestClient restClient;
    private final String internalKey;
    private final boolean enabled;

    public AggregationClient(
            @Value("${service.account-aggregation.url:http://localhost:8082}") String aggregationUrl,
            @Value("${comms.internal.key:${audit.ingest.key:dev-internal-audit-key}}") String internalKey,
            @Value("${family.cards.enabled:true}") boolean enabled) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(2000);
        factory.setReadTimeout(8000);
        this.restClient = RestClient.builder().baseUrl(aggregationUrl).requestFactory(factory).build();
        this.internalKey = internalKey;
        this.enabled = enabled;
    }

    public boolean isEnabled() {
        return enabled;
    }

    /** A guardian's swipeable card/spending accounts. Empty on any failure — never throws. */
    public List<Card> cardsOf(Long userId) {
        List<Card> out = new ArrayList<>();
        if (!enabled) return out;
        try {
            JsonNode body = restClient.get()
                    .uri("/internal/users/{userId}/cards", userId)
                    .header("X-Internal-Key", internalKey)
                    .retrieve()
                    .body(JsonNode.class);
            if (body != null && body.has("cards")) {
                for (JsonNode c : body.get("cards")) {
                    out.add(new Card(
                            c.path("accountId").asLong(),
                            text(c, "name"), text(c, "officialName"), text(c, "mask"),
                            text(c, "type"), text(c, "subtype")));
                }
            }
        } catch (Exception e) {
            log.warn("aggregation cardsOf({}) failed: {}", userId, e.getMessage());
        }
        return out;
    }

    /** A guardian's outflow transactions on the given accounts in a date range. Empty on failure. */
    public List<Txn> transactions(Long userId, List<Long> accountIds, LocalDate from, LocalDate to) {
        List<Txn> out = new ArrayList<>();
        if (!enabled || accountIds == null || accountIds.isEmpty()) return out;
        try {
            String ids = accountIds.stream().map(String::valueOf).reduce((a, b) -> a + "," + b).orElse("");
            JsonNode body = restClient.get()
                    .uri(uri -> uri.path("/internal/users/{userId}/transactions")
                            .queryParam("accountIds", ids)
                            .queryParam("from", from.toString())
                            .queryParam("to", to.toString())
                            .build(userId))
                    .header("X-Internal-Key", internalKey)
                    .retrieve()
                    .body(JsonNode.class);
            if (body != null && body.has("transactions")) {
                for (JsonNode t : body.get("transactions")) {
                    out.add(new Txn(
                            text(t, "externalId"),
                            t.path("accountId").asLong(),
                            text(t, "name"), text(t, "merchantName"), text(t, "category"),
                            new BigDecimal(t.path("spent").asText("0")),
                            LocalDate.parse(t.path("date").asText())));
                }
            }
        } catch (Exception e) {
            log.warn("aggregation transactions({}) failed: {}", userId, e.getMessage());
        }
        return out;
    }

    private static String text(JsonNode n, String field) {
        JsonNode v = n.get(field);
        return v == null || v.isNull() ? null : v.asText();
    }

    public record Card(Long accountId, String name, String officialName, String mask,
                       String type, String subtype) { }

    public record Txn(String externalId, Long accountId, String name, String merchantName,
                      String category, BigDecimal spent, LocalDate date) { }
}
