package com.mywealthmanagement.financialcoreservice.tax;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * The latest computed estimate for a user in a given tax year — one row per (user, year), upserted
 * each time they calculate. Powers the year-over-year history view (AGI, tax, effective rate,
 * refund/owed trend). Distinct from {@link TaxProfile}, which stores raw inputs.
 */
@Entity
@Table(name = "tax_estimate_snapshot",
        uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "tax_year"}))
@Data
@NoArgsConstructor
public class TaxEstimateSnapshot {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "tax_year", nullable = false)
    private Integer taxYear;

    @Column(name = "filing_status", length = 30)
    private String filingStatus;

    @Column(name = "gross_income")     private BigDecimal grossIncome;
    @Column(name = "agi")              private BigDecimal agi;
    @Column(name = "taxable_income")   private BigDecimal taxableIncome;
    @Column(name = "total_tax")        private BigDecimal totalTax;        // tax after credits
    @Column(name = "effective_rate")   private BigDecimal effectiveRate;
    @Column(name = "marginal_rate")    private BigDecimal marginalRate;
    @Column(name = "withholding")      private BigDecimal withholding;
    @Column(name = "refund_or_owed")   private BigDecimal refundOrOwed;    // positive = refund

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
