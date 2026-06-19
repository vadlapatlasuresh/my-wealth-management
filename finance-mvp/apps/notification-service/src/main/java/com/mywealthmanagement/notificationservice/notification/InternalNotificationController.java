package com.mywealthmanagement.notificationservice.notification;

import com.mywealthmanagement.notificationservice.comms.AuthEmailClient;
import com.mywealthmanagement.notificationservice.comms.Channel;
import com.mywealthmanagement.notificationservice.comms.ChannelProvider;
import com.mywealthmanagement.notificationservice.comms.ChannelRouter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Internal, service-to-service endpoint for notifying a user (who is not the caller).
 * Guarded by a shared {@code X-Internal-Key} header. Always creates an in-app notification;
 * if the request sets {@code "email": true} and an EMAIL provider is active, it ALSO emails
 * the user (their address is resolved from auth-service). Used by e.g. real-estate deal
 * alerts and payment reminders.
 */
@RestController
@RequestMapping("/api/v1/notifications/internal")
public class InternalNotificationController {

    private static final Logger log = LoggerFactory.getLogger(InternalNotificationController.class);

    @Value("${notifications.internal.key:}")
    private String internalKey;

    private final NotificationRepository repository;
    private final ChannelRouter channelRouter;
    private final AuthEmailClient authEmailClient;
    private final NotificationPreferenceRepository preferenceRepository;

    public InternalNotificationController(NotificationRepository repository,
                                          ChannelRouter channelRouter,
                                          AuthEmailClient authEmailClient,
                                          NotificationPreferenceRepository preferenceRepository) {
        this.repository = repository;
        this.channelRouter = channelRouter;
        this.authEmailClient = authEmailClient;
        this.preferenceRepository = preferenceRepository;
    }

    @PostMapping
    public ResponseEntity<Void> ingest(@RequestBody Map<String, Object> body,
                                       @RequestHeader(value = "X-Internal-Key", required = false) String key) {
        // Enforce the shared key when one is configured (always set in production).
        if (StringUtils.hasText(internalKey) && !internalKey.equals(key)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        Object userId = body.get("userId");
        if (userId == null) {
            return ResponseEntity.badRequest().build();
        }
        Long uid = Long.valueOf(userId.toString());

        // Optional preference gate: when the caller names a preference (e.g.
        // "weeklySummary"), respect an explicit opt-out — skip the notification
        // entirely. A user with no preference row keeps the on-by-default behavior.
        String respect = str(body.get("respectPreference"), "");
        if (StringUtils.hasText(respect) && optedOut(uid, respect)) {
            return ResponseEntity.noContent().build();
        }

        Notification n = new Notification();
        n.setUserId(uid);
        n.setType(str(body.get("type"), "SYSTEM"));
        n.setTitle(str(body.get("title"), "Notification"));
        n.setBody(str(body.get("body"), ""));
        n.setChannel("INAPP");
        n.setReadFlag(false);
        repository.save(n);

        // Optional email delivery (best-effort) when requested and an EMAIL provider is live.
        if (Boolean.parseBoolean(str(body.get("email"), "false"))) {
            sendEmail(n);
        }
        return ResponseEntity.status(HttpStatus.CREATED).build();
    }

    private void sendEmail(Notification n) {
        try {
            ChannelProvider provider = channelRouter.providerFor(Channel.EMAIL);
            if (provider == null) return; // mock/none — nothing to send
            String email = authEmailClient.emailFor(n.getUserId());
            if (email == null) return;
            provider.send(email, n.getTitle(), n.getBody(), Map.of("type", "alert"));
        } catch (Exception e) {
            log.warn("alert email for user {} failed: {}", n.getUserId(), e.getMessage());
        }
    }

    /** True when the user has a preference row that explicitly disables {@code key}. */
    private boolean optedOut(Long userId, String key) {
        return preferenceRepository.findByUserId(userId).map(p -> switch (key) {
            case "weeklySummary" -> !p.isWeeklySummary();
            case "paymentAlerts" -> !p.isPaymentAlerts();
            case "budgetAlerts" -> !p.isBudgetAlerts();
            case "email" -> !p.isEmailEnabled();
            default -> false;
        }).orElse(false);
    }

    private String str(Object o, String fallback) {
        return o == null ? fallback : o.toString();
    }
}
