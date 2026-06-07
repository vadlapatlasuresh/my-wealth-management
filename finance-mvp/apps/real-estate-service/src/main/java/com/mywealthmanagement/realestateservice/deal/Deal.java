package com.mywealthmanagement.realestateservice.deal;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * A user-registered investment deal/opportunity (real estate or other asset class).
 * Each deal is owned by the user who created it; all reads/writes are scoped to the
 * authenticated owner in {@link DealService}.
 */
@Entity
@Table(name = "deals")
@Data
@NoArgsConstructor
public class Deal {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false, length = 200)
    private String title;

    // REAL_ESTATE | BUSINESS | PRIVATE_EQUITY | STARTUP | OTHER
    @Column(nullable = false, length = 40)
    private String category;

    // Category-specific sub-type, e.g. MULTIFAMILY / SINGLE_FAMILY / TOWNHOMES / CONSTRUCTION.
    @Column(length = 40)
    private String subcategory;

    // FIXED (annual % range) | EQUITY (target IRR) | HYBRID (both).
    @Column(name = "return_type", length = 20)
    private String returnType;

    // Fixed/preferred annual return, as a percentage. For a range (e.g. 12–24%) both are set.
    @Column(name = "annual_return_min")
    private BigDecimal annualReturnMin;

    @Column(name = "annual_return_max")
    private BigDecimal annualReturnMax;

    // MONTHLY | QUARTERLY | ANNUAL | AT_EXIT
    @Column(name = "distribution_frequency", length = 20)
    private String distributionFrequency;

    @Column(length = 2000)
    private String description;

    @Column(length = 200)
    private String location;

    // External link: the project page, LLC website, or data room.
    @Column(name = "website_url", length = 500)
    private String websiteUrl;

    @Column(name = "target_raise")
    private BigDecimal targetRaise;

    @Column(name = "min_investment")
    private BigDecimal minInvestment;

    // Target internal rate of return, as a percentage (e.g. 18.5 = 18.5%).
    @Column(name = "target_irr")
    private BigDecimal targetIrr;

    @Column(name = "hold_period_months")
    private Integer holdPeriodMonths;

    // DRAFT | OPEN | CLOSED | FUNDED
    @Column(nullable = false, length = 20)
    private String status;

    @Column(name = "amount_committed", nullable = false)
    private BigDecimal amountCommitted = BigDecimal.ZERO;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
