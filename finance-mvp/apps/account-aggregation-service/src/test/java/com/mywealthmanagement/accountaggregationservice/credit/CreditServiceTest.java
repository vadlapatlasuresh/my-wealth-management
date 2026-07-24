package com.mywealthmanagement.accountaggregationservice.credit;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class CreditServiceTest {

    private final CreditService service = new CreditService();

    @Test
    void isDeterministicForTheSameUser() {
        Map<String, Object> a = service.profileFor(42L);
        Map<String, Object> b = service.profileFor(42L);
        assertThat(a.get("score")).isEqualTo(b.get("score"));
        assertThat(a.get("history")).isEqualTo(b.get("history"));
    }

    @Test
    void differsAcrossUsers() {
        int s1 = (int) service.profileFor(1L).get("score");
        int s2 = (int) service.profileFor(999L).get("score");
        // Not a hard guarantee for every pair, but these two seeds must differ.
        assertThat(s1).isNotEqualTo(s2);
    }

    @Test
    @SuppressWarnings("unchecked")
    void producesAValidInRangeDemoProfile() {
        Map<String, Object> p = service.profileFor(7L);
        assertThat(p.get("provider")).isEqualTo("demo");
        int score = (int) p.get("score");
        assertThat(score).isBetween(300, 850);

        List<Map<String, Object>> history = (List<Map<String, Object>>) p.get("history");
        assertThat(history).hasSize(12);
        assertThat(history.get(11).get("score")).isEqualTo(score); // last point is current

        Map<String, Object> util = (Map<String, Object>) p.get("utilization");
        assertThat(((Number) util.get("balance")).intValue())
                .isLessThanOrEqualTo(((Number) util.get("limit")).intValue());

        // Raw metrics the web client derives factors from are present + sane.
        assertThat(((Number) p.get("onTimePct")).doubleValue()).isBetween(0.0, 1.0);
        assertThat(((Number) p.get("accountTypes")).intValue()).isBetween(2, 4);
    }
}
