package com.mywealthmanagement.aiinsightsservice.provider;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * Does the caller's plan include Priority AI ({@code individual.priorityAi})?
 *
 * <p><b>Fail-OPEN to standard, deliberately — the opposite of the household gate.</b>
 * auth-service's EntitlementsClient fails CLOSED because creating a household is a rare, paid,
 * deliberate action where "try again in a moment" is an acceptable answer. Chat is neither rare
 * nor deliberate: it is the thing a user does when they are already confused about their money.
 * If payment-service hiccups, the correct outcome is a slightly less clever answer, not an
 * error page. A Premium user briefly getting standard routing costs nothing; a broken assistant
 * costs trust.
 *
 * <p>Config: {@code ai.priority.enabled=false} disables the capability outright (everyone gets
 * standard routing, no entitlement call at all). {@code ai.priority.enforce=false} skips the
 * check and treats every caller as entitled — for local dev where payment-service isn't running.
 */
@Component
public class PriorityEntitlementClient {

    public static final String FEATURE_KEY = "individual.priorityAi";

    private static final Logger log = LoggerFactory.getLogger(PriorityEntitlementClient.class);

    private final RestClient restClient;
    private final boolean enabled;
    private final boolean enforce;

    public PriorityEntitlementClient(
            @Value("${payment.uri:http://localhost:8087}") String paymentUri,
            @Value("${ai.priority.enabled:true}") boolean enabled,
            @Value("${ai.priority.enforce:true}") boolean enforce) {
        this.restClient = RestClient.builder().baseUrl(paymentUri).build();
        this.enabled = enabled;
        this.enforce = enforce;
    }

    /** Whether the capability is switched on at all for this deployment. */
    public boolean isEnabled() {
        return enabled;
    }

    /** True when this caller should get priority routing for the current turn. */
    public boolean hasPriority() {
        if (!enabled) {
            return false;
        }
        if (!enforce) {
            return true;
        }
        String token = currentBearerToken();
        if (token == null) {
            return false;
        }
        try {
            JsonNode body = restClient.get()
                    .uri("/api/v1/subscriptions/entitlements")
                    .header("Authorization", "Bearer " + token)
                    .retrieve()
                    .body(JsonNode.class);
            return body != null && body.path("features").path(FEATURE_KEY).asBoolean(false);
        } catch (Exception e) {
            // Standard routing, not a failure. See the class comment.
            log.debug("Priority-AI entitlement check failed ({}); using standard routing.", e.getMessage());
            return false;
        }
    }

    /** The caller's raw JWT — the auth filter stores null credentials, so read the header. */
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
