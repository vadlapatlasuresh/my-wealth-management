package com.mywealthmanagement.notificationservice.comms;

import org.springframework.data.jpa.repository.JpaRepository;

public interface NotificationIdempotencyRepository extends JpaRepository<NotificationIdempotency, Long> {
}
