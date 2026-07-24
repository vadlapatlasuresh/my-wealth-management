package com.mywealthmanagement.authservice.family;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** A chore with a reward. Completing it writes a CHORE ledger entry — the chore itself is not money. */
@Entity
@Table(name = "family_chore")
@Data
@NoArgsConstructor
public class FamilyChore {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "family_member_id", nullable = false)
    private Long familyMemberId;

    @Column(nullable = false)
    private String title;

    @Column(name = "reward_amount", nullable = false)
    private BigDecimal rewardAmount = BigDecimal.ZERO;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @Column(name = "created_by_user_id", nullable = false)
    private Long createdByUserId;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
