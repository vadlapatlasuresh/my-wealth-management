package com.mywealthmanagement.financialcoreservice.tax;

import com.mywealthmanagement.financialcoreservice.tax.TaxRuleSet.Bracket;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Versioned federal tax-rule sets, keyed by tax year. Numbers are the official IRS
 * inflation-adjusted figures (Rev. Proc. 2023-34 for 2024, Rev. Proc. 2024-40 for 2025).
 *
 * MAINTENANCE: each fall the IRS publishes next year's adjustments — add a new year here
 * (or, later, publish it from platform-config-service) AFTER a tax SME confirms the
 * numbers. Prior years stay immutable so back-year estimates never change.
 *
 * SCOPE: this drives an EDUCATIONAL ESTIMATE only (ordinary income, standard vs itemized,
 * child tax credit). It intentionally omits AMT, NIIT, capital-gains brackets, SE tax,
 * and most credits — those come in later phases. Texas has no state income tax.
 */
@Component
public class TaxRules {

    private static BigDecimal bd(String s) { return new BigDecimal(s); }
    private static Bracket br(String rate, String upTo) {
        return new Bracket(bd(rate), upTo == null ? null : bd(upTo));
    }

    // ---- 2024 (Rev. Proc. 2023-34) ----
    private static final TaxRuleSet Y2024 = new TaxRuleSet(
            2024,
            Map.of(
                FilingStatus.SINGLE, List.of(
                    br("0.10", "11600"), br("0.12", "47150"), br("0.22", "100525"),
                    br("0.24", "191950"), br("0.32", "243725"), br("0.35", "609350"), br("0.37", null)),
                FilingStatus.MARRIED_JOINT, List.of(
                    br("0.10", "23200"), br("0.12", "94300"), br("0.22", "201050"),
                    br("0.24", "383900"), br("0.32", "487450"), br("0.35", "731200"), br("0.37", null)),
                FilingStatus.MARRIED_SEPARATE, List.of(
                    br("0.10", "11600"), br("0.12", "47150"), br("0.22", "100525"),
                    br("0.24", "191950"), br("0.32", "243725"), br("0.35", "365600"), br("0.37", null)),
                FilingStatus.HEAD_OF_HOUSEHOLD, List.of(
                    br("0.10", "16550"), br("0.12", "63100"), br("0.22", "100500"),
                    br("0.24", "191950"), br("0.32", "243700"), br("0.35", "609350"), br("0.37", null))),
            Map.of(
                FilingStatus.SINGLE, bd("14600"), FilingStatus.MARRIED_JOINT, bd("29200"),
                FilingStatus.MARRIED_SEPARATE, bd("14600"), FilingStatus.HEAD_OF_HOUSEHOLD, bd("21900")),
            bd("2000"),
            Map.of(
                FilingStatus.SINGLE, bd("200000"), FilingStatus.MARRIED_JOINT, bd("400000"),
                FilingStatus.MARRIED_SEPARATE, bd("200000"), FilingStatus.HEAD_OF_HOUSEHOLD, bd("200000")));

    // ---- 2025 (Rev. Proc. 2024-40) ----
    private static final TaxRuleSet Y2025 = new TaxRuleSet(
            2025,
            Map.of(
                FilingStatus.SINGLE, List.of(
                    br("0.10", "11925"), br("0.12", "48475"), br("0.22", "103350"),
                    br("0.24", "197300"), br("0.32", "250525"), br("0.35", "626350"), br("0.37", null)),
                FilingStatus.MARRIED_JOINT, List.of(
                    br("0.10", "23850"), br("0.12", "96950"), br("0.22", "206700"),
                    br("0.24", "394600"), br("0.32", "501050"), br("0.35", "751600"), br("0.37", null)),
                FilingStatus.MARRIED_SEPARATE, List.of(
                    br("0.10", "11925"), br("0.12", "48475"), br("0.22", "103350"),
                    br("0.24", "197300"), br("0.32", "250525"), br("0.35", "375800"), br("0.37", null)),
                FilingStatus.HEAD_OF_HOUSEHOLD, List.of(
                    br("0.10", "17000"), br("0.12", "64850"), br("0.22", "103350"),
                    br("0.24", "197300"), br("0.32", "250500"), br("0.35", "626350"), br("0.37", null))),
            Map.of(
                FilingStatus.SINGLE, bd("15000"), FilingStatus.MARRIED_JOINT, bd("30000"),
                FilingStatus.MARRIED_SEPARATE, bd("15000"), FilingStatus.HEAD_OF_HOUSEHOLD, bd("22500")),
            bd("2000"),
            Map.of(
                FilingStatus.SINGLE, bd("200000"), FilingStatus.MARRIED_JOINT, bd("400000"),
                FilingStatus.MARRIED_SEPARATE, bd("200000"), FilingStatus.HEAD_OF_HOUSEHOLD, bd("200000")));

    private static final Map<Integer, TaxRuleSet> BY_YEAR = Map.of(2024, Y2024, 2025, Y2025);
    private static final int LATEST = 2025;

    /** The rule set for a year, or the latest available if that year isn't published. */
    public TaxRuleSet forYear(Integer year) {
        if (year == null) return BY_YEAR.get(LATEST);
        return Optional.ofNullable(BY_YEAR.get(year)).orElse(BY_YEAR.get(LATEST));
    }

    public TaxRuleSet latest() { return BY_YEAR.get(LATEST); }

    public List<Integer> availableYears() { return List.of(2024, 2025); }
}
