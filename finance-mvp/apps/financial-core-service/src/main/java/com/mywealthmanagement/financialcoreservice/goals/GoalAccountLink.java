package com.mywealthmanagement.financialcoreservice.goals;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Links a goal to a savings/cash account in account-aggregation. The balance of a linked account
 * contributes to the goal's auto-tracked progress (see {@link Goal#getTrackingMode()}).
 */
@Entity
@Table(name = "goal_account_links")
@Data
@NoArgsConstructor
public class GoalAccountLink {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "goal_id", nullable = false)
    private Long goalId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "account_id", nullable = false)
    private Long accountId;

    @Column(name = "account_name")
    private String accountName;

    // Balance when the account was linked — the "zero point" for CONTRIBUTIONS mode.
    @Column(name = "baseline_amount", nullable = false)
    private BigDecimal baselineAmount = BigDecimal.ZERO;

    // Last balance we successfully read; used as a fallback when the live fetch fails.
    @Column(name = "last_balance")
    private BigDecimal lastBalance;

    @Column(name = "currency")
    private String currency;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
