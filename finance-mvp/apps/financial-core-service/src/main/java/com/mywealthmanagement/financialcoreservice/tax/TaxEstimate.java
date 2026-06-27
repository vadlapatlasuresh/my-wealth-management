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
    private BigDecimal qbiDeduction;        // Section 199A 20% QBI deduction (rental/business)
    private BigDecimal capitalGainsTax;     // preferential 0/15/20% tax on long-term capital gains
    private BigDecimal taxableIncome;
    private BigDecimal taxBeforeCredits;
    private BigDecimal childTaxCredit;
    private BigDecimal taxAfterCredits;     // income tax after credits (excludes SE tax)
    private BigDecimal selfEmploymentTax;   // SE tax on net self-employment income
    private BigDecimal totalTax;            // taxAfterCredits + selfEmploymentTax (headline figure)
    private BigDecimal effectiveRate;       // totalTax / grossIncome
    private BigDecimal marginalRate;        // top income-tax bracket rate hit
    private BigDecimal withholding;
    private BigDecimal refundOrOwed;        // withholding - totalTax (positive = refund)
    private String disclaimer;
    private List<Insight> insights;         // deduction/credit finder tips
}
