package com.mywealthmanagement.accountaggregationservice.credit;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * The always-available demo bureau. Delegates to {@link CreditService}'s deterministic generator,
 * so the profile is stable per user across calls and clearly marked {@code provider="demo"} —
 * the client keeps its "Demo" banner and never presents this as a real score.
 *
 * <p>This is the mock half of the config-flag + mock-fallback pattern, and also the router's
 * last-resort fallback: the endpoint therefore never fails or 404s just because no bureau is
 * under contract.
 */
@Component
@RequiredArgsConstructor
public class DemoCreditBureauProvider implements CreditBureauProvider {

    /** Also accepted as "mock" by the router, matching the notification-service naming. */
    public static final String NAME = "demo";

    private final CreditService creditService;

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public boolean isConfigured() {
        return true; // no credentials needed — that is the point
    }

    @Override
    public Map<String, Object> fetchProfile(long userId) {
        return creditService.profileFor(userId);
    }
}
