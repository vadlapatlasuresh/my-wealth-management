package com.mywealthmanagement.authservice.household;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * A recurring income source the HOUSEHOLD tracks, attributed to one of its members. Household-owned
 * like {@link HouseholdGoal}/{@link HouseholdBill} — not a view of anyone's personal pay data.
 */
@Entity
@Table(name = "household_income")
@Data
@NoArgsConstructor
public class HouseholdIncome {

    public static final String CADENCE_WEEKLY = "WEEKLY";
    public static final String CADENCE_MONTHLY = "MONTHLY";
    public static final String CADENCE_YEARLY = "YEARLY";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "household_id", nullable = false)
    private Long householdId;

    /** Which household member earns it — always one of the household's own members. */
    @Column(name = "member_user_id", nullable = false)
    private Long memberUserId;

    @Column(nullable = false)
    private String source;

    @Column(nullable = false)
    private BigDecimal amount;

    @Column(nullable = false)
    private String cadence = CADENCE_MONTHLY;

    @Column(nullable = false)
    private boolean active = true;

    @Column(name = "created_by_user_id", nullable = false)
    private Long createdByUserId;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
