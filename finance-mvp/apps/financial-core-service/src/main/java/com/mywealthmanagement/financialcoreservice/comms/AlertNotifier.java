package com.mywealthmanagement.financialcoreservice.comms;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.HashMap;
import java.util.Map;

/**
 * Best-effort bridge to the notification-service internal ingest endpoint (shared
 * X-Internal-Key — the same pattern the weekly net-worth digest uses). Posts an in-app
 * notification and asks notification-service to also email the user (subject to their
 * preferences). Every failure is swallowed and logged — notifying must never block or
 * fail the underlying action (a debt compare, a tax run, a budget digest).
 */
@Component
public class AlertNotifier {

    private static final Logger log = LoggerFactory.getLogger(AlertNotifier.class);

    private final RestClient restClient;
    private final String internalKey;
    private final boolean enabled;

    public AlertNotifier(
            @Value("${service.notification.url:http://localhost:8088}") String notificationUrl,
            @Value("${notifications.internal.key:}") String internalKey,
            @Value("${notifications.enabled:true}") boolean enabled) {
        this.restClient = RestClient.builder().baseUrl(notificationUrl).build();
        this.internalKey = internalKey;
        this.enabled = enabled;
    }

    /** In-app + email, no preference gate (the message is always delivered in-app). */
    public void notify(Long userId, String type, String title, String body) {
        notify(userId, type, title, body, null);
    }

    /**
     * In-app + email. When {@code respectPreference} is set (e.g. "budgetAlerts"),
     * notification-service skips users who explicitly opted that category out.
     */
    public void notify(Long userId, String type, String title, String body, String respectPreference) {
        if (!enabled || userId == null) {
            return;
        }
        try {
            Map<String, Object> payload = new HashMap<>();
            payload.put("userId", userId);
            payload.put("type", type);
            payload.put("title", title);
            payload.put("body", body);
            payload.put("email", true);
            if (respectPreference != null && !respectPreference.isBlank()) {
                payload.put("respectPreference", respectPreference);
            }
            restClient.post()
                    .uri("/api/v1/notifications/internal")
                    .header("X-Internal-Key", internalKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload)
                    .retrieve()
                    .toBodilessEntity();
        } catch (Exception e) {
            log.warn("notification to user {} failed: {}", userId, e.getMessage());
        }
    }
}
