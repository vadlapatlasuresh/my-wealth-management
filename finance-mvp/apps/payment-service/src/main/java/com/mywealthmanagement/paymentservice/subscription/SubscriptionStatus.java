package com.mywealthmanagement.paymentservice.subscription;

/** Subscription lifecycle states. Stored as the string name on user_subscription.status. */
public enum SubscriptionStatus {
    TRIALING,   // in the free trial, no charge yet
    ACTIVE,     // paid + current
    PAST_DUE,   // a renewal/charge failed
    CANCELED,   // canceled by the user
    EXPIRED;    // trial ended without conversion

    public static boolean isLive(String status) {
        return TRIALING.name().equals(status) || ACTIVE.name().equals(status);
    }
}
