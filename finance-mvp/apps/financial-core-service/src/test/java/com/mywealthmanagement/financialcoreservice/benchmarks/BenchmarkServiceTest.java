package com.mywealthmanagement.financialcoreservice.benchmarks;

import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * These tests exist to pin the three promises the benchmark feature makes to users, because
 * every one of them is the kind of thing that erodes silently under a refactor:
 * opt-in first, small cohorts suppressed, and never a fabricated number.
 */
class BenchmarkServiceTest {

    /** In-memory consent store: a mock backed by a map, so opt-in/opt-out really round-trips. */
    private static BenchmarkConsentRepository consentStore() {
        Map<Long, BenchmarkConsent> rows = new HashMap<>();
        BenchmarkConsentRepository repo = org.mockito.Mockito.mock(BenchmarkConsentRepository.class);
        org.mockito.Mockito.when(repo.findById(org.mockito.ArgumentMatchers.anyLong()))
                .thenAnswer(inv -> Optional.ofNullable(rows.get(inv.<Long>getArgument(0))));
        org.mockito.Mockito.when(repo.save(org.mockito.ArgumentMatchers.any(BenchmarkConsent.class)))
                .thenAnswer(inv -> {
                    BenchmarkConsent c = inv.getArgument(0);
                    rows.put(c.getUserId(), c);
                    return c;
                });
        return repo;
    }

    /** A dataset that always answers with the given cohort. */
    private static PeerDatasetProvider datasetOf(String name, PeerDatasetProvider.Cohort cohort) {
        return new PeerDatasetProvider() {
            @Override public String name() { return name; }
            @Override public boolean isConfigured() { return true; }
            @Override public Cohort percentiles(String m, String a, String i, String r) { return cohort; }
        };
    }

    private static PeerDatasetProvider.Cohort curve(int sampleSize) {
        return new PeerDatasetProvider.Cohort(true, null, "Test dataset 2026", sampleSize,
                Map.of(10, 900.0, 25, 14500.0, 50, 91300.0, 75, 310000.0, 90, 890000.0));
    }

    private BenchmarkService service(BenchmarkConsentRepository consents, String wanted, int minCohort,
                                     PeerDatasetProvider... extra) {
        UnavailablePeerDatasetProvider none = new UnavailablePeerDatasetProvider();
        List<PeerDatasetProvider> all = new java.util.ArrayList<>();
        all.add(none);
        all.addAll(List.of(extra));
        BenchmarkService s = new BenchmarkService(consents, all, none, wanted, minCohort);
        s.resolveActiveProvider();
        return s;
    }

    @Test
    void defaultConfigurationShowsNoPeerDataAtAll() {
        BenchmarkService s = service(consentStore(), "none", 100);
        assertThat(s.activeProviderName()).isEqualTo("none");

        s.optIn(1L, "35_44", null, null);
        Map<String, Object> out = s.benchmarksFor(1L);
        assertThat(out.get("optedIn")).isEqualTo(true);
        // The core promise: with no dataset wired, there are NO numbers — not sample ones.
        assertThat(out.get("available")).isEqualTo(false);
        @SuppressWarnings("unchecked")
        Map<String, Map<String, Object>> metrics = (Map<String, Map<String, Object>>) out.get("metrics");
        for (String metric : BenchmarkService.METRICS) {
            assertThat(metrics.get(metric).get("available")).isEqualTo(false);
            assertThat(metrics.get(metric)).doesNotContainKey("percentiles");
        }
    }

    @Test
    void computesNothingUntilTheUserOptsIn() {
        BenchmarkService s = service(consentStore(), "test", 10, datasetOf("test", curve(5000)));
        Map<String, Object> out = s.benchmarksFor(7L);
        assertThat(out.get("optedIn")).isEqualTo(false);
        assertThat(out.get("available")).isEqualTo(false);
        assertThat(out.get("metrics")).isEqualTo(Map.of());
    }

    @Test
    void servesPercentilesOnceOptedInWithAWellPopulatedCohort() {
        BenchmarkService s = service(consentStore(), "test", 100, datasetOf("test", curve(5000)));
        s.optIn(7L, "35_44", "100_200k", "US_WEST");

        Map<String, Object> out = s.benchmarksFor(7L);
        assertThat(out.get("available")).isEqualTo(true);
        assertThat(out.get("cohort")).isEqualTo(
                Map.of("ageBand", "35_44", "incomeBand", "100_200k", "region", "US_WEST"));

        @SuppressWarnings("unchecked")
        Map<String, Map<String, Object>> metrics = (Map<String, Map<String, Object>>) out.get("metrics");
        Map<String, Object> nw = metrics.get("netWorth");
        assertThat(nw.get("available")).isEqualTo(true);
        assertThat(nw.get("sampleSize")).isEqualTo(5000);
        assertThat(nw.get("source")).isEqualTo("Test dataset 2026");
        @SuppressWarnings("unchecked")
        Map<String, Object> pts = (Map<String, Object>) nw.get("percentiles");
        assertThat(pts).containsKeys("10", "25", "50", "75", "90");
    }

