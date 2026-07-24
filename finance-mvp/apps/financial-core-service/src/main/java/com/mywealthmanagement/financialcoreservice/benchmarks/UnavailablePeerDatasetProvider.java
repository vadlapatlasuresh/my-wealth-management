package com.mywealthmanagement.financialcoreservice.benchmarks;

import org.springframework.stereotype.Component;

/**
 * The DEFAULT peer dataset: none. Always answers {@code unavailable}.
 *
 * <p>Every other integration in this codebase ships a mock that returns realistic sample data.
 * This one deliberately does not, and that difference is the whole point:
 *
 * <p>A demo credit score is labeled "Demo" and teaches the user what the screen does. A demo
 * <em>peer benchmark</em> cannot be labeled into safety — "you have more saved than 68% of people
 * like you" is a factual claim about the world, and a made-up version of it is a lie whether or
 * not there is a badge next to it. It would also be the single most screenshot-and-shared number
 * in the app. So: no sample percentiles, no "illustrative" curve, nothing.
 *
 * <p>What the user gets instead is their own real figures plus an explicit "no comparison data
 * yet" state. What the engineer gets is a fully wired feature — consent, cohorts, k-anonymity,
 * page, tests — waiting on exactly one thing: a real dataset behind {@code benchmarks.provider}.
 *
 * <p><b>TODO(needs external resource): supply a real anonymized dataset before enabling.</b>
 * See docs/THIRD_PARTY_VENDORS.md → "Peer benchmark dataset". Acceptable sources are aggregate
 * and public/licensed (e.g. the Federal Reserve Survey of Consumer Finances percentile tables),
 * or our own users' data aggregated under a k-anonymity floor with separate explicit consent to
 * contribute. Buying individual-level consumer records is out of bounds — the product's stated
 * guardrail is no data-broker monetization.
 */
@Component
public class UnavailablePeerDatasetProvider implements PeerDatasetProvider {

    public static final String NAME = "none";

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public boolean isConfigured() {
        return true; // always usable — "we don't have this" is a valid, honest answer
    }

    @Override
    public Cohort percentiles(String metric, String ageBand, String incomeBand, String region) {
        return Cohort.unavailable(
                "We don't have a peer dataset connected yet, so there's nothing honest to compare "
                        + "you against. Your own numbers below are real.");
    }
}
