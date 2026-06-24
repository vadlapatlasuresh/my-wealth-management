# Taxes — MVP2 Backlog

> **What this is:** the planned next-phase (MVP2) work for the **Taxes** feature. MVP1 has
> shipped; everything here is deferred, scoped, and points at exactly where it plugs in so it can
> be picked up later. Nothing here is a blocker for the current feature.
>
> **Last updated:** 2026-06-24

---

## Where MVP1 left things (shipped)

The tax feature already covers, end-to-end:

- **Educational federal estimator** — versioned IRS rule sets (2024 + 2025), standard-vs-itemized,
  bracketed tax, child tax credit with phase-out, effective/marginal rate, refund-vs-owed.
- **Self-employment tax** — Schedule SE (15.3% on 92.35% of net SE, Social Security capped at the
  wage base) + the half-SE-tax adjustment.
- **Categorized inputs** — income (wages, self-employment, rental, interest, dividends, retirement,
  other), adjustments (student-loan interest, HSA, IRA, other), itemized deductions (mortgage
  interest, property + state/local taxes with the $10k SALT cap, charitable, medical).
- **"What you can claim" guide** + the deduction/credit finder insights.
- **Document extractor** — multi-file upload, text-PDF parsing (pdf.js) + paste, for **W-2,
  1099-NEC/MISC/INT/DIV/R, 1098, 1098-E, 1098-T**, routing each value to the right field.
- **Year-over-year history**, saved profile (with the full categorized breakdown persisted),
  and the **CPA marketplace** (self-registration, admin moderation, NASBA license verification).

---

## MVP2 — the backlog

### 1. 🔑 Real OCR for photos & scanned forms (AWS Textract) — _headline item_

**Problem.** The built-in parser reads the **text layer** of PDFs and pasted text. A **photo or
scanned image** of a W-2/1099/1098 has no text layer, so nothing extracts — today the UI honestly
says "photos and scans need OCR, which isn't enabled yet."

**What to build.** Wire **AWS Textract** (or Google Document AI) as a real OCR engine behind the
existing flag, so an uploaded image/scan is OCR'd to text (ideally key-value via Textract
`AnalyzeDocument` FORMS/QUERIES), then run through the same field extraction.

**Where it plugs in (already scaffolded for this):**
- `tax.ocr.provider` config already exists (`apps/financial-core-service/.../application.properties`),
  default `mock`. Set `tax.ocr.provider=textract` to switch.
- `TaxDocumentParser` (`.../tax/ocr/TaxDocumentParser.java`) already abstracts the provider and is
  built to **degrade to the mock regex** on any failure — add the Textract path alongside it.
- Frontend already sends document text to `POST /api/v1/planning/tax/documents/parse` and routes the
  returned `fields[]`; for images it currently short-circuits with the "needs OCR" message — that
  branch becomes "send the image to the OCR endpoint."

**Needs (why it's MVP2, not now):** an AWS account + Textract IAM credentials + the AWS SDK
dependency; per-page cost. Follows the house pattern: **flag-gated, mock fallback**, key pasted into
`.env.prod` — no code change to turn on.

**Effort:** medium (new provider + an image-accepting endpoint variant + IAM/secret wiring).

---

### 2. 🛠 Self-employment tax: subtract W-2 Social Security wages from the wage-base cap

Today SE tax caps the 12.4% Social Security portion at the annual wage base but **ignores Social
Security wages already withheld on a W-2**. For a filer with **both** W-2 and self-employment
income above the cap, this slightly **overestimates** SE tax. Fix: reduce the SS-taxable SE base by
the filer's W-2 SS wages. Plugs into `TaxEstimator.selfEmploymentTax(...)`; would need W-2 SS wages
as an input (currently only Box 1 wages are captured). _No keys; pure code._

### 3. 🛠 Medical-expense 7.5%-of-AGI floor

Itemized medical is currently summed **as entered**. Only the portion **above 7.5% of AGI** is
deductible. Apply the floor when aggregating itemized deductions (needs AGI, so compute inside the
estimator rather than the controller). _Pure code._

### 4. 🛠 QBI (Section 199A) 20% deduction

The **20% qualified-business-income deduction** is significant for the app's core users
(self-employed / landlords) and is currently omitted. Add a simplified QBI line (20% of qualified
business/rental income, with the taxable-income limit and the SSTB phase-out as a later refinement).
Plugs into `TaxEstimator` after AGI, before brackets. _Pure code; high value for the target wedge._

### 5. 🛠 Preferential rates for capital gains & qualified dividends

Currently all income is taxed as **ordinary**. Add the 0/15/20% long-term capital-gains and
qualified-dividend brackets (data in the rule set), and split investment income into ordinary vs
qualified. _Pure code (rule-set + estimator change)._

### 6. 🛠 NIIT (3.8%) and AMT awareness

Net Investment Income Tax (3.8% over the MAGI thresholds) and at least an **AMT flag/estimate** for
high earners. Today both are disclaimed as omitted. _Pure code._

### 7. 🛠 1098-T → education credit calculation

1098-T tuition is **detected and surfaced as a note** today but not computed. Add the **American
Opportunity** / **Lifetime Learning** credit math (with phase-outs). Plugs into the credits path in
`TaxEstimator` + a `tuition` input field. _Pure code._

### 8. 🛠 State income tax estimate

Federal only today. Add a state layer (start with the handful of states the user base is in;
flat-rate or bracketed per state in a versioned rule set mirroring the federal one). _Pure code;
data-heavy._

### 9. 🛠 Quarterly estimated-tax reminders & calculator

For self-employed users (the wedge): compute **Form 1040-ES** quarterly payments from the estimate
and surface due-date reminders (Apr/Jun/Sep/Jan). Reuses the estimator + the notification-service
digest pattern. _Pure code; strong fit for the target audience._

---

## Suggested MVP2 sequencing

1. **#1 Textract OCR** — unlocks photo/scan uploads (the most-requested gap); flag-gated, ships dark.
2. **#4 QBI** + **#9 quarterly estimates** — highest value for self-employed/landlord users.
3. **#5 capital-gains rates** + **#3 medical floor** + **#2 SS-wage offset** — accuracy refinements.
4. **#7 education credit**, **#6 NIIT/AMT**, **#8 state tax** — breadth.

Each item is additive and independently shippable. Items 2–9 need **no keys**; only **#1** needs a
cloud OCR credential.
