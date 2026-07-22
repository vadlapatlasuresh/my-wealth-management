package com.mywealthmanagement.authservice.household;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/** A payment of a household bill by a specific member — powers "who paid what". */
@Entity
@Table(name = "household_bill_payment")
@Data
@NoArgsConstructor
public class HouseholdBillPayment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "household_bill_id", nullable = false)
    private Long householdBillId;

    @Column(name = "paid_by_user_id", nullable = false)
    private Long paidByUserId;

    @Column(nullable = false)
    private BigDecimal amount;

    @Column(name = "paid_on", nullable = false)
    private LocalDate paidOn;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
