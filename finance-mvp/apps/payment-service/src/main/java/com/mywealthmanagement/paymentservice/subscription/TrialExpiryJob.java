package com.mywealthmanagement.paymentservice.subscription;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Sweeps expired free trials to EXPIRED so a lapsed trial stops granting entitlements even
 * if the user never reopens the app. Runs a few times a day (configurable via
 * subscriptions.trial-expiry.cron); disable with subscriptions.trial-expiry.enabled=false.
 * Reads are also lazily expired on access, so this is a backstop, not the only path.
 */
@Component
public class TrialExpiryJob {

    private final SubscriptionService subscriptionService;

    public TrialExpiryJob(SubscriptionService subscriptionService) {
        this.subscriptionService = subscriptionService;
    }

    @Scheduled(cron = "${subscriptions.trial-expiry.cron:0 0 */6 * * *}")
    public void expireTrials() {
        subscriptionService.expireElapsedTrials();
    }
}
