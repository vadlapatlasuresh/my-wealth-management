package com.mywealthmanagement.authservice.household;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** A recurring bill the household shares. */
@Entity
@Table(name = "household_bill")
@Data
@NoArgsConstructor
public class HouseholdBill {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "household_id", nullable = false)
    private Long householdId;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private BigDecimal amount;

    @Column(nullable = false)
    private String cadence; // MONTHLY | WEEKLY | YEARLY

    @Column(name = "due_day")
    private Integer dueDay;

    @Column(name = "created_by_user_id", nullable = false)
    private Long createdByUserId;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
