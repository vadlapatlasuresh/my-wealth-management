package com.mywealthmanagement.paymentservice.subscription;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

/**
 * A subscription plan in the catalog. Prices, trial length and annual configuration are
 * DB-editable so they can change without a code deploy.
 */
@Entity
@Table(name = "subscription_plan")
@Data
@NoArgsConstructor
public class SubscriptionPlan {

    @Id
    @Column(name = "plan_key", length = 50)
    private String planKey;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(length = 255)
    private String tagline;

    @Column(nullable = false)
    private Integer tier = 0;

    @Column(name = "monthly_price", nullable = false)
    private BigDecimal monthlyPrice;

    /** Explicit yearly price; when null the service derives it from monthly * annualMonths. */
    @Column(name = "annual_price")
    private BigDecimal annualPrice;

    @Column(name = "annual_months", nullable = false)
    private Integer annualMonths = 10;

    @Column(nullable = false, length = 10)
    private String currency = "USD";

    @Column(name = "trial_days", nullable = false)
    private Integer trialDays = 7;

    @Column(length = 20)
    private String accent;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;

    @Column(nullable = false)
    private Boolean active = true;

    /** Yearly price on the ANNUAL cycle: explicit column, else derived monthly * annualMonths. */
    @Transient
    public BigDecimal resolvedAnnualPrice() {
        if (annualPrice != null) return annualPrice;
        int months = annualMonths != null ? annualMonths : 12;
        return monthlyPrice.multiply(BigDecimal.valueOf(months));
    }
}
