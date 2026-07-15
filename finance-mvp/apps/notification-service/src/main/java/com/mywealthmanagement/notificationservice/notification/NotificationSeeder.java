package com.mywealthmanagement.notificationservice.notification;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class NotificationSeeder implements CommandLineRunner {

    /** Only the configured demo/test user is seeded. Blank = seed nobody, so
     *  regular accounts never get demo notifications. */
    @Value("${app.demo.user-id:}")
    private String demoUserIdRaw;

    private final NotificationRepository notificationRepository;

    @Override
    public void run(String... args) {
        Long userId = parseDemoUserId();
        if (userId == null) {
            return; // No demo user configured — do not seed any account.
        }
        if (!notificationRepository.findByUserIdOrderByCreatedAtDesc(userId).isEmpty()) {
            return; // already seeded
        }
        notificationRepository.save(new Notification(userId, "BUDGET",
                "Budget alert: Dining",
                "You've used 85% of your Dining budget for this month.", "INAPP"));
        notificationRepository.save(new Notification(userId, "PAYMENT",
                "Payment confirmed",
                "Your payment of $1,250.00 to Acme Mortgage was successful.", "EMAIL"));
        notificationRepository.save(new Notification(userId, "SYSTEM",
                "Your weekly summary is ready",
                "Net worth up 2.1% this week. Tap to see the full breakdown.", "INAPP"));
    }

    /** The configured demo user id, or null when unset/invalid (seed nobody). */
    private Long parseDemoUserId() {
        if (demoUserIdRaw == null || demoUserIdRaw.isBlank()) return null;
        try {
            return Long.valueOf(demoUserIdRaw.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
