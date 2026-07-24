package com.mywealthmanagement.financialcoreservice.benchmarks;

import java.util.List;
import java.util.Map;

/**
 * A source of ANONYMIZED, AGGREGATE peer statistics — percentile curves for a cohort.
 *
 * <p>Same provider-toggle shape as the credit bureau and the notification channels: providers are
 * beans, {@link BenchmarkService} selects one from {@code benchmarks.provider}, and adding a
 * dataset is "write the bean + flip the property".
 *
 * <p><b>Hard product rule.</b> A provider returns percentile CURVES for a cohort — never a row
 * about a person, and never a number it made up. If a dataset cannot answer for a cohort, it says
 * so ({@link Cohort#unavailable}) and the UI shows the user their own figures with an honest
 * "no comparison available" state. Fabricated peer numbers are worse than no benchmark: the
 * feature's entire value is that the comparison is true.
 */
public interface PeerDatasetProvider {

    /** Config name matched against {@code benchmarks.provider}. */
    String name();

    /** Whether the dataset is present and loadable. An unconfigured provider is never used. */
    boolean isConfigured();

    /**
     * Percentiles for one metric within one cohort.
     *
     * @param metric    "netWorth" | "savingsRate" | "emergencyMonths"
     * @param ageBand   coarse band, or null for "all"
     * @param incomeBand coarse band, or null for "all"
     * @param region    coarse region, or null for "all"
     */
    Cohort percentiles(String metric, String ageBand, String incomeBand, String region);

    /**
     * A cohort's percentile curve.
     *
     * @param available   false when this dataset cannot honestly answer — the ONLY correct
     *                    response to "we don't have this data"
     * @param reason      human-readable explanation shown to the user when unavailable
     * @param source      attribution string (who published the data, which release)
     * @param sampleSize  number of underlying records; the k-anonymity floor is applied to it
     * @param points      percentile → value, e.g. {25: 12000, 50: 48000, 75: 190000}
     */
    record Cohort(boolean available, String reason, String source, int sampleSize,
                  Map<Integer, Double> points) {

        public static Cohort unavailable(String reason) {
            return new Cohort(false, reason, null, 0, Map.of());
        }

        /** The percentiles a curve must carry to be renderable. */
        public static final List<Integer> REQUIRED_PERCENTILES = List.of(10, 25, 50, 75, 90);
    }
}
