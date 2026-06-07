package com.mywealthmanagement.aiinsightsservice.provider;

import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.math.BigDecimal;

/**
 * Fetches the authenticated user's real financial snapshot (net worth, cash,
 * investments, debts, real-estate equity) from the financial-core service via the
 * API gateway, and renders it as a compact text block suitable for inclusion in an
 * LLM prompt.
 * <p>
 * The current request's bearer token is propagated so the downstream service scopes
 * the snapshot to the same user. If the snapshot cannot be fetched (service down,
 * no token, etc.) an empty string is returned and the caller degrades gracefully to
 * a context-free prompt rather than failing the request.
 */
@Component
public class FinancialSummaryClient {

    private static final Logger log = LoggerFactory.getLogger(FinancialSummaryClient.class);

    private final RestClient restClient;

    public FinancialSummaryClient(@Value("${api-gateway.url:http://localhost:8080}") String gatewayUrl) {
        this.restClient = RestClient.builder().baseUrl(gatewayUrl).build();
    }

    /**
     * @return a human-readable summary of the user's finances, or "" if unavailable.
     */
    public String fetchSummaryText() {
        String token = currentToken();
        if (token == null || token.isBlank()) {
            return "";
        }
        try {
            JsonNode snap = restClient.get()
                    .uri("/api/v1/me/snapshot")
                    .header("Authorization", "Bearer " + token)
                    .retrieve()
                    .body(JsonNode.class);
            return format(snap);
        } catch (Exception e) {
            log.warn("Could not fetch financial summary for AI context: {}", e.getMessage());
            return "";
        }
    }

    private String format(JsonNode snap) {
        if (snap == null || snap.isMissingNode()) {
            return "";
        }
        JsonNode netWorth = snap.path("netWorth");
        JsonNode c = snap.path("components");

        StringBuilder sb = new StringBuilder();
        sb.append("The user's current financial snapshot (USD):\n");
        appendMoney(sb, "Net worth", netWorth.path("total"));
        appendMoney(sb, "Net worth change (last 30 days)", netWorth.path("change30d"));
        appendMoney(sb, "Cash", c.path("cash"));
        appendMoney(sb, "Investments", c.path("investments"));
        appendMoney(sb, "Credit card balances", c.path("creditCards"));
        appendMoney(sb, "Loans", c.path("loans"));
        appendMoney(sb, "Real estate value", c.path("realEstateValue"));
        appendMoney(sb, "Real estate equity", c.path("realEstateEquity"));
        return sb.toString();
    }

    private void appendMoney(StringBuilder sb, String label, JsonNode value) {
        if (value == null || value.isMissingNode() || value.isNull()) {
            return;
        }
        BigDecimal amount = value.decimalValue();
        sb.append("- ").append(label).append(": $").append(amount.toPlainString()).append("\n");
    }

    /** The raw JWT, stored by JwtAuthFilter as the authentication credentials. */
    private String currentToken() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) {
            return null;
        }
        Object credentials = auth.getCredentials();
        return credentials == null ? null : credentials.toString();
    }
}
