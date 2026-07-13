package com.mywealthmanagement.financialcoreservice.goals;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "goals")
@Data
@NoArgsConstructor
public class Goal {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false)
    private String name;

    @Column(name = "goal_type", nullable = false)
    private String goalType = "SAVINGS"; // SAVINGS | DEBT_PAYOFF | NET_WORTH | CUSTOM

    // How auto progress is derived from linked accounts: MANUAL | BALANCE | CONTRIBUTIONS.
    @Column(name = "tracking_mode", nullable = false)
    private String trackingMode = "MANUAL";

    // Optional display currency; linked accounts in a different currency are skipped from auto totals.
    @Column(name = "currency")
    private String currency;

    @Column(name = "target_amount", nullable = false)
    private BigDecimal targetAmount = BigDecimal.ZERO;

    @Column(name = "current_amount", nullable = false)
    private BigDecimal currentAmount = BigDecimal.ZERO;

    @Column(name = "target_date")
    private LocalDate targetDate;

    @Column(name = "monthly_contribution")
    private BigDecimal monthlyContribution;

    // ---- DEBT_PAYOFF goals: pay down a real mortgage from a property or a linked loan account ----
    @Column(name = "property_id")
    private Long propertyId;

    @Column(name = "loan_account_id")
    private Long loanAccountId;

    // Balance owed when the goal started — the baseline for "paid down since you started".
    @Column(name = "starting_balance")
    private BigDecimal startingBalance;

    @Column(name = "mortgage_apr")
    private BigDecimal mortgageApr;

    @Column(name = "monthly_payment")
    private BigDecimal monthlyPayment;

    @Column(name = "extra_payment")
    private BigDecimal extraPayment;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
