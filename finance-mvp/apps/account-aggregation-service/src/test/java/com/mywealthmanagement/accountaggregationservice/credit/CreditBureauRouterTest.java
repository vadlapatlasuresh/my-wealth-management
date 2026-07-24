package com.mywealthmanagement.accountaggregationservice.credit;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The router's job is one guarantee: the endpoint always answers, and it never labels demo data
 * as a real bureau score. These tests pin exactly that, plus the vendor field mapping.
 */
class CreditBureauRouterTest {

    private final CreditService creditService = new CreditService();
    private final DemoCreditBureauProvider demo = new DemoCreditBureauProvider(creditService);
    private final ObjectMapper mapper = new ObjectMapper();

    private CreditBureauRouter router(String wanted, CreditBureauProvider... extra) {
        List<CreditBureauProvider> all = new java.util.ArrayList<>();
        all.add(demo);
        all.addAll(List.of(extra));
        CreditBureauRouter r = new CreditBureauRouter(all, demo, wanted);
        r.resolveActiveProvider();
        return r;
    }

    /** A provider that is configured and returns whatever it is told to. */
    private static CreditBureauProvider stub(String name, boolean configured, Map<String, Object> payload) {
        return new CreditBureauProvider() {
            @Override public String name() { return name; }
            @Override public boolean isConfigured() { return configured; }
            @Override public Map<String, Object> fetchProfile(long userId) {
                if (payload == null) {
                    throw new IllegalStateException("bureau down");
                }
                return payload;
            }
        };
    }

    @Test
    void defaultsToTheDemoProviderAndLabelsItAsDemo() {
        CreditBureauRouter r = router("demo");
        assertThat(r.activeProviderName()).isEqualTo("demo");
        assertThat(r.isLive()).isFalse();
        assertThat(r.profileFor(42L).get("provider")).isEqualTo("demo");
    }

    @Test
    void treatsMockAsAnAliasForDemo() {
        assertThat(router("mock").activeProviderName()).isEqualTo("demo");
    }

    @Test
    void unknownProviderNameFallsBackToDemoRatherThanFailingBoot() {
        CreditBureauRouter r = router("some-bureau-we-never-wired");
        assertThat(r.activeProviderName()).isEqualTo("demo");
        assertThat(r.profileFor(1L).get("score")).isNotNull();
    }

    @Test
    void selectedButUnconfiguredProviderFallsBackToDemo() {
        CreditBureauRouter r = router("http", stub("http", false, Map.of("provider", "live", "score", 700)));
        assertThat(r.activeProviderName()).isEqualTo("demo");
        assertThat(r.isLive()).isFalse();
    }

    @Test
    void usesAConfiguredLiveProvider() {
        CreditBureauRouter r = router("http", stub("http", true, Map.of("provider", "live", "score", 728)));
        assertThat(r.isLive()).isTrue();
        Map<String, Object> p = r.profileFor(9L);
        assertThat(p.get("provider")).isEqualTo("live");
        assertThat(p.get("score")).isEqualTo(728);
    }

    @Test
    void aFailingLiveProviderDegradesToDemoAndStaysLabelledDemo() {
        CreditBureauRouter r = router("http", stub("http", true, null));
        Map<String, Object> p = r.profileFor(9L);
        // The critical assertion: a bureau outage must never surface demo numbers as "live".
        assertThat(p.get("provider")).isEqualTo("demo");
        assertThat(p.get("score")).isNotNull();
    }

    @Test
    void aLiveProviderReturningNoScoreDegradesToDemo() {
        CreditBureauRouter r = router("http", stub("http", true, Map.of("provider", "live")));
        assertThat(r.profileFor(9L).get("provider")).isEqualTo("demo");
    }

    // ------------------------------------------------------------ vendor field mapping

    private HttpCreditBureauProvider httpProvider() {
        // base-url + api-key make it "configured"; we only exercise normalize() here.
        return new HttpCreditBureauProvider(
                "https://bureau.example", "/v1/{userId}", "k", "X-API-Key", "", "", "",
                "score", "delta", "asOf", "history", "month", "score",
                "utilization.pct", "utilization.balance", "utilization.limit",
                "onTimePct", "avgAgeMonths", "accountTypes", "inquiries12mo");
    }

    private JsonNode json(String s) {
        try {
            return mapper.readTree(s);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    @Test
    void httpProviderMapsAVendorPayloadOntoOurContract() {
        Map<String, Object> out = httpProvider().normalize(json("""
                {"score":742,"asOf":"2026-07-01",
                 "history":[{"month":"Jun","score":735},{"month":"Jul","score":742}],
                 "utilization":{"balance":900,"limit":6000},
                 "onTimePct":0.99,"avgAgeMonths":74,"accountTypes":3,"inquiries12mo":1}
                """));

        assertThat(out.get("provider")).isEqualTo("live");
        assertThat(out.get("score")).isEqualTo(742);
        assertThat(out.get("asOf")).isEqualTo("2026-07-01");
        // delta wasn't sent, so it is derived from the previous history point (742 - 735).
        assertThat(out.get("delta")).isEqualTo(7);
        // utilization pct wasn't sent either; balance/limit imply it.
        @SuppressWarnings("unchecked")
        Map<String, Object> util = (Map<String, Object>) out.get("utilization");
        assertThat(((Number) util.get("pct")).doubleValue()).isEqualTo(0.15);
        assertThat(out).containsEntry("accountTypes", 3);
    }

    @Test
    void httpProviderRefusesAnUnusableScoreInsteadOfInventingOne() {
        assertThatThrownBy(() -> httpProvider().normalize(json("{\"score\":42}")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("no usable score");
        assertThatThrownBy(() -> httpProvider().normalize(json("{}")))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void httpProviderOmitsMetricsTheBureauDidNotSend() {
        Map<String, Object> out = httpProvider().normalize(json("{\"score\":700}"));
        // Nothing invented: absent metrics stay absent so the client normalizer defaults them.
        assertThat(out).doesNotContainKeys("onTimePct", "avgAgeMonths", "accountTypes", "inquiries12mo");
        assertThat(out).doesNotContainKey("utilization");
        assertThat(out.get("delta")).isEqualTo(0);
    }

    @Test
    void httpProviderIsNotConfiguredWithoutBaseUrlOrAuth() {
        HttpCreditBureauProvider noUrl = new HttpCreditBureauProvider(
                "", "/v1/{userId}", "k", "X-API-Key", "", "", "",
                "score", "delta", "asOf", "history", "month", "score",
                "utilization.pct", "utilization.balance", "utilization.limit",
                "onTimePct", "avgAgeMonths", "accountTypes", "inquiries12mo");
        assertThat(noUrl.isConfigured()).isFalse();

        HttpCreditBureauProvider noAuth = new HttpCreditBureauProvider(
                "https://bureau.example", "/v1/{userId}", "", "X-API-Key", "", "", "",
                "score", "delta", "asOf", "history", "month", "score",
                "utilization.pct", "utilization.balance", "utilization.limit",
                "onTimePct", "avgAgeMonths", "accountTypes", "inquiries12mo");
        assertThat(noAuth.isConfigured()).isFalse();
        assertThatThrownBy(() -> noAuth.fetchProfile(1L)).isInstanceOf(IllegalStateException.class);
    }
}
