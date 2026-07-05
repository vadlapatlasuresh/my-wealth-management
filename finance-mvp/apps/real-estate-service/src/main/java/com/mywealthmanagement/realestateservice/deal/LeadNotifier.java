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
 * Best-effort deal-event notifier: posts in-app notifications to the notification-service's
 * internal ingest endpoint so investors and sponsors are kept in the loop on the deals they
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

    /** A sponsor gains a new interested investor on one of their deals. */
    public void notifyNewInterest(Long sponsorUserId, String dealTitle, String investorName) {
        send(sponsorUserId, "New investor interest",
                investorName + " expressed interest in \"" + dealTitle + "\".");
    }

    /** An investor's lead was moved to a new status (e.g. CONTACTED, COMMITTED) by the sponsor. */
    public void notifyLeadStatusChanged(Long investorUserId, String dealTitle, String newStatus) {
        send(investorUserId, "Update on \"" + dealTitle + "\"",
                "The sponsor moved your interest to " + prettyStatus(newStatus) + ".");
    }

    /** A watched deal changed status (e.g. OPEN -> FUNDED / CLOSED). Notifies one watcher. */
    public void notifyWatcherStatusChanged(Long watcherUserId, String dealTitle, String newStatus) {
        send(watcherUserId, "\"" + dealTitle + "\" is now " + prettyStatus(newStatus),
                "A deal on your watchlist changed status to " + prettyStatus(newStatus) + ".");
    }

    /** A new document was posted to a watched deal. Notifies one watcher. */
    public void notifyWatcherNewDocument(Long watcherUserId, String dealTitle, String docLabel) {
        send(watcherUserId, "New document on \"" + dealTitle + "\"",
                "The sponsor added \"" + docLabel + "\" to a deal on your watchlist.");
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
