package com.mywealthmanagement.financialcoreservice.tax;

import java.util.List;

/**
 * A plain-English catalog of the most common federal deductions and credits, so users can
 * see at a glance what they might be able to claim. Educational only — eligibility/limits
 * are summarized, not exhaustive; always confirm with a CPA. Kept descriptive (not
 * year-specific dollar amounts) so it needs little annual maintenance.
 */
public final class TaxGuide {

    private TaxGuide() {}

    /** One claimable item. type = DEDUCTION | CREDIT. */
    public record GuideItem(String type, String category, String name, String description) {}

    private static GuideItem d(String cat, String name, String desc) { return new GuideItem("DEDUCTION", cat, name, desc); }
    private static GuideItem c(String cat, String name, String desc) { return new GuideItem("CREDIT", cat, name, desc); }

    private static final List<GuideItem> ITEMS = List.of(
        // --- Deductions ---
        d("Everyone", "Standard deduction",
            "A flat amount everyone can subtract — most filers take this. You only itemize if your itemized total is larger."),
        d("Homeowners", "Mortgage interest",
            "Interest on a home loan (up to $750k of mortgage debt) — itemized. Reported on Form 1098 from your lender."),
        d("Homeowners", "State & local taxes (SALT)",
            "Property tax plus state income or sales tax, capped at $10,000 total — itemized."),
        d("Giving", "Charitable contributions",
            "Cash and goods donated to qualified charities — itemized. Keep receipts/acknowledgments."),
        d("Health", "Medical & dental expenses",
            "Out-of-pocket medical costs above 7.5% of your AGI — itemized."),
        d("Health", "HSA contributions",
            "Contributions to a Health Savings Account (with an HDHP) reduce taxable income — above-the-line, even if you don't itemize."),
        d("Retirement", "Traditional IRA / 401(k)",
            "Pre-tax retirement contributions lower your taxable income now (401(k) via your paycheck; traditional IRA on your return)."),
        d("Education", "Student loan interest",
            "Up to $2,500 of student-loan interest — above-the-line, phases out at higher incomes."),
        d("Self-employed", "Business expenses & home office",
            "If you have 1099/self-employment income, ordinary business costs and a qualifying home office reduce that income (Schedule C)."),
        d("Educators", "Educator expenses",
            "Teachers can deduct up to $300 of classroom supplies — above-the-line."),

        // --- Credits (dollar-for-dollar, stronger than deductions) ---
        c("Family", "Child Tax Credit",
            "Up to $2,000 per qualifying child under 17, phasing out at higher incomes. A dollar-for-dollar tax reduction."),
        c("Family", "Child & Dependent Care Credit",
            "A percentage of daycare/after-school costs that let you work — for kids under 13 or a dependent who can't care for themselves."),
        c("Work", "Earned Income Tax Credit (EITC)",
            "A refundable credit for low-to-moderate earned income, larger with children — can produce a refund even if you owe no tax."),
        c("Education", "Education credits (AOTC / LLC)",
            "American Opportunity (up to $2,500/student, first 4 years) or Lifetime Learning (up to $2,000) for tuition and fees."),
        c("Retirement", "Saver's Credit",
            "An extra credit (on top of the deduction) for retirement contributions if your income is modest."),
        c("Home/Auto", "Energy & EV credits",
            "Credits for qualifying home-energy improvements (solar, heat pumps) and new/used electric vehicles."),
        c("Health", "Premium Tax Credit",
            "Helps cover health-insurance premiums bought through the ACA marketplace, based on income.")
    );

    public static List<GuideItem> all() { return ITEMS; }
}
