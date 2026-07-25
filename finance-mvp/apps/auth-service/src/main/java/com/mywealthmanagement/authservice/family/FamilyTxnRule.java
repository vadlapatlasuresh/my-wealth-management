package com.mywealthmanagement.authservice.family;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * How a synced transaction gets attributed to a child. CARD routes every transaction on a linked
 * card; LOCATION matches a merchant/location substring (case-insensitive). Household-owned.
 */
@Entity
@Table(name = "family_txn_rule")
@Data
@NoArgsConstructor
public class FamilyTxnRule {

    public static final String MATCH_CARD = "CARD";
    public static final String MATCH_LOCATION = "LOCATION";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "household_id", nullable = false)
    private Long householdId;

    @Column(name = "family_member_id", nullable = false)
    private Long familyMemberId;

    @Column(name = "match_type", nullable = false)
    private String matchType;

    /** For CARD rules — the family_card to route. */
    @Column(name = "card_id")
    private Long cardId;

    /** For LOCATION rules — a merchant/location substring to match. */
    @Column(name = "location_match")
    private String locationMatch;

    @Column(nullable = false)
    private String bucket = "SPEND";

    @Column(name = "created_by_user_id", nullable = false)
    private Long createdByUserId;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
