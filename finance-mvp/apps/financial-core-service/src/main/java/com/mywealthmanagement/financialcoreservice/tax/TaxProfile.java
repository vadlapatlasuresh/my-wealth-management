package com.mywealthmanagement.financialcoreservice.tax;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** A user's saved tax inputs (one per user), so the estimate persists across sessions. */
@Entity
@Table(name = "tax_profile", uniqueConstraints = @UniqueConstraint(columnNames = "user_id"))
@Data
@NoArgsConstructor
public class TaxProfile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "tax_year", nullable = false)
    private Integer taxYear;

    @Column(name = "filing_status", length = 30)
    private String filingStatus;

    @Column(name = "gross_income")          private BigDecimal grossIncome;
    @Column(name = "adjustments")           private BigDecimal adjustments;
    @Column(name = "itemized_deductions")   private BigDecimal itemizedDeductions;
    @Column(name = "dependents_under_17")   private Integer dependentsUnder17;
    @Column(name = "withholding")           private BigDecimal withholding;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
