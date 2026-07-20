package com.mywealthmanagement.realestateservice.holding;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Map;

/**
 * Posts a private-holdings alert to the notification-service internal ingest endpoint
 * (shared X-Internal-Key — the same pattern the deal-board roundup uses). Gated on the
 * recipient's {@code dealAlerts} preference, so an opted-out user is skipped there.
 *
 * <p>Best-effort: every failure is swallowed and logged — one user's alert must never break
 * the scheduled run for the rest.
 */
@Component
public class HoldingAlertNotifier {

    private static final Logger log = LoggerFactory.getLogger(HoldingAlertNotifier.class);

    private final RestClient restClient;
    private final String internalKey;

    public HoldingAlertNotifier(
            @Value("${service.notification.url:http://localhost:8088}") String notificationUrl,
            @Value("${notifications.internal.key:}") String internalKey) {
        this.restClient = RestClient.builder().baseUrl(notificationUrl).build();
        this.internalKey = internalKey;
    }

    /** Send one user's holdings alert. Returns true if the request was accepted. */
    public boolean send(Long userId, String title, String body) {
        if (userId == null) return false;
        try {
            Map<String, Object> payload = Map.of(
                    "userId", userId,
                    "type", "DEAL",
                    "title", title,
                    "body", body,
                    "email", true,
                    "sms", false,
                    "respectPreference", "dealAlerts");
            restClient.post()
                    .uri("/api/v1/notifications/internal")
                    .header("X-Internal-Key", internalKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload)
                    .retrieve()
                    .toBodilessEntity();
            return true;
        } catch (Exception e) {
            log.warn("Could not send holdings alert to user {}: {}", userId, e.getMessage());
            return false;
        }
    }
}
