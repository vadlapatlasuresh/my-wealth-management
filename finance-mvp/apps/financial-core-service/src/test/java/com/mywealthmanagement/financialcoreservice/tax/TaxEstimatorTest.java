package com.mywealthmanagement.financialcoreservice.tax;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

/** Golden-file tests against hand-computed 2025 IRS figures. */
class TaxEstimatorTest {

    private final TaxRules rules = new TaxRules();

    private TaxEstimateInput in(FilingStatus s, String gross, String adj, String item, int kids, String wh) {
        return new TaxEstimateInput(s, new BigDecimal(gross), new BigDecimal(adj),
                new BigDecimal(item), kids, new BigDecimal(wh));
    }

    @Test
    void single2025_standardDeduction() {
        // gross 60k, std 15k -> taxable 45k. 10% of 11,925 + 12% of (45,000-11,925).
        var e = TaxEstimator.estimate(in(FilingStatus.SINGLE, "60000", "0", "0", 0, "7000"), rules.forYear(2025));
        assertThat(e.getDeductionType()).isEqualTo("STANDARD");
        assertThat(e.getTaxableIncome()).isEqualByComparingTo("45000.00");
        assertThat(e.getTaxBeforeCredits()).isEqualByComparingTo("5161.50"); // 1192.50 + 3969.00
        assertThat(e.getTaxAfterCredits()).isEqualByComparingTo("5161.50");
        assertThat(e.getMarginalRate()).isEqualByComparingTo("0.12");
        assertThat(e.getRefundOrOwed()).isEqualByComparingTo("1838.50"); // 7000 - 5161.50
    }

    @Test
    void marriedJoint2025_itemized_withChildren() {
        // AGI 140k (150k - 10k adj), itemized 35k > std 30k. taxable 105k. 2 kids, no phase-out.
        var e = TaxEstimator.estimate(in(FilingStatus.MARRIED_JOINT, "150000", "10000", "35000", 2, "15000"), rules.forYear(2025));
        assertThat(e.getAgi()).isEqualByComparingTo("140000.00");
        assertThat(e.getDeductionType()).isEqualTo("ITEMIZED");
        assertThat(e.getTaxableIncome()).isEqualByComparingTo("105000.00");
        assertThat(e.getTaxBeforeCredits()).isEqualByComparingTo("12928.00");
        assertThat(e.getChildTaxCredit()).isEqualByComparingTo("4000.00");
        assertThat(e.getTaxAfterCredits()).isEqualByComparingTo("8928.00");
        assertThat(e.getRefundOrOwed()).isEqualByComparingTo("6072.00");
    }

    @Test
    void childTaxCreditPhasesOutOverThreshold() {
        // Single, AGI 215k, 1 kid. over = 15k -> 15 steps * $50 = $750 reduction. CTC = 1250.
        var e = TaxEstimator.estimate(in(FilingStatus.SINGLE, "215000", "0", "0", 1, "0"), rules.forYear(2025));
        assertThat(e.getChildTaxCredit()).isEqualByComparingTo("1250.00");
    }

    @Test
    void zeroIncomeYieldsZeroTax() {
        var e = TaxEstimator.estimate(in(FilingStatus.SINGLE, "0", "0", "0", 0, "0"), rules.forYear(2025));
        assertThat(e.getTaxableIncome()).isEqualByComparingTo("0.00");
        assertThat(e.getTaxAfterCredits()).isEqualByComparingTo("0.00");
        assertThat(e.getEffectiveRate()).isEqualByComparingTo("0");
    }

    @Test
    void unknownYearFallsBackToLatest() {
        assertThat(rules.forYear(1999).year()).isEqualTo(2025);
        assertThat(rules.forYear(2024).year()).isEqualTo(2024);
    }
}
