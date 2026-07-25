package com.mywealthmanagement.authservice.family;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * A card a child uses — a household-owned record. LINKED cards point at one of a GUARDIAN's own
 * accounts in account-aggregation-service ({@code linkedAccountId}), owned by {@code
 * linkedOwnerUserId}; only that guardian may attach it or sync it. MANUAL cards have no bank link.
 * See V20__family_spending.sql for why this preserves the authorization boundary.
 */
@Entity
@Table(name = "family_card")
@Data
@NoArgsConstructor
public class FamilyCard {

    public static final String SOURCE_LINKED = "LINKED";
    public static final String SOURCE_MANUAL = "MANUAL";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "household_id", nullable = false)
    private Long householdId;

    @Column(name = "family_member_id", nullable = false)
    private Long familyMemberId;

    @Column(nullable = false)
    private String label;

    @Column(name = "last4")
    private String last4;

    @Column(name = "source_type", nullable = false)
    private String sourceType = SOURCE_MANUAL;

    /** Account id in account-aggregation-service (LINKED cards only). */
    @Column(name = "linked_account_id")
    private Long linkedAccountId;

    /** The guardian who owns the linked account — the only one allowed to sync it. */
    @Column(name = "linked_owner_user_id")
    private Long linkedOwnerUserId;

    @Column(name = "created_by_user_id", nullable = false)
    private Long createdByUserId;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
