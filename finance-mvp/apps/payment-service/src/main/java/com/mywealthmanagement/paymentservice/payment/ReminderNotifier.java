package com.mywealthmanagement.paymentservice.payment;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;

/**
 * Best-effort payment-reminder notifier: posts an in-app notification to the
 * notification-service's internal ingest endpoint (shared X-Internal-Key, the same
 * pattern real-estate uses for deal alerts). Failures are swallowed — a reminder must
 * never block or fail anything.
 */
@Component
public class ReminderNotifier {

    private static final Logger log = LoggerFactory.getLogger(ReminderNotifier.class);

    private final RestClient restClient;
    private final String internalKey;
    private final boolean enabled;

    public ReminderNotifier(
            @Value("${service.notification.url:http://localhost:8088}") String notificationUrl,
            @Value("${notifications.internal.key:}") String internalKey,
            @Value("${payments.reminders.enabled:true}") boolean enabled) {
        this.restClient = RestClient.builder().baseUrl(notificationUrl).build();
        this.internalKey = internalKey;
        this.enabled = enabled;
    }

    public void remind(Long userId, String payee, BigDecimal amount, LocalDate when) {
        if (!enabled || userId == null) return;
        try {
            Map<String, Object> body = Map.of(
                    "userId", userId,
                    "type", "PAYMENT",
                    "title", "Upcoming payment reminder",
                    "body", "Your payment of " + amount + " to " + (payee == null || payee.isBlank() ? "a payee" : payee)
                            + " is scheduled for " + when + ".");
            restClient.post()
                    .uri("/api/v1/notifications/internal")
                    .header("X-Internal-Key", internalKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .toBodilessEntity();
        } catch (Exception e) {
            log.warn("payment reminder for user {} failed: {}", userId, e.getMessage());
        }
    }
}
