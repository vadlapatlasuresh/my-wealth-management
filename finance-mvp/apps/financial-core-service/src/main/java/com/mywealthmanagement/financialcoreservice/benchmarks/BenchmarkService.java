package com.mywealthmanagement.financialcoreservice.benchmarks;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Benchmarking (Phase 4, backlog B1): consent, cohort resolution, and the anonymity floor.
 *
 * <p>Three rules, in the order they are enforced:
 * <ol>
 *   <li><b>Opt-in.</b> No comparison is computed for a user who hasn't asked for one. The
 *       endpoint answers {@code optedIn:false} and the UI shows the invitation, not the data.</li>
 *   <li><b>k-anonymity.</b> A cohort smaller than {@code benchmarks.min-cohort} is suppressed
 *       even if the dataset offers it. Small cohorts are how "aggregate" quietly becomes
 *       "identifiable", and this is the only place that judgement should live.</li>
 *   <li><b>No invention.</b> Whatever the provider cannot answer stays unanswered. There is no
 *       interpolation, no "illustrative" curve, no demo percentiles.</li>
 * </ol>
 *
 * <p>Provider selection follows the app-wide toggle pattern: {@code benchmarks.provider}
 * (default {@code none}). The user's OWN metrics are computed client-side from data they already
 * have, so the page is useful — showing real personal figures — on the default configuration.
 */
@Service
public class BenchmarkService {

    private static final Logger log = LoggerFactory.getLogger(BenchmarkService.class);

    /** Metrics the page can compare. Kept small and defensible. */
    public static final List<String> METRICS = List.of("netWorth", "savingsRate", "emergencyMonths");

    private final BenchmarkConsentRepository consents;
    private final List<PeerDatasetProvider> providers;
    private final UnavailablePeerDatasetProvider none;
    private final String wanted;
    private final int minCohort;

    private PeerDatasetProvider active;

    public BenchmarkService(BenchmarkConsentRepository consents,
                            List<PeerDatasetProvider> providers,
                            UnavailablePeerDatasetProvider none,
                            @Value("${benchmarks.provider:none}") String wanted,
                            @Value("${benchmarks.min-cohort:100}") int minCohort) {
        this.consents = consents;
        this.providers = providers;
        this.none = none;
        this.wanted = (wanted == null || wanted.isBlank()) ? UnavailablePeerDatasetProvider.NAME : wanted.trim();
        this.minCohort = minCohort;
    }

    @PostConstruct
    void resolveActiveProvider() {
        PeerDatasetProvider chosen = providers.stream()
                .filter(p -> p.name().equalsIgnoreCase(wanted))
                .findFirst()
                .orElse(null);
        if (chosen == null) {
            log.warn("[BenchmarkService] Unknown benchmarks.provider='{}'; no peer data will be shown.", wanted);
            chosen = none;
        } else if (!chosen.isConfigured()) {
            log.warn("[BenchmarkService] Provider '{}' selected but not configured "
                    + "(benchmarks.dataset.path missing/unreadable); no peer data will be shown.", chosen.name());
            chosen = none;
        }
        active = chosen;
        log.info("[BenchmarkService] peer dataset -> provider '{}' (k-anonymity floor {})",
                active.name(), minCohort);
    }

    public String activeProviderName() {
        return active == null ? none.name() : active.name();
    }

    // ---------------------------------------------------------------- consent

    @Transactional(readOnly = true)
    public BenchmarkConsent consentOf(Long userId) {
        return consents.findById(userId).orElseGet(() -> {
            BenchmarkConsent c = new BenchmarkConsent();
            c.setUserId(userId);
            return c;
        });
    }

    @Transactional
    public BenchmarkConsent optIn(Long userId, String ageBand, String incomeBand, String region) {
        BenchmarkConsent c = consentOf(userId);
        c.setUserId(userId);
        c.setOptedIn(true);
        c.setAgeBand(blankToNull(ageBand));
        c.setIncomeBand(blankToNull(incomeBand));
        c.setRegion(blankToNull(region));
        c.setConsentedAt(LocalDateTime.now());
        c.setRevokedAt(null);
        return consents.save(c);
    }

    /** Revoking takes effect on the next request — nothing about the comparison is cached. */
    @Transactional
    public BenchmarkConsent optOut(Long userId) {
        BenchmarkConsent c = consentOf(userId);
        c.setUserId(userId);
        c.setOptedIn(false);
        c.setRevokedAt(LocalDateTime.now());
        return consents.save(c);
    }

    // ---------------------------------------------------------------- comparison

    /**
     * The full benchmark payload for a user: their consent state, the cohort they chose, and —
     * only when all three rules above pass — the percentile curves to plot against.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> benchmarksFor(Long userId) {
        BenchmarkConsent c = consentOf(userId);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("provider", activeProviderName());
        out.put("optedIn", c.isOptedIn());
        out.put("cohort", Map.of(
                "ageBand", nullToAll(c.getAgeBand()),
                "incomeBand", nullToAll(c.getIncomeBand()),
                "region", nullToAll(c.getRegion())));
        out.put("minCohortSize", minCohort);

        if (!c.isOptedIn()) {
            // Rule 1. Nothing is computed, so nothing can leak into logs or metrics either.
            out.put("available", false);
            out.put("reason", "Benchmarking is off. Turn it on to see how you compare — "
                    + "your data stays yours either way.");
            out.put("metrics", Map.of());
            return out;
        }

        Map<String, Object> metrics = new LinkedHashMap<>();
        boolean anyAvailable = false;
        for (String metric : METRICS) {
            PeerDatasetProvider.Cohort cohort = provider()
                    .percentiles(metric, c.getAgeBand(), c.getIncomeBand(), c.getRegion());
            Map<String, Object> m = new LinkedHashMap<>();

            if (!cohort.available()) {
                m.put("available", false);
                m.put("reason", cohort.reason());
            } else if (cohort.sampleSize() < minCohort) {
                // Rule 2. Suppressed on purpose — say so rather than quietly widening the cohort.
                m.put("available", false);
                m.put("reason", "Not enough people in this cohort to compare anonymously "
                        + "(needs at least " + minCohort + ").");
            } else {
                anyAvailable = true;
                m.put("available", true);
                m.put("source", cohort.source());
                m.put("sampleSize", cohort.sampleSize());
                Map<String, Object> pts = new LinkedHashMap<>();
                cohort.points().forEach((p, v) -> pts.put(String.valueOf(p), v));
                m.put("percentiles", pts);
            }
            metrics.put(metric, m);
        }

        out.put("available", anyAvailable);
        if (!anyAvailable) {
            out.put("reason", "No peer data is available for your cohort yet. "
                    + "Your own figures are still shown below.");
        }
        out.put("metrics", metrics);
        return out;
    }

    private PeerDatasetProvider provider() {
        return active == null ? none : active;
    }

    private static String blankToNull(String v) {
        return (v == null || v.isBlank()) ? null : v.trim();
    }

    private static String nullToAll(String v) {
        return v == null ? "all" : v;
    }
}
