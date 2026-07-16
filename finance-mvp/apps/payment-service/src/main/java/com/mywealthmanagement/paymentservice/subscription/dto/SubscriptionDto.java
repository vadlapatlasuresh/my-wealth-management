package com.mywealthmanagement.paymentservice.subscription.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** The signed-in user's current subscription state (null-ish when they have none). */
@Data
public class SubscriptionDto {
    private boolean subscribed;          // has any subscription row at all
    private String status;               // TRIALING | ACTIVE | PAST_DUE | CANCELED | EXPIRED | NONE
    private String planKey;
    private String planName;
    private String billingCycle;         // MONTHLY | ANNUAL | null
    private LocalDateTime trialStart;
    private LocalDateTime trialEnd;
    private Integer trialDaysRemaining;  // 0 when not trialing or elapsed
    private LocalDateTime currentPeriodEnd;
    private boolean cancelAtPeriodEnd;
    private BigDecimal lastAmount;
    private boolean inTrial;             // status == TRIALING and trial window still open
    private boolean active;              // status in {TRIALING, ACTIVE} (i.e. entitled)
}
