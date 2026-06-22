package com.mywealthmanagement.auditservice.health;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

import java.util.Map;

/**
 * Sends a failure/recovery alert to the configured admin user by posting to the
 * notification-service internal ingest (shared X-Internal-Key, email:true). Best-effort
 * — alerting must never throw inside the monitor loop. No-ops (table-only) when
 * monitor.alert.admin-user-id is unset.
 */
@Component
public class HealthAlertNotifier {

    private static final Logger log = LoggerFactory.getLogger(HealthAlertNotifier.class);

    private final RestClient restClient;
    private final String internalKey;
    private final String adminUserId;

    public HealthAlertNotifier(
            @Value("${service.notification.url:http://localhost:8088}") String notificationUrl,
            @Value("${notifications.internal.key:${audit.ingest.key:dev-internal-audit-key}}") String internalKey,
            @Value("${monitor.alert.admin-user-id:}") String adminUserId) {
        this.restClient = RestClient.builder().baseUrl(notificationUrl).build();
        this.internalKey = internalKey;
        this.adminUserId = adminUserId;
    }

    /** Alert the admin that a service changed state. No-op if no admin user is configured. */
    public void alert(String serviceName, String status, String detail) {
        if (!StringUtils.hasText(adminUserId)) return; // table-only mode
        try {
            boolean down = "DOWN".equalsIgnoreCase(status);
            Map<String, Object> body = Map.of(
                    "userId", Long.valueOf(adminUserId.trim()),
                    "type", "SYSTEM",
                    "title", (down ? "⚠️ Service DOWN: " : "✅ Service recovered: ") + serviceName,
                    "body", serviceName + " is " + status + (StringUtils.hasText(detail) ? " (" + detail + ")" : "") + ".",
                    "email", true);
            restClient.post()
                    .uri("/api/v1/notifications/internal")
                    .header("X-Internal-Key", internalKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .toBodilessEntity();
        } catch (Exception e) {
            log.warn("health alert for {} ({}) failed: {}", serviceName, status, e.getMessage());
        }
    }
}
