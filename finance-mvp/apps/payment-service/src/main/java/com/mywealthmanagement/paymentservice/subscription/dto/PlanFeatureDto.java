package com.mywealthmanagement.paymentservice.subscription.dto;

import lombok.Data;

/** A single feature row rendered on a tier page. */
@Data
public class PlanFeatureDto {
    private String featureKey;
    private String label;
    private String description;
    private Boolean enabled;
}
