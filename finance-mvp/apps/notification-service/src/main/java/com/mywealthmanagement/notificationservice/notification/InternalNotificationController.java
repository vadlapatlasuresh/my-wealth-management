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
    private final DeviceTokenRepository deviceTokenRepository;

    public InternalNotificationController(NotificationRepository repository,
                                          ChannelRouter channelRouter,
                                          AuthEmailClient authEmailClient,
                                          NotificationPreferenceRepository preferenceRepository,
                                          DeviceTokenRepository deviceTokenRepository) {
        this.repository = repository;
        this.channelRouter = channelRouter;
        this.authEmailClient = authEmailClient;
        this.preferenceRepository = preferenceRepository;
        this.deviceTokenRepository = deviceTokenRepository;
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
        // Optional SMS delivery (best-effort) when requested: only to users who opted in
        // (smsEnabled) and have a verified phone on file.
        if (Boolean.parseBoolean(str(body.get("sms"), "false"))) {
            sendSms(n);
        }
        // Push delivery (best-effort): only to users who opted in (pushEnabled) and have
        // a registered device, and only when a real PUSH provider is active.
        sendPush(n);
        return ResponseEntity.status(HttpStatus.CREATED).build();
    }

    private void sendPush(Notification n) {
        try {
            ChannelProvider provider = channelRouter.providerFor(Channel.PUSH);
            if (provider == null) return; // mock/none — nothing to send
            boolean optedIn = preferenceRepository.findByUserId(n.getUserId())
                    .map(NotificationPreference::isPushEnabled).orElse(false);
            if (!optedIn) return; // push is opt-in (pushEnabled defaults false)
            var tokens = deviceTokenRepository.findByUserId(n.getUserId());
            for (DeviceToken d : tokens) {
                provider.send(d.getToken(), n.getTitle(), n.getBody(), Map.of("type", "alert"));
            }
        } catch (Exception e) {
            log.warn("push for user {} failed: {}", n.getUserId(), e.getMessage());
        }
    }

    private void sendEmail(Notification n) {
        try {
            ChannelProvider provider = channelRouter.providerFor(Channel.EMAIL);
            if (provider == null) return; // mock/none — nothing to send
            // Respect the email channel toggle: a user who turned email off gets none.
            // A user with no preference row keeps the on-by-default behavior.
            boolean emailOn = preferenceRepository.findByUserId(n.getUserId())
                    .map(NotificationPreference::isEmailEnabled).orElse(true);
            if (!emailOn) return;
            String email = authEmailClient.emailFor(n.getUserId());
            if (email == null) return;
            provider.send(email, n.getTitle(), n.getBody(), Map.of("type", "alert"));
        } catch (Exception e) {
            log.warn("alert email for user {} failed: {}", n.getUserId(), e.getMessage());
        }
    }

    private void sendSms(Notification n) {
        try {
            ChannelProvider provider = channelRouter.providerFor(Channel.SMS);
            if (provider == null) return; // mock/none — nothing to send
            boolean optedIn = preferenceRepository.findByUserId(n.getUserId())
                    .map(NotificationPreference::isSmsEnabled).orElse(false);
            if (!optedIn) return; // SMS is opt-in (smsEnabled defaults false)
            String phone = authEmailClient.verifiedPhoneFor(n.getUserId());
            if (phone == null) return; // no verified number — nothing to text
            // SMS has no subject; the title leads the body so the text stands alone.
            String text = n.getTitle() + ": " + n.getBody();
            provider.send(phone, null, text, Map.of("type", "alert"));
        } catch (Exception e) {
            log.warn("alert SMS for user {} failed: {}", n.getUserId(), e.getMessage());
        }
    }

    /** True when the user has a preference row that explicitly disables {@code key}. */
    private boolean optedOut(Long userId, String key) {
        return preferenceRepository.findByUserId(userId).map(p -> switch (key) {
            case "weeklySummary" -> !p.isWeeklySummary();
            case "paymentAlerts" -> !p.isPaymentAlerts();
            case "budgetAlerts" -> !p.isBudgetAlerts();
            case "dealAlerts" -> !p.isDealAlerts();
            case "dealBoardWeekly" -> !p.isDealBoardWeekly();
            case "email" -> !p.isEmailEnabled();
            default -> false;
        }).orElse(false);
    }

    private String str(Object o, String fallback) {
        return o == null ? fallback : o.toString();
    }
}
