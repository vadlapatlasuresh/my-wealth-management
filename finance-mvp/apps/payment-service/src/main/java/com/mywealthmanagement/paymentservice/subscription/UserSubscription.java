package com.mywealthmanagement.paymentservice.subscription;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** A user's current subscription state. One row per user (unique). */
@Entity
@Table(name = "user_subscription")
@Data
@NoArgsConstructor
public class UserSubscription {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "plan_key", nullable = false, length = 50)
    private String planKey;

    /** TRIALING | ACTIVE | PAST_DUE | CANCELED | EXPIRED */
    @Column(nullable = false, length = 20)
    private String status;

    /** MONTHLY | ANNUAL — null while still trialing before checkout. */
    @Column(name = "billing_cycle", length = 20)
    private String billingCycle;

    @Column(name = "trial_start")
    private LocalDateTime trialStart;

    @Column(name = "trial_end")
    private LocalDateTime trialEnd;

    @Column(name = "current_period_start")
    private LocalDateTime currentPeriodStart;

    @Column(name = "current_period_end")
    private LocalDateTime currentPeriodEnd;

    @Column(name = "canceled_at")
    private LocalDateTime canceledAt;

    @Column(name = "cancel_at_period_end", nullable = false)
    private Boolean cancelAtPeriodEnd = false;

    @Column(name = "last_amount")
    private BigDecimal lastAmount;

    @Column(name = "provider_ref")
    private String providerRef;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
