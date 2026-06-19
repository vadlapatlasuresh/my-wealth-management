package com.mywealthmanagement.notificationservice.comms;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Map;

/**
 * Resolves a user's email from auth-service so notification-service can email an alert
 * for a user it only knows by id. Server-to-server with the shared X-Internal-Key.
 * Best-effort: returns null (skip email) if the lookup fails.
 */
@Component
public class AuthEmailClient {

    private static final Logger log = LoggerFactory.getLogger(AuthEmailClient.class);

    private final RestClient http;
    private final String internalKey;

    public AuthEmailClient(
            @Value("${service.auth.url:http://localhost:8081}") String authUrl,
            @Value("${audit.ingest.key:dev-internal-audit-key}") String internalKey) {
        this.http = RestClient.builder().baseUrl(authUrl).requestFactory(HttpTimeouts.provider()).build();
        this.internalKey = internalKey;
    }

    /** The user's email, or null if it can't be resolved. */
    public String emailFor(Long userId) {
        if (userId == null) return null;
        try {
            Map<?, ?> res = http.get()
                    .uri("/internal/users/" + userId + "/email")
                    .header("X-Internal-Key", internalKey)
                    .retrieve()
                    .body(Map.class);
            Object email = res == null ? null : res.get("email");
            String value = email == null ? null : email.toString();
            return (value == null || value.isBlank()) ? null : value;
        } catch (Exception e) {
            log.debug("email lookup failed for user {}: {}", userId, e.getMessage());
            return null;
        }
    }
}
