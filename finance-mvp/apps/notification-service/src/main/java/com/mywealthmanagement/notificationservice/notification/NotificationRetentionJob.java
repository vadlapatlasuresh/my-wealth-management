package com.mywealthmanagement.notificationservice.notification;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * Data-retention purge: deletes already-read notifications older than the configured
 * retention window (default 180 days). Conservative by design — unread notifications and
 * anything within the window are kept. Runs daily; tune or disable via:
 *   notifications.retention.enabled (default true)
 *   notifications.retention.days    (default 180)
 *   notifications.retention.cron    (default 03:30 daily)
 */
@Component
public class NotificationRetentionJob {

    private static final Logger log = LoggerFactory.getLogger(NotificationRetentionJob.class);

    private final NotificationRepository repository;

    @Value("${notifications.retention.enabled:true}")
    private boolean enabled;

    @Value("${notifications.retention.days:180}")
    private int retentionDays;

    public NotificationRetentionJob(NotificationRepository repository) {
        this.repository = repository;
    }

    @Scheduled(cron = "${notifications.retention.cron:0 30 3 * * *}")
    @Transactional
    public void purgeOldRead() {
        if (!enabled) return;
        LocalDateTime cutoff = LocalDateTime.now().minusDays(retentionDays);
        int purged = repository.deleteReadOlderThan(cutoff);
        if (purged > 0) {
            log.info("retention: purged {} read notification(s) older than {} days", purged, retentionDays);
        }
    }
}