    @Test
    void suppressesCohortsBelowTheAnonymityFloor() {
        BenchmarkService s = service(consentStore(), "test", 100, datasetOf("test", curve(42)));
        s.optIn(7L, "35_44", null, null);

        Map<String, Object> out = s.benchmarksFor(7L);
        assertThat(out.get("available")).isEqualTo(false);
        @SuppressWarnings("unchecked")
        Map<String, Map<String, Object>> metrics = (Map<String, Map<String, Object>>) out.get("metrics");
        assertThat(metrics.get("netWorth").get("available")).isEqualTo(false);
        assertThat(String.valueOf(metrics.get("netWorth").get("reason")))
                .contains("Not enough people");
    }

    @Test
    void optingOutStopsTheComparisonImmediately() {
        BenchmarkService s = service(consentStore(), "test", 10, datasetOf("test", curve(5000)));
        s.optIn(7L, null, null, null);
        assertThat(s.benchmarksFor(7L).get("available")).isEqualTo(true);

        s.optOut(7L);
        Map<String, Object> out = s.benchmarksFor(7L);
        assertThat(out.get("optedIn")).isEqualTo(false);
        assertThat(out.get("available")).isEqualTo(false);
        assertThat(out.get("metrics")).isEqualTo(Map.of());
    }

    @Test
    void anUnconfiguredProviderDegradesToNoDataRatherThanFailing() {
        PeerDatasetProvider unconfigured = new PeerDatasetProvider() {
            @Override public String name() { return "file"; }
            @Override public boolean isConfigured() { return false; }
            @Override public Cohort percentiles(String m, String a, String i, String r) { return curve(9999); }
        };
        BenchmarkService s = service(consentStore(), "file", 100, unconfigured);
        assertThat(s.activeProviderName()).isEqualTo("none");
        s.optIn(1L, null, null, null);
        assertThat(s.benchmarksFor(1L).get("available")).isEqualTo(false);
    }

    // ------------------------------------------------------------ file dataset

    @Test
    void fileProviderLoadsPublishedPercentilesAndMatchesMostSpecificCohortFirst() throws Exception {
        Path f = Files.createTempFile("peer-dataset", ".json");
        Files.writeString(f, """
                {"source":"Federal Reserve, Survey of Consumer Finances 2022",
                 "cohorts":[
                  {"metric":"netWorth","ageBand":null,"incomeBand":null,"region":null,"sampleSize":4000,
                   "points":{"10":100,"25":1000,"50":10000,"75":100000,"90":500000}},
                  {"metric":"netWorth","ageBand":"35_44","incomeBand":null,"region":null,"sampleSize":1340,
                   "points":{"10":900,"25":14500,"50":91300,"75":310000,"90":890000}}
                 ]}
                """);
        FilePeerDatasetProvider p = new FilePeerDatasetProvider(f.toString());
        assertThat(p.isConfigured()).isTrue();

        PeerDatasetProvider.Cohort specific = p.percentiles("netWorth", "35_44", "100_200k", "US_WEST");
        assertThat(specific.available()).isTrue();
        assertThat(specific.sampleSize()).isEqualTo(1340); // widened to the age-band row, not the all row
        assertThat(specific.source()).contains("Survey of Consumer Finances");

        PeerDatasetProvider.Cohort broad = p.percentiles("netWorth", "65_plus", null, null);
        assertThat(broad.sampleSize()).isEqualTo(4000); // falls back to the all-cohort row

        // A metric the dataset simply doesn't cover stays unanswered.
        assertThat(p.percentiles("savingsRate", "35_44", null, null).available()).isFalse();
        Files.deleteIfExists(f);
    }

    @Test
    void fileProviderRejectsAnIncompleteCurveInsteadOfPlottingHalfOfIt() throws Exception {
        Path f = Files.createTempFile("peer-partial", ".json");
        Files.writeString(f, """
                {"source":"partial","cohorts":[
                 {"metric":"netWorth","sampleSize":9000,"points":{"50":50000}}]}
                """);
        FilePeerDatasetProvider p = new FilePeerDatasetProvider(f.toString());
        assertThat(p.percentiles("netWorth", null, null, null).available()).isFalse();
        Files.deleteIfExists(f);
    }

    @Test
    void fileProviderIsNotConfiguredWithoutAReadablePath() {
        assertThat(new FilePeerDatasetProvider("").isConfigured()).isFalse();
        assertThat(new FilePeerDatasetProvider("/nope/does-not-exist.json").isConfigured()).isFalse();
    }
}
