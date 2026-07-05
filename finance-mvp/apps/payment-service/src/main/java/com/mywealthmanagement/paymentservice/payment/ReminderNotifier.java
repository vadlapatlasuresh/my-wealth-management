package com.mywealthmanagement.paymentservice.payment;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;

/**
 * Best-effort payment notifier: posts to the notification-service internal ingest endpoint
 * (shared X-Internal-Key, the same pattern real-estate uses for deal alerts). Every message
 * is tagged {@code type: "PAYMENT"}, gated on the user's {@code paymentAlerts} preference, and
 * asks notification-service to also email/SMS the user when those channels are enabled.
 * Failures are swallowed — a reminder or receipt must never block or fail anything.
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

    /**
     * Tiered upcoming-payment reminder. {@code daysUntil} drives the tone:
     *   5 days -> heads-up, 2 days -> reminder, 0 days -> CRITICAL (due today).
     */
    public void remind(Long userId, String payee, BigDecimal amount, LocalDate when, int daysUntil) {
        if (userId == null) return;
        String who = (payee == null || payee.isBlank()) ? "a payee" : payee;
        String title;
        String lead;
        switch (daysUntil) {
            case 0 -> {
                title = "Payment due today";
                lead = "Due today: ";
            }
            case 2 -> {
                title = "Payment due in 2 days";
                lead = "Due in 2 days: ";
            }
            default -> {
                title = "Upcoming payment in " + daysUntil + " days";
                lead = "Due in " + daysUntil + " days: ";
            }
        }
        String body = lead + "your payment of " + money(amount) + " to " + who + " is scheduled for " + when + ".";
        if (daysUntil == 0) {
            body += " Make sure funds are available.";
        }
        send(userId, title, body);
    }

    /** Receipt after a completed bill-pay: amount, payee, funding + destination account, confirmation. */
    public void confirmPayment(Long userId, BigDecimal amount, String payee,
                               String fromAccount, String toAccount, String confirmation) {
        if (userId == null) return;
        String who = (payee == null || payee.isBlank()) ? "your payee" : payee;
        StringBuilder body = new StringBuilder("Your payment of ")
                .append(money(amount)).append(" to ").append(who).append(" is complete.");
        if (fromAccount != null && !fromAccount.isBlank()) {
            body.append(" Funded from account ").append(fromAccount).append('.');
        }
        if (toAccount != null && !toAccount.isBlank()) {
            body.append(" Applied to account ").append(toAccount).append('.');
        }
        if (confirmation != null && !confirmation.isBlank()) {
            body.append(" Confirmation ").append(confirmation).append('.');
        }
        send(userId, "Payment sent", body.toString());
    }

    /** Common dispatch: PAYMENT type, paymentAlerts-gated, email + SMS when the user opted in. */
    private void send(Long userId, String title, String body) {
        if (!enabled) return;
        try {
            Map<String, Object> payload = new HashMap<>();
            payload.put("userId", userId);
            payload.put("type", "PAYMENT");
            payload.put("title", title);
            payload.put("body", body);
            payload.put("email", true);
            payload.put("sms", true);
            payload.put("respectPreference", "paymentAlerts");
            restClient.post()
                    .uri("/api/v1/notifications/internal")
                    .header("X-Internal-Key", internalKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload)
                    .retrieve()
                    .toBodilessEntity();
        } catch (Exception e) {
            log.warn("payment notification for user {} failed: {}", userId, e.getMessage());
        }
    }

    private static String money(BigDecimal amount) {
        return amount == null ? "$0" : "$" + amount.stripTrailingZeros().toPlainString();
    }
}
