package com.mywealthmanagement.authservice.auth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * One unit of the cross-service delete-cascade: "purge {@code userId}'s data at
 * {@code target}". Persisted so a failed purge survives restarts and is retried
 * by {@link UserDataPurgeClient#retryPending()} until it succeeds (or exhausts
 * the attempt cap → FAILED, surfaced in logs for manual follow-up).
 */
@Entity
@Table(name = "user_deletion_task")
public class UserDeletionTask {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false)
    private String target;

    @Column(nullable = false)
    private String status = "PENDING";

    @Column(nullable = false)
    private int attempts = 0;

    @Column(name = "last_error", length = 1000)
    private String lastError;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        if (createdAt == null) createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    public Long getId() { return id; }

    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }

    public String getTarget() { return target; }
    public void setTarget(String target) { this.target = target; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public int getAttempts() { return attempts; }
    public void setAttempts(int attempts) { this.attempts = attempts; }

    public String getLastError() { return lastError; }
    public void setLastError(String lastError) { this.lastError = lastError; }
}
