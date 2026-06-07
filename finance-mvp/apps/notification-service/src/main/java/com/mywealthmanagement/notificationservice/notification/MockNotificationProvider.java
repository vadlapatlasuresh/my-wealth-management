package com.mywealthmanagement.notificationservice.notification;

import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Mock notification provider. Persists a Notification row and logs the delivery.
 * No real email/push is sent.
 *
 * TODO: implement real channels.
 *   - EMAIL via SendGrid  -> configure SENDGRID_API_KEY (see application.properties)
 *   - PUSH  via Firebase  -> configure FCM_SERVER_KEY    (see application.properties)
 */
@Service
@RequiredArgsConstructor
public class MockNotificationProvider implements NotificationProvider {

    private static final Logger log = LoggerFactory.getLogger(MockNotificationProvider.class);

    private final NotificationRepository notificationRepository;

    @Override
    public void send(Long userId, String type, String title, String body, String channel) {
        Notification notification = new Notification(userId, type, title, body, channel);
        notificationRepository.save(notification);
        log.info("[MockNotificationProvider] Sent {} notification via {} to userId={} title='{}'",
                type, channel, userId, title);
        // TODO: dispatch to real provider based on channel
        //   EMAIL -> SendGrid (SENDGRID_API_KEY)
        //   PUSH  -> Firebase Cloud Messaging (FCM_SERVER_KEY)
    }
}
