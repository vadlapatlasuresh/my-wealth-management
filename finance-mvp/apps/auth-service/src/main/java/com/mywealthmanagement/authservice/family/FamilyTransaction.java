package com.mywealthmanagement.authservice.family;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * A child's spend transaction — household-owned. LINKED_SYNC rows are materialized copies of a
 * guardian's own aggregation transactions ({@code externalId} = source plaid_transaction_id, unique
 * per household so re-syncing never double-counts). MANUAL rows are entered by hand.
 */
@Entity
@Table(name = "family_transaction")
@Data
@NoArgsConstructor
public class FamilyTransaction {

    public static final String SOURCE_LINKED_SYNC = "LINKED_SYNC";
    public static final String SOURCE_MANUAL = "MANUAL";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "household_id", nullable = false)
    private Long householdId;

    @Column(name = "family_member_id", nullable = false)
    private Long familyMemberId;

    @Column(name = "card_id")
    private Long cardId;

    /** Source plaid_transaction_id for LINKED_SYNC rows; null for MANUAL. */
    @Column(name = "external_id")
    private String externalId;

    @Column(nullable = false)
    private String source = SOURCE_MANUAL;

    @Column
    private String merchant;

    @Column
    private String category;

    /** Positive = money the child spent. */
    @Column(nullable = false)
    private BigDecimal amount;

    @Column
    private String location;

    @Column(name = "occurred_on", nullable = false)
    private LocalDate occurredOn;

    @Column(nullable = false)
    private String bucket = "SPEND";

    @Column(name = "created_by_user_id", nullable = false)
    private Long createdByUserId;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
