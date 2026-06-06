package com.mywealthmanagement.financialcoreservice.debt;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "debt_scenarios")
@Data
@NoArgsConstructor
public class DebtScenario {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false)
    private String strategy; // AVALANCHE, SNOWBALL, HYBRID

    @Column(name = "extra_payment_monthly", nullable = false)
    private BigDecimal extraPaymentMonthly;

    @Column(name = "months_to_debt_free", nullable = false)
    private Integer monthsToDebtFree;

    @Column(name = "total_interest_paid", nullable = false)
    private BigDecimal totalInterestPaid;

    @Column(name = "debt_free_date")
    private LocalDate debtFreeDate;

    @Column
    private String liquidity;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    public DebtScenario(Long userId, String strategy, BigDecimal extraPaymentMonthly, Integer monthsToDebtFree, BigDecimal totalInterestPaid, LocalDate debtFreeDate, String liquidity) {
        this.userId = userId;
        this.strategy = strategy;
        this.extraPaymentMonthly = extraPaymentMonthly;
        this.monthsToDebtFree = monthsToDebtFree;
        this.totalInterestPaid = totalInterestPaid;
        this.debtFreeDate = debtFreeDate;
        this.liquidity = liquidity;
    }
}
