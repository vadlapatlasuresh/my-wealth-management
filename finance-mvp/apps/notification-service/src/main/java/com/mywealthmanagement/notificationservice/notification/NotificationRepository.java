package com.mywealthmanagement.notificationservice.notification;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface NotificationRepository extends JpaRepository<Notification, Long> {
    List<Notification> findByUserIdOrderByCreatedAtDesc(Long userId);

    /** Bounded variant for the display list (newest-first), so the inbox can't fetch unbounded. */
    List<Notification> findByUserIdOrderByCreatedAtDesc(Long userId, Limit limit);

    /** Retention purge: delete already-read notifications older than the cutoff. Returns the count. */
    @Modifying
    @Query("delete from Notification n where n.readFlag = true and n.createdAt < :cutoff")
    int deleteReadOlderThan(@Param("cutoff") LocalDateTime cutoff);

    void deleteByUserId(Long userId);
}
