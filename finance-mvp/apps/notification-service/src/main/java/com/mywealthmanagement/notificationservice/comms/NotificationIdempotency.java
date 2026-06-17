package com.mywealthmanagement.notificationservice.comms;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/** Reserved (user, idempotencyKey) marker for persistent notification idempotency. */
@Entity
@Table(name = "notification_idempotency")
public class NotificationIdempotency {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "idempotency_key", nullable = false)
    private String idempotencyKey;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    protected NotificationIdempotency() {
    }

    public NotificationIdempotency(Long userId, String idempotencyKey) {
        this.userId = userId;
        this.idempotencyKey = idempotencyKey;
        this.createdAt = Instant.now();
    }

    public Long getId() {
        return id;
    }
}
