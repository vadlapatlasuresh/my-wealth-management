package com.mywealthmanagement.authservice.family;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/** One append-only money movement for a family member. Balances are derived from these. */
@Entity
@Table(name = "family_ledger_entry")
@Data
@NoArgsConstructor
public class FamilyLedgerEntry {

    public static final String TYPE_ALLOWANCE = "ALLOWANCE";
    public static final String TYPE_CHORE = "CHORE";
    public static final String TYPE_GIFT = "GIFT";
    public static final String TYPE_SPEND = "SPEND";
    public static final String TYPE_ADJUSTMENT = "ADJUSTMENT";

    public static final String BUCKET_SPEND = "SPEND";
    public static final String BUCKET_SAVE = "SAVE";
    public static final String BUCKET_GIVE = "GIVE";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "family_member_id", nullable = false)
    private Long familyMemberId;

    @Column(name = "entry_type", nullable = false)
    private String entryType;

    @Column(nullable = false)
    private String bucket;

    /** Signed: positive adds to the bucket, negative takes out. */
    @Column(nullable = false)
    private BigDecimal amount;

    @Column(name = "occurred_on", nullable = false)
    private LocalDate occurredOn;

    private String note;

    @Column(name = "created_by_user_id", nullable = false)
    private Long createdByUserId;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
