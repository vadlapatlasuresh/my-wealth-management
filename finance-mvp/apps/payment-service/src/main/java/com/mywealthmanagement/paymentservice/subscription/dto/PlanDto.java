package com.mywealthmanagement.paymentservice.subscription.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

/** A plan as rendered by the subscription-tier feature pages — everything from the DB. */
@Data
public class PlanDto {
    private String planKey;
    private String name;
    private String tagline;
    private Integer tier;
    private String currency;
    private BigDecimal monthlyPrice;
    private BigDecimal annualPrice;      // resolved (explicit or derived)
    private BigDecimal annualMonthlyEquivalent; // annualPrice / 12, for "billed annually" display
    private Integer annualSavingsPercent;       // vs paying monthly for a year
    private Integer trialDays;
    private String accent;
    private List<PlanFeatureDto> features;
}
