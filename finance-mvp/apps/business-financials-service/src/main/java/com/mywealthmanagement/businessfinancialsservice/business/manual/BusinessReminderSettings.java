package com.mywealthmanagement.businessfinancialsservice.business.manual;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

/**
 * Per-business dunning settings (order-to-cash, Phase 1.9): whether automated payment
 * reminders run, on which channel, and at which day offsets relative to an invoice's due date.
 */
@Entity
@Table(name = "business_reminder_settings")
@Data
@NoArgsConstructor
public class BusinessReminderSettings {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    @Column(nullable = false)
    private boolean enabled = false;

    /** AUTO | EMAIL | SMS */
    @Column(nullable = false, length = 8)
    private String channel = "AUTO";

    /** Comma-separated day offsets vs. due date, e.g. "-3,0,7". */
    @Column(nullable = false, length = 120)
    private String offsets = "-3,0,7";

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
