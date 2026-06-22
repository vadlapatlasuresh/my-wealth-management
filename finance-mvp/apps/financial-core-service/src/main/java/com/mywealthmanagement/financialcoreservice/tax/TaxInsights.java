package com.mywealthmanagement.financialcoreservice.tax;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;

/**
 * Deduction & credit finder: turns a user's figures + their computed estimate into
 * plain-English educational tips. Pure + versioned (all thresholds come from the rule
 * set), so it's fully unit-testable. NOT tax advice — informational only. A later phase
 * can pass these to the AI-insights service to expand the explanations.
 */
public final class TaxInsights {

    private TaxInsights() {}

    public static List<Insight> generate(TaxEstimateInput in, TaxEstimate est, TaxRuleSet rules) {
        List<Insight> out = new ArrayList<>();
        FilingStatus status = in.filingStatus() == null ? FilingStatus.SINGLE : in.filingStatus();
        BigDecimal standard = rules.standardDeduction().getOrDefault(status, BigDecimal.ZERO);
        BigDecimal itemized = nz(in.itemizedDeductions());

        // 1) Standard vs itemized.
        if ("ITEMIZED".equals(est.getDeductionType())) {
            out.add(new Insight("TIP", "Itemizing beats the standard deduction",
                    "Your itemized deductions (" + usd(itemized) + ") exceed the " + est.getYear()
                    + " standard deduction (" + usd(standard) + "), lowering your taxable income by "
                    + usd(itemized.subtract(standard)) + " more."));
        } else if (itemized.signum() > 0) {
            out.add(new Insight("INFO", "The standard deduction is better for you",
                    "Your itemized deductions (" + usd(itemized) + ") are below the standard deduction ("
                    + usd(standard) + "), so we used the standard deduction. Track itemizable expenses "
                    + "(mortgage interest, SALT up to $10k, charitable gifts) in case they grow."));
        }

        // 2) Child tax credit.
        if (in.dependentsUnder17() > 0 && est.getChildTaxCredit().signum() > 0) {
            out.add(new Insight("TIP", "Child tax credit applied",
                    "With " + in.dependentsUnder17() + " qualifying dependent(s), you're estimated to receive "
                    + usd(est.getChildTaxCredit()) + " in child tax credit (a dollar-for-dollar reduction)."));
        }

        // 3) Pre-tax contribution opportunity (always relevant when there's income + tax).
        if (est.getTaxAfterCredits().signum() > 0 && est.getMarginalRate().signum() > 0) {
            BigDecimal per1k = new BigDecimal("1000").multiply(est.getMarginalRate()).setScale(0, RoundingMode.HALF_UP);
            out.add(new Insight("OPPORTUNITY", "Lower your tax with pre-tax contributions",
                    "At your " + pct(est.getMarginalRate()) + " marginal rate, every $1,000 you add to a "
                    + "traditional 401(k)/IRA or HSA cuts your federal tax by about " + usd(per1k) + "."));
        }

        // 4) Refund vs owed / withholding prompt.
        if (nz(in.withholding()).signum() == 0) {
            out.add(new Insight("INFO", "Add your withholding for a refund estimate",
                    "Enter the federal tax already withheld (from your pay stub or W-2 box 2) to see whether "
                    + "you're due a refund or will owe."));
        } else if (est.getRefundOrOwed().signum() < 0) {
            out.add(new Insight("WARNING", "You may owe at tax time",
                    "Your withholding is about " + usd(est.getRefundOrOwed().abs()) + " short of the estimate. "
                    + "Consider increasing withholding (Form W-4) or setting aside the difference."));
        } else if (est.getRefundOrOwed().signum() > 0) {
            out.add(new Insight("INFO", "On track for a refund",
                    "Based on your withholding, you're estimated to get back about "
                    + usd(est.getRefundOrOwed()) + "."));
        }

        return out;
    }

    private static BigDecimal nz(BigDecimal v) { return v == null ? BigDecimal.ZERO : v; }
    private static String usd(BigDecimal v) {
        return "$" + v.setScale(0, RoundingMode.HALF_UP).toBigInteger().toString();
    }
    private static String pct(BigDecimal rate) {
        return rate.multiply(new BigDecimal("100")).setScale(0, RoundingMode.HALF_UP) + "%";
    }
}
