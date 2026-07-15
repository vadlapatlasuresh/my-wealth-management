package com.mywealthmanagement.documentsservice.comms;

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
 * X-Internal-Key). Used to alert the owner when a shared document is accessed. Every
 * failure is swallowed and logged — notifying must never block or fail the action.
 */
@Component
public class NotificationClient {

    private static final Logger log = LoggerFactory.getLogger(NotificationClient.class);

    private final RestClient restClient;
    private final String internalKey;
    private final boolean enabled;

    public NotificationClient(
            @Value("${service.notification.url:http://localhost:8088}") String notificationUrl,
            @Value("${notifications.internal.key:}") String internalKey,
            @Value("${notifications.enabled:true}") boolean enabled) {
        this.restClient = RestClient.builder().baseUrl(notificationUrl).build();
        this.internalKey = internalKey;
        this.enabled = enabled;
    }

    /** In-app + email (best-effort). {@code type} tags the in-app row, e.g. "DOCUMENTS". */
    public void notify(Long userId, String type, String title, String body) {
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
            restClient.post()
                    .uri("/api/v1/notifications/internal")
                    .header("X-Internal-Key", internalKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload)
                    .retrieve()
                    .toBodilessEntity();
        } catch (Exception e) {
            log.warn("documents notification to user {} failed: {}", userId, e.getMessage());
        }
    }
}
