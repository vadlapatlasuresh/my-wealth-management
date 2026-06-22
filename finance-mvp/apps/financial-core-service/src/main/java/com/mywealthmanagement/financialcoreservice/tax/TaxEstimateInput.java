package com.mywealthmanagement.financialcoreservice.tax;

import java.math.BigDecimal;

/**
 * The figures the estimator needs. Plain immutable input so the calculator stays pure and
 * trivially testable. Amounts are annual USD; nulls are treated as zero.
 *
 * @param filingStatus        filing status
 * @param grossIncome         total ordinary income (wages + other)
 * @param adjustments         above-the-line adjustments (HSA, traditional IRA, student-loan interest, ...)
 * @param itemizedDeductions  total itemizable deductions (mortgage interest, SALT, charitable, ...)
 * @param dependentsUnder17   qualifying children for the child tax credit
 * @param withholding         federal tax already withheld/paid (for refund-vs-owed)
 */
public record TaxEstimateInput(
        FilingStatus filingStatus,
        BigDecimal grossIncome,
        BigDecimal adjustments,
        BigDecimal itemizedDeductions,
        int dependentsUnder17,
        BigDecimal withholding) {}
