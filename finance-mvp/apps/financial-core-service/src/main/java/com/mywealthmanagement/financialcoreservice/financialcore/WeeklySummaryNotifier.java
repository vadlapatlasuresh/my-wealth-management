package com.mywealthmanagement.financialcoreservice.financialcore;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Map;

/**
 * Posts a user's weekly net-worth digest to the notification-service internal
 * ingest endpoint (shared X-Internal-Key — the same pattern payment reminders and
 * real-estate lead alerts use). Sets {@code respectPreference: "weeklySummary"} so
 * notification-service skips anyone who opted out, and {@code email: true} so the
 * digest is also emailed when an EMAIL provider is live.
 * <p>
 * Best-effort: every failure is swallowed and logged — a digest must never break
 * the scheduled run for other users.
 */
@Component
public class WeeklySummaryNotifier {

    private static final Logger log = LoggerFactory.getLogger(WeeklySummaryNotifier.class);

    private final RestClient restClient;
    private final String internalKey;

    public WeeklySummaryNotifier(
            @Value("${service.notification.url:http://localhost:8088}") String notificationUrl,
            @Value("${notifications.internal.key:}") String internalKey) {
        this.restClient = RestClient.builder().baseUrl(notificationUrl).build();
        this.internalKey = internalKey;
    }

    /** Send one user's digest. Returns true if the request was accepted. */
    public boolean send(Long userId, String title, String body) {
        if (userId == null) return false;
        try {
            Map<String, Object> payload = Map.of(
                    "userId", userId,
                    "type", "SYSTEM",
                    "title", title,
                    "body", body,
                    "email", true,
                    "respectPreference", "weeklySummary");
            restClient.post()
                    .uri("/api/v1/notifications/internal")
                    .header("X-Internal-Key", internalKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload)
                    .retrieve()
                    .toBodilessEntity();
            return true;
        } catch (Exception e) {
            log.warn("weekly summary for user {} failed: {}", userId, e.getMessage());
            return false;
        }
    }
}
