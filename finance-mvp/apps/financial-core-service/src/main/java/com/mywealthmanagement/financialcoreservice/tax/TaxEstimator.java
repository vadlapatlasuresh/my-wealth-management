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
            "Educational estimate only — not tax advice. Simplified federal calculation; omits AMT, "
            + "NIIT and capital-gains rates. The QBI (199A) deduction is the basic 20% and omits the "
            + "SSTB phase-out and W-2/UBIA limits for high earners; self-employment tax uses the "
            + "standard 15.3% (Social Security capped at the wage base) and ignores SS wages already "
            + "withheld on a W-2. Consult a CPA for your actual return.";

    // Self-employment tax constants (IRS Schedule SE).
    private static final BigDecimal QBI_RATE = new BigDecimal("0.20");        // Section 199A 20%
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

        BigDecimal taxableBeforeQbi = agi.subtract(deduction).max(BigDecimal.ZERO);

        // QBI (Section 199A): 20% of qualified business/rental income, capped at 20% of taxable
        // income. Simplified — omits the SSTB phase-out and W-2/UBIA limits for high earners.
        BigDecimal qbiIncome = nz(in.qualifiedBusinessIncome()).max(BigDecimal.ZERO);
        BigDecimal qbiDeduction = qbiIncome.multiply(QBI_RATE)
                .min(taxableBeforeQbi.multiply(QBI_RATE))
                .max(BigDecimal.ZERO);
        BigDecimal taxable = taxableBeforeQbi.subtract(qbiDeduction).max(BigDecimal.ZERO);

        // Long-term capital gains are in taxable income but taxed at preferential rates: ordinary
        // income fills the brackets, the gains stack on top and are taxed at 0/15/20%. Cap the
        // preferential portion at taxable income (deductions may have absorbed some of the gains).
        BigDecimal ltcg = nz(in.longTermCapitalGains()).max(BigDecimal.ZERO).min(taxable);
        BigDecimal ordinaryTaxable = taxable.subtract(ltcg).max(BigDecimal.ZERO);

        List<TaxRuleSet.Bracket> brackets = rules.brackets().get(status);
        BigDecimal capitalGainsTax = capitalGainsTax(ordinaryTaxable, ltcg, status, rules);
        BigDecimal taxBefore = applyBrackets(ordinaryTaxable, brackets).add(capitalGainsTax);
        BigDecimal marginal = marginalRate(ordinaryTaxable, brackets);

        BigDecimal ctc = childTaxCredit(in.dependentsUnder17(), agi, status, rules);
        BigDecimal incomeTax = taxBefore.subtract(ctc).max(BigDecimal.ZERO);

        // Net Investment Income Tax: 3.8% on the lesser of net investment income or MAGI (≈ AGI
        // here) over the statutory threshold.
        BigDecimal niit = niit(agi, nz(in.netInvestmentIncome()), status, rules);

        BigDecimal totalTax = incomeTax.add(seTax).add(niit);
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
        e.setQbiDeduction(money(qbiDeduction));
        e.setCapitalGainsTax(money(capitalGainsTax));
        e.setNetInvestmentIncomeTax(money(niit));
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

    private static final BigDecimal LTCG_15 = new BigDecimal("0.15");
    private static final BigDecimal LTCG_20 = new BigDecimal("0.20");

    /**
     * Preferential long-term capital-gains tax. The gains stack on top of ordinary taxable income:
     * the part of the stack below the 0% ceiling is untaxed, the part up to the 15% ceiling is 15%,
     * and the remainder is 20%.
     */
    private static BigDecimal capitalGainsTax(BigDecimal ordinaryTaxable, BigDecimal ltcg,
                                              FilingStatus status, TaxRuleSet rules) {
        if (ltcg.signum() <= 0) return BigDecimal.ZERO;
        BigDecimal zeroCeil = rules.ltcgZeroCeiling().getOrDefault(status, BigDecimal.ZERO);
        BigDecimal fifteenCeil = rules.ltcgFifteenCeiling().getOrDefault(status, BigDecimal.ZERO);
        BigDecimal bottom = ordinaryTaxable;
        BigDecimal top = ordinaryTaxable.add(ltcg);
        BigDecimal in15 = clamp(fifteenCeil, bottom, top).subtract(clamp(zeroCeil, bottom, top)).max(BigDecimal.ZERO);
        BigDecimal in20 = top.subtract(clamp(fifteenCeil, bottom, top)).max(BigDecimal.ZERO);
        return in15.multiply(LTCG_15).add(in20.multiply(LTCG_20));
    }

    /** v constrained to [lo, hi]. */
    private static BigDecimal clamp(BigDecimal v, BigDecimal lo, BigDecimal hi) {
        return v.max(lo).min(hi);
    }

    private static final BigDecimal NIIT_RATE = new BigDecimal("0.038");

    /** Net Investment Income Tax: 3.8% × min(net investment income, MAGI over the threshold). */
    private static BigDecimal niit(BigDecimal magi, BigDecimal nii, FilingStatus status, TaxRuleSet rules) {
        if (nii.signum() <= 0) return BigDecimal.ZERO;
        BigDecimal threshold = rules.niitThreshold().getOrDefault(status, BigDecimal.ZERO);
        BigDecimal over = magi.subtract(threshold).max(BigDecimal.ZERO);
        return nii.min(over).multiply(NIIT_RATE);
    }

    private static BigDecimal nz(BigDecimal v) { return v == null ? BigDecimal.ZERO : v; }
    private static BigDecimal money(BigDecimal v) { return v.setScale(2, RoundingMode.HALF_UP); }
}
