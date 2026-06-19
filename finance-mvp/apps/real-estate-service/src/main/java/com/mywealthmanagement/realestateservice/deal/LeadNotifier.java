package com.mywealthmanagement.realestateservice.deal;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Map;

/**
 * Best-effort sponsor notifier: when an investor expresses interest, posts an in-app
 * notification to the notification-service's internal ingest endpoint so the sponsor
 * sees it in their inbox/bell. Authenticated service-to-service with a shared
 * {@code X-Internal-Key} (the audit-service pattern).
 * <p>
 * Every failure is swallowed and logged — notifying the sponsor must never block or fail
 * the investor's action.
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

    public void notifyNewInterest(Long sponsorUserId, String dealTitle, String investorName) {
        if (!enabled) {
            return;
        }
        try {
            Map<String, Object> body = Map.of(
                    "userId", sponsorUserId,
                    "type", "DEAL",
                    "title", "New investor interest",
                    "body", investorName + " expressed interest in \"" + dealTitle + "\".",
                    "email", true
            );
            restClient.post()
                    .uri("/api/v1/notifications/internal")
                    .header("X-Internal-Key", internalKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .toBodilessEntity();
        } catch (Exception e) {
            log.warn("Could not notify sponsor {} of new interest: {}", sponsorUserId, e.getMessage());
        }
    }
}
