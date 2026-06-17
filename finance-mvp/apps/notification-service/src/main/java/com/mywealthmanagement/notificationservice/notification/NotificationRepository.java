package com.mywealthmanagement.notificationservice.notification;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface NotificationRepository extends JpaRepository<Notification, Long> {
    List<Notification> findByUserIdOrderByCreatedAtDesc(Long userId);

    /** Bounded variant for the display list (newest-first), so the inbox can't fetch unbounded. */
    List<Notification> findByUserIdOrderByCreatedAtDesc(Long userId, Limit limit);

    void deleteByUserId(Long userId);
}
