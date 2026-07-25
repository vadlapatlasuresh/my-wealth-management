package com.mywealthmanagement.authservice.family;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * A monthly spending budget. {@code familyMemberId == null} is a whole-family budget (across all
 * children); otherwise it's for one child. Household-owned.
 */
@Entity
@Table(name = "family_budget")
@Data
@NoArgsConstructor
public class FamilyBudget {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "household_id", nullable = false)
    private Long householdId;

    /** null = whole-family budget. */
    @Column(name = "family_member_id")
    private Long familyMemberId;

    @Column(nullable = false)
    private String category;

    @Column(name = "monthly_limit", nullable = false)
    private BigDecimal monthlyLimit;

    @Column(name = "created_by_user_id", nullable = false)
    private Long createdByUserId;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
