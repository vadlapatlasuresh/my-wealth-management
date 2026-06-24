package com.mywealthmanagement.financialcoreservice.tax;

import java.math.BigDecimal;

/**
 * The figures the estimator needs. Plain immutable input so the calculator stays pure and
 * trivially testable. Amounts are annual USD; nulls are treated as zero.
 *
 * <p>{@code grossIncome} is the total of all income sources (wages + self-employment + rental +
 * interest + dividends + retirement + other) — the caller aggregates the categories. {@code
 * selfEmploymentIncome} is carried separately so the estimator can add self-employment tax and the
 * half-SE-tax above-the-line deduction.
 *
 * @param filingStatus         filing status
 * @param grossIncome          total income from every source
 * @param adjustments          above-the-line adjustments (HSA, traditional IRA, student-loan interest, ...)
 * @param itemizedDeductions   total itemizable deductions (mortgage interest, capped SALT, charitable, ...)
 * @param dependentsUnder17    qualifying children for the child tax credit
 * @param withholding          federal tax already withheld/paid (for refund-vs-owed)
 * @param selfEmploymentIncome net self-employment / 1099 profit (drives SE tax); already part of grossIncome
 */
public record TaxEstimateInput(
        FilingStatus filingStatus,
        BigDecimal grossIncome,
        BigDecimal adjustments,
        BigDecimal itemizedDeductions,
        int dependentsUnder17,
        BigDecimal withholding,
        BigDecimal selfEmploymentIncome,
        BigDecimal qualifiedBusinessIncome) {

    /** Back-compat constructor for callers without SE / QBI income (treated as zero). */
    public TaxEstimateInput(FilingStatus filingStatus, BigDecimal grossIncome, BigDecimal adjustments,
                            BigDecimal itemizedDeductions, int dependentsUnder17, BigDecimal withholding) {
        this(filingStatus, grossIncome, adjustments, itemizedDeductions, dependentsUnder17, withholding, null, null);
    }

    /** Back-compat constructor without QBI income (treated as zero). */
    public TaxEstimateInput(FilingStatus filingStatus, BigDecimal grossIncome, BigDecimal adjustments,
                            BigDecimal itemizedDeductions, int dependentsUnder17, BigDecimal withholding,
                            BigDecimal selfEmploymentIncome) {
        this(filingStatus, grossIncome, adjustments, itemizedDeductions, dependentsUnder17, withholding,
                selfEmploymentIncome, null);
    }
}
