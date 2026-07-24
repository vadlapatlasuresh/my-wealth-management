package com.mywealthmanagement.authservice.family;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * A child/teen the HOUSEHOLD tracks. Not a user account — see V18__family_mode.sql for why that
 * distinction is load-bearing for authorization.
 */
@Entity
@Table(name = "family_member")
@Data
@NoArgsConstructor
public class FamilyMember {

    public static final String STATUS_ACTIVE = "ACTIVE";
    public static final String STATUS_ARCHIVED = "ARCHIVED";

    public static final String CADENCE_WEEKLY = "WEEKLY";
    public static final String CADENCE_BIWEEKLY = "BIWEEKLY";
    public static final String CADENCE_MONTHLY = "MONTHLY";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "household_id", nullable = false)
    private Long householdId;

    @Column(nullable = false)
    private String name;

    @Column(name = "birth_year")
    private Integer birthYear;

    /** Reserved for a future teen-with-their-own-login. Nothing reads it today. */
    @Column(name = "member_user_id")
    private Long memberUserId;

    @Column(name = "allowance_amount", nullable = false)
    private BigDecimal allowanceAmount = BigDecimal.ZERO;

    @Column(name = "allowance_cadence", nullable = false)
    private String allowanceCadence = CADENCE_WEEKLY;

    @Column(name = "allowance_day")
    private Integer allowanceDay;

    @Column(name = "split_spend_pct", nullable = false)
    private int splitSpendPct = 100;

    @Column(name = "split_save_pct", nullable = false)
    private int splitSavePct = 0;

    @Column(name = "split_give_pct", nullable = false)
    private int splitGivePct = 0;

    @Column(nullable = false)
    private String status = STATUS_ACTIVE;

    @Column(name = "created_by_user_id", nullable = false)
    private Long createdByUserId;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
