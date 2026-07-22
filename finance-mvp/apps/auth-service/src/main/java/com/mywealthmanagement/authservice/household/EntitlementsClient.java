package com.mywealthmanagement.authservice.household;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.server.ResponseStatusException;

/**
 * Checks a plan entitlement with payment-service.
 *
 * <p>This exists to close the <b>owner-pays</b> gate on the server. Creating a household is the
 * paid action ({@code individual.household}); joining and participating never are, otherwise an
 * invited Free member could not see the household they joined. Gating only in the UI left the
 * API trivially callable by a Free user, which is a revenue hole rather than a security one.
 *
 * <p><b>Fail-closed.</b> If the entitlement cannot be verified we refuse with 503 rather than
 * assume the user is entitled — a gate that silently opens whenever payment-service hiccups is
 * not a gate. Creating a household is a rare, deliberate action, so "try again" is acceptable.
 * Set {@code household.entitlement.enforce=false} to disable the check entirely (local dev and
 * environments where payment-service isn't running).
 */
@Component
public class EntitlementsClient {

    private static final Logger log = LoggerFactory.getLogger(EntitlementsClient.class);

    private final RestClient restClient;
    private final boolean enforce;

    public EntitlementsClient(
            @Value("${payment.uri:http://localhost:8087}") String paymentUri,
            @Value("${household.entitlement.enforce:true}") boolean enforce) {
        this.enforce = enforce;
        this.restClient = RestClient.builder().baseUrl(paymentUri).build();
    }

    /** Throws unless the caller's plan grants {@code featureKey}. */
    public void requireFeature(String featureKey) {
        if (!enforce) {
            return;
        }
        String token = currentBearerToken();
        if (token == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated");
        }

        JsonNode body;
        try {
            body = restClient.get()
                    .uri("/api/v1/subscriptions/entitlements")
                    .header("Authorization", "Bearer " + token)
                    .retrieve()
                    .body(JsonNode.class);
        } catch (Exception e) {
            // Fail CLOSED: we could not prove entitlement, so we do not grant it.
            log.warn("Entitlement check for '{}' failed: {}", featureKey, e.getMessage());
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "We couldn't verify your plan just now. Please try again in a moment.");
        }

        boolean granted = body != null
                && body.path("features").path(featureKey).asBoolean(false);
        if (!granted) {
            // 402 PAYMENT_REQUIRED, not 403: this is "your plan doesn't include it", which is
            // distinct from "you're not allowed here" and lets the UI show an upgrade prompt.
            throw new ResponseStatusException(HttpStatus.PAYMENT_REQUIRED,
                    "Creating a household is part of the Plus plan. Upgrade to start one — "
                            + "joining a household someone else created is always free.");
        }
    }

    /**
     * The caller's raw JWT. The auth filter deliberately stores {@code null} credentials, so we
     * read the header off the in-flight request rather than changing that filter's contract.
     */
    private static String currentBearerToken() {
        var attrs = RequestContextHolder.getRequestAttributes();
        if (!(attrs instanceof ServletRequestAttributes sra)) {
            return null;
        }
        HttpServletRequest req = sra.getRequest();
        String header = req.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) {
            return null;
        }
        return header.substring(7);
    }
}
