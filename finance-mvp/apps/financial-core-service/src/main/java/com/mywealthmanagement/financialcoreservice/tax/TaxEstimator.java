package com.mywealthmanagement.financialcoreservice.tax;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/**
 * Pure, versioned federal tax estimator. Given the user's figures + a {@link TaxRuleSet},
 * computes an EDUCATIONAL estimate: AGI, standard-vs-itemized, bracketed tax, child tax
 * credit (with phase-out), effective + marginal rate, and refund-vs-owed. No I/O, no
 * dependencies — every rule lives in the rule set, so it is fully unit-testable and a new
 * tax year is a data change. NOT tax advice.
 */
public final class TaxEstimator {

    private TaxEstimator() {}

    private static final String DISCLAIMER =
            "Educational estimate only — not tax advice. Simplified federal calculation; "
            + "omits AMT, NIIT, capital-gains rates, QBI, and most credits. Self-employment tax "
            + "uses the standard 15.3% (Social Security capped at the annual wage base) and ignores "
            + "Social Security wages already withheld on a W-2. Consult a CPA for your actual return.";

    // Self-employment tax constants (IRS Schedule SE).
    private static final BigDecimal SE_NET_FACTOR = new BigDecimal("0.9235"); // 92.35% of net SE earnings
    private static final BigDecimal SS_RATE = new BigDecimal("0.124");        // Social Security portion
    private static final BigDecimal MEDICARE_RATE = new BigDecimal("0.029");  // Medicare portion (uncapped)

    public static TaxEstimate estimate(TaxEstimateInput in, TaxRuleSet rules) {
        FilingStatus status = in.filingStatus() == null ? FilingStatus.SINGLE : in.filingStatus();
        BigDecimal gross = nz(in.grossIncome());
        BigDecimal itemized = nz(in.itemizedDeductions());
        BigDecimal withholding = nz(in.withholding());

        // Self-employment tax + its half-deductible above-the-line adjustment.
        BigDecimal seTax = selfEmploymentTax(nz(in.selfEmploymentIncome()), rules.year());
        BigDecimal halfSeTax = seTax.divide(BigDecimal.valueOf(2), 2, RoundingMode.HALF_UP);
        BigDecimal adjustments = nz(in.adjustments()).add(halfSeTax);

        BigDecimal agi = gross.subtract(adjustments).max(BigDecimal.ZERO);

        BigDecimal standard = rules.standardDeduction().getOrDefault(status, BigDecimal.ZERO);
        boolean itemize = itemized.compareTo(standard) > 0;
        BigDecimal deduction = itemize ? itemized : standard;

        BigDecimal taxable = agi.subtract(deduction).max(BigDecimal.ZERO);

        List<TaxRuleSet.Bracket> brackets = rules.brackets().get(status);
        BigDecimal taxBefore = applyBrackets(taxable, brackets);
        BigDecimal marginal = marginalRate(taxable, brackets);

        BigDecimal ctc = childTaxCredit(in.dependentsUnder17(), agi, status, rules);
        BigDecimal incomeTax = taxBefore.subtract(ctc).max(BigDecimal.ZERO);

        BigDecimal totalTax = incomeTax.add(seTax);
        BigDecimal effective = gross.signum() > 0
                ? totalTax.divide(gross, 4, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;
        BigDecimal refundOrOwed = withholding.subtract(totalTax);

        TaxEstimate e = new TaxEstimate();
        e.setYear(rules.year());
        e.setFilingStatus(status.name());
        e.setGrossIncome(money(gross));
        e.setAgi(money(agi));
        e.setDeductionType(itemize ? "ITEMIZED" : "STANDARD");
        e.setDeductionUsed(money(deduction));
        e.setTaxableIncome(money(taxable));
        e.setTaxBeforeCredits(money(taxBefore));
        e.setChildTaxCredit(money(ctc));
        e.setTaxAfterCredits(money(incomeTax));
        e.setSelfEmploymentTax(money(seTax));
        e.setTotalTax(money(totalTax));
        e.setEffectiveRate(effective);
        e.setMarginalRate(marginal);
        e.setWithholding(money(withholding));
        e.setRefundOrOwed(money(refundOrOwed));
        e.setDisclaimer(DISCLAIMER);
        return e;
    }

    /**
     * Self-employment tax (Schedule SE): 15.3% on 92.35% of net SE earnings — 12.4% Social Security
     * up to the annual wage base, plus 2.9% Medicare uncapped. Simplified: ignores Social Security
     * wages already taxed on a W-2 (slight overestimate when a filer has both).
     */
    private static BigDecimal selfEmploymentTax(BigDecimal netSelfEmployment, int year) {
        if (netSelfEmployment.signum() <= 0) {
            return BigDecimal.ZERO;
        }
        BigDecimal base = netSelfEmployment.multiply(SE_NET_FACTOR);
        BigDecimal ss = base.min(socialSecurityWageBase(year)).multiply(SS_RATE);
        BigDecimal medicare = base.multiply(MEDICARE_RATE);
        return ss.add(medicare);
    }

    /** Social Security wage base for the 12.4% SE-tax cap (IRS, by year). */
    private static BigDecimal socialSecurityWageBase(int year) {
        return switch (year) {
            case 2024 -> BigDecimal.valueOf(168600);
            default -> BigDecimal.valueOf(176100); // 2025 (and a safe default)
        };
    }

    /** Sum each bracket's rate × the portion of taxable income within that bracket. */
    private static BigDecimal applyBrackets(BigDecimal taxable, List<TaxRuleSet.Bracket> brackets) {
        BigDecimal tax = BigDecimal.ZERO;
        BigDecimal lower = BigDecimal.ZERO;
        for (TaxRuleSet.Bracket b : brackets) {
            BigDecimal cap = b.upTo() == null ? taxable : b.upTo();
            BigDecimal top = taxable.min(cap);
            if (top.compareTo(lower) > 0) {
                tax = tax.add(top.subtract(lower).multiply(b.rate()));
            }
            lower = cap;
            if (taxable.compareTo(cap) <= 0) break;
        }
        return tax;
    }

    private static BigDecimal marginalRate(BigDecimal taxable, List<TaxRuleSet.Bracket> brackets) {
        BigDecimal rate = BigDecimal.ZERO;
        for (TaxRuleSet.Bracket b : brackets) {
            rate = b.rate();
            if (b.upTo() != null && taxable.compareTo(b.upTo()) <= 0) break;
        }
        return rate;
    }

    /** Child tax credit, phased out $50 per $1,000 (or fraction) of MAGI over the threshold. */
    private static BigDecimal childTaxCredit(int kids, BigDecimal agi, FilingStatus status, TaxRuleSet rules) {
        if (kids <= 0) return BigDecimal.ZERO;
        BigDecimal base = rules.childTaxCredit().multiply(BigDecimal.valueOf(kids));
        BigDecimal threshold = rules.ctcPhaseoutStart().getOrDefault(status, BigDecimal.ZERO);
        if (agi.compareTo(threshold) <= 0) return base;
        BigDecimal over = agi.subtract(threshold);
        // ceil(over / 1000) * 50 reduction
        BigDecimal steps = over.divide(BigDecimal.valueOf(1000), 0, RoundingMode.CEILING);
        BigDecimal reduction = steps.multiply(BigDecimal.valueOf(50));
        return base.subtract(reduction).max(BigDecimal.ZERO);
    }

    private static BigDecimal nz(BigDecimal v) { return v == null ? BigDecimal.ZERO : v; }
    private static BigDecimal money(BigDecimal v) { return v.setScale(2, RoundingMode.HALF_UP); }
}
