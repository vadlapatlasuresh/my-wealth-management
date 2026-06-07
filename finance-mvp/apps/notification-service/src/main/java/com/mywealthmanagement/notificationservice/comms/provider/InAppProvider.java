package com.mywealthmanagement.notificationservice.comms.provider;

import com.mywealthmanagement.notificationservice.comms.Channel;
import com.mywealthmanagement.notificationservice.comms.ChannelProvider;
import com.mywealthmanagement.notificationservice.comms.DeliveryResult;
import com.mywealthmanagement.notificationservice.notification.Notification;
import com.mywealthmanagement.notificationservice.notification.NotificationRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * In-app provider. Unlike the mock providers, this one actually persists a
 * {@link Notification} row (reusing the existing notification entity/repo) so the
 * message shows up in the in-app inbox (GET /api/v1/notifications).
 *
 * recipient = userId (as a string). meta may carry "type" (BUDGET|PAYMENT|...),
 * defaulting to SYSTEM.
 */
@Component
@RequiredArgsConstructor
public class InAppProvider implements ChannelProvider {

    private static final Logger log = LoggerFactory.getLogger(InAppProvider.class);

    private final NotificationRepository notificationRepository;

    @Override
    public Channel channel() {
        return Channel.IN_APP;
    }

    @Override
    public String name() {
        return "inapp";
    }

    @Override
    public DeliveryResult send(String recipient, String subject, String body, Map<String, Object> meta) {
        Long userId = Long.valueOf(recipient);
        String type = meta != null && meta.get("type") != null ? String.valueOf(meta.get("type")) : "SYSTEM";
        String title = subject != null && !subject.isBlank() ? subject : "Notification";
        Notification saved = notificationRepository.save(
                new Notification(userId, type, title, body, "INAPP"));
        log.info("[InAppProvider] Created in-app notification id={} userId={} title='{}'",
                saved.getId(), userId, title);
        return DeliveryResult.sent(Channel.IN_APP, "notification:" + saved.getId(), "In-app notification created");
    }
}
