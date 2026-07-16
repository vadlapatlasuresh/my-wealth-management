package com.mywealthmanagement.paymentservice.subscription.dto;

import lombok.Data;

import java.util.Map;

/**
 * The resolved feature entitlements for the signed-in user's plan. `features` maps every
 * feature key to whether it is granted (plan grants it AND plan_feature.enabled is true).
 * Feature gating in the app reads this; toggling a plan_feature row flips it on the next fetch.
 */
@Data
public class EntitlementsDto {
    private String status;                 // subscription status (or NONE)
    private String planKey;                // active plan, or null
    private boolean entitled;              // status is TRIALING or ACTIVE
    private Map<String, Boolean> features; // featureKey -> granted
}
