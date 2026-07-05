package com.mywealthmanagement.realestateservice.deal;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Map;

/**
 * Posts a user's weekly deal-board roundup to the notification-service internal ingest
 * endpoint (shared X-Internal-Key — the same pattern the financial weekly digest uses).
 * Sets {@code respectPreference: "dealBoardWeekly"} so notification-service skips anyone
 * who opted out, and {@code email: true} / {@code sms: true} so the roundup also reaches
 * those channels when the user enabled them.
 * <p>
 * Best-effort: every failure is swallowed and logged — one user's roundup must never
 * break the scheduled run for the rest.
 */
@Component
public class DealBoardWeeklyNotifier {

    private static final Logger log = LoggerFactory.getLogger(DealBoardWeeklyNotifier.class);

    private final RestClient restClient;
    private final String internalKey;

    public DealBoardWeeklyNotifier(
            @Value("${service.notification.url:http://localhost:8088}") String notificationUrl,
            @Value("${notifications.internal.key:}") String internalKey) {
        this.restClient = RestClient.builder().baseUrl(notificationUrl).build();
        this.internalKey = internalKey;
    }

    /** Send one user's deal-board roundup. Returns true if the request was accepted. */
    public boolean send(Long userId, String title, String body) {
        if (userId == null) return false;
        try {
            Map<String, Object> payload = Map.of(
                    "userId", userId,
                    "type", "DEAL",
                    "title", title,
                    "body", body,
                    "email", true,
                    "sms", true,
                    "respectPreference", "dealBoardWeekly");
            restClient.post()
                    .uri("/api/v1/notifications/internal")
                    .header("X-Internal-Key", internalKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload)
                    .retrieve()
                    .toBodilessEntity();
            return true;
        } catch (Exception e) {
            log.warn("weekly deal-board roundup for user {} failed: {}", userId, e.getMessage());
            return false;
        }
    }
}
