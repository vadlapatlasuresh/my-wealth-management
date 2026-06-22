package com.mywealthmanagement.financialcoreservice.tax;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * The IRS rule parameters for ONE tax year — modeled as data (never hardcoded in the
 * calculator) so a new year is a data change, not a code change. For the MVP these are
 * seeded in {@link TaxRules}; the same shape can later be served from
 * platform-config-service for an admin/SME publish flow.
 *
 * @param year              tax year (e.g. 2025)
 * @param brackets          ordered marginal brackets per filing status (lowest first)
 * @param standardDeduction standard deduction per filing status
 * @param childTaxCredit    credit per qualifying child under 17
 * @param ctcPhaseoutStart  MAGI where the child tax credit begins phasing out, per status
 */
public record TaxRuleSet(
        int year,
        Map<FilingStatus, List<Bracket>> brackets,
        Map<FilingStatus, BigDecimal> standardDeduction,
        BigDecimal childTaxCredit,
        Map<FilingStatus, BigDecimal> ctcPhaseoutStart) {

    /** A marginal bracket: {@code rate} applies to income up to {@code upTo} (null = no cap). */
    public record Bracket(BigDecimal rate, BigDecimal upTo) {}
}
