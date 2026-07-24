package com.mywealthmanagement.accountaggregationservice.credit;

import java.util.Map;

/**
 * One source of a consumer credit profile.
 *
 * <p>Mirrors the {@code ChannelProvider} pattern in notification-service: every provider is a
 * bean, {@link CreditBureauRouter} picks the active one from config, and adding a bureau is
 * "write the bean + flip {@code credit.provider}". No feature code changes.
 *
 * <p><b>Contract for the returned map.</b> It must match what the web client's
 * {@code normalizeLiveProfile()} (apps/web/src/utils/creditMonitoring.js) reads:
 * <pre>
 *   provider    "demo" | "live"   — honesty marker; the UI keeps its Demo banner on "demo"
 *   score       int, 300..850     — FICO scale
 *   delta       int               — change vs the previous report
 *   asOf        ISO date string
 *   scaleMin/scaleMax  int
 *   history     [{ month, score }] oldest → newest, last point == score
 *   utilization { pct, balance, limit }
 *   onTimePct, avgAgeMonths, accountTypes, inquiries12mo  — raw metrics the client
 *               derives the weighted FICO factor breakdown from
 *   changes     [{ type, direction, title, detail, date }]
 * </pre>
 * A provider that cannot honestly fill a field should omit it rather than invent it — the client
 * normalizer defaults missing fields instead of showing a fabricated number.
 */
public interface CreditBureauProvider {

    /** Config name matched against {@code credit.provider}. */
    String name();

    /**
     * Whether this provider has everything it needs to answer (credentials, base URL, …).
     * An unconfigured provider is never selected — the router falls back to the demo provider
     * rather than serving an error or, worse, a fabricated score.
     */
    boolean isConfigured();

    /** Fetch the profile for a user. May throw; the router treats a throw as a miss. */
    Map<String, Object> fetchProfile(long userId);
}
