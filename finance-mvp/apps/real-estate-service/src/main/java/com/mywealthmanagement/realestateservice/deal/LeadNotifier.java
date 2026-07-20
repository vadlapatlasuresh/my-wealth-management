package com.mywealthmanagement.realestateservice.deal;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.HashMap;
import java.util.Map;

/**
 * Best-effort directory-event notifier: posts in-app notifications to the notification-service's
 * internal ingest endpoint so posters and viewers are kept in the loop on the listings they
 * care about. Authenticated service-to-service with a shared {@code X-Internal-Key}.
 * <p>
 * Every alert is tagged {@code type: "DEAL"} and gated on the recipient's {@code dealAlerts}
 * preference, and asks notification-service to also email/SMS the user when those channels
 * are enabled. Every failure is swallowed and logged — notifying must never block or fail
 * the underlying deal action.
 */
@Component
public class LeadNotifier {

    private static final Logger log = LoggerFactory.getLogger(LeadNotifier.class);

    private final RestClient restClient;
    private final String internalKey;
    private final boolean enabled;

    public LeadNotifier(
            @Value("${service.notification.url:http://localhost:8088}") String notificationUrl,
            @Value("${notifications.internal.key:}") String internalKey,
            @Value("${leads.notify.enabled:true}") boolean enabled) {
        this.restClient = RestClient.builder().baseUrl(notificationUrl).build();
        this.internalKey = internalKey;
        this.enabled = enabled;
    }

    /** Someone requested the contact details on one of this user's listings. */
    public void notifyNewInterest(Long posterUserId, String dealTitle, String requesterName) {
        send(posterUserId, "Someone requested your contact details",
                requesterName + " requested the contact details on your listing \"" + dealTitle + "\".");
    }

    /** A saved listing changed status (e.g. OPEN -> CLOSED). Notifies one watcher. */
    public void notifyWatcherStatusChanged(Long watcherUserId, String dealTitle, String newStatus) {
        send(watcherUserId, "\"" + dealTitle + "\" is now " + prettyStatus(newStatus),
                "A listing you saved changed status to " + prettyStatus(newStatus) + ".");
    }

    /** Common dispatch: DEAL type, dealAlerts-gated, email + SMS when the user opted in. */
    private void send(Long userId, String title, String body) {
        if (!enabled || userId == null) {
            return;
        }
        try {
            Map<String, Object> payload = new HashMap<>();
            payload.put("userId", userId);
            payload.put("type", "DEAL");
            payload.put("title", title);
            payload.put("body", body);
            payload.put("email", true);
            payload.put("sms", true);
            payload.put("respectPreference", "dealAlerts");
            restClient.post()
                    .uri("/api/v1/notifications/internal")
                    .header("X-Internal-Key", internalKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload)
                    .retrieve()
                    .toBodilessEntity();
        } catch (Exception e) {
            log.warn("Could not send deal alert to user {}: {}", userId, e.getMessage());
        }
    }

    /** "COMMITTED" -> "Committed"; null-safe. */
    private static String prettyStatus(String status) {
        if (status == null || status.isBlank()) {
            return "updated";
        }
        String lower = status.trim().toLowerCase().replace('_', ' ');
        return Character.toUpperCase(lower.charAt(0)) + lower.substring(1);
    }
}
