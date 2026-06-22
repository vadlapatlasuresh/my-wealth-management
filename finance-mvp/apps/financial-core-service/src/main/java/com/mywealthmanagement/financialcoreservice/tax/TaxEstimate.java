package com.mywealthmanagement.financialcoreservice.tax;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.List;

/**
 * The result of an educational tax estimate. NOT tax advice — a simplified federal
 * estimate (ordinary income, standard vs itemized, child tax credit).
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class TaxEstimate {
    private int year;
    private String filingStatus;
    private BigDecimal grossIncome;
    private BigDecimal agi;                 // gross - adjustments
    private String deductionType;           // STANDARD | ITEMIZED
    private BigDecimal deductionUsed;
    private BigDecimal taxableIncome;
    private BigDecimal taxBeforeCredits;
    private BigDecimal childTaxCredit;
    private BigDecimal taxAfterCredits;     // estimated federal tax owed
    private BigDecimal effectiveRate;       // taxAfterCredits / grossIncome
    private BigDecimal marginalRate;        // top bracket rate hit
    private BigDecimal withholding;
    private BigDecimal refundOrOwed;        // withholding - taxAfterCredits (positive = refund)
    private String disclaimer;
    private List<Insight> insights;         // deduction/credit finder tips
}
