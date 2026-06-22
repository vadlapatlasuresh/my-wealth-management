package com.mywealthmanagement.financialcoreservice.tax;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class TaxInsightsTest {

    private final TaxRuleSet rules = new TaxRules().forYear(2025);

    private List<Insight> insightsFor(TaxEstimateInput in) {
        TaxEstimate est = TaxEstimator.estimate(in, rules);
        return TaxInsights.generate(in, est, rules);
    }

    private boolean has(List<Insight> list, String type, String titleContains) {
        return list.stream().anyMatch(i -> i.type().equals(type) && i.title().toLowerCase().contains(titleContains));
    }

    private TaxEstimateInput in(FilingStatus s, String gross, String item, int kids, String wh) {
        return new TaxEstimateInput(s, new BigDecimal(gross), BigDecimal.ZERO, new BigDecimal(item), kids, new BigDecimal(wh));
    }

    @Test
    void suggestsItemizingWhenItemizedExceedsStandard() {
        var tips = insightsFor(in(FilingStatus.SINGLE, "120000", "25000", 0, "0")); // std 15k < 25k
        assertThat(has(tips, "TIP", "itemizing")).isTrue();
    }

    @Test
    void notesStandardIsBetterWhenItemizedIsLow() {
        var tips = insightsFor(in(FilingStatus.SINGLE, "120000", "5000", 0, "0"));
        assertThat(has(tips, "INFO", "standard deduction is better")).isTrue();
    }

    @Test
    void surfacesChildTaxCreditAndContributionOpportunity() {
        var tips = insightsFor(in(FilingStatus.MARRIED_JOINT, "120000", "0", 2, "0"));
        assertThat(has(tips, "TIP", "child tax credit")).isTrue();
        assertThat(has(tips, "OPPORTUNITY", "pre-tax")).isTrue();
    }

    @Test
    void promptsForWithholdingThenWarnsWhenShort() {
        assertThat(has(insightsFor(in(FilingStatus.SINGLE, "80000", "0", 0, "0")), "INFO", "withholding")).isTrue();
        assertThat(has(insightsFor(in(FilingStatus.SINGLE, "80000", "0", 0, "1000")), "WARNING", "owe")).isTrue();
    }
}
