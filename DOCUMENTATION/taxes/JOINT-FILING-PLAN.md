# Taxes — Joint-Filing & Multi-Document Plan

> **Status:** design + implementation plan (not yet built). Scopes multiple W-2s for joint filers
> and a per-filer document manager with delete. Builds on the shipped categorized estimator
> (income/adjustments/itemized + self-employment tax) and the multi-form parser.
>
> **Last updated:** 2026-06-24

---

## 1. Goals (from the request)

1. **Multiple W-2s for joint filers** — enter separate income from each W-2; show **combined**
   income + total tax, and **per-W-2 income + federal tax** for transparency.
2. **Multi-document upload for a household** — upload many files (W-2s, 1098s, …), **delete**
   individual files, and **categorize each document by filer / family member**.
3. **Design** — an intuitive UI that clearly shows multiple income sources, taxes, and document
   management, optimized for **clarity, ease of use, and error prevention** in joint scenarios.

---

## 2. Key design decision — how "individual tax" is shown (correctness)

On a US **Married-Filing-Jointly** return, tax is computed on **combined** taxable income against the
**joint brackets** — it is *not* the sum of two separately-computed taxes, and there is no exact way
to split the joint liability per spouse. To stay correct **and** transparent we show, per W-2:

- **Wages (Box 1)** and **Federal income tax withheld (Box 2)** — these are real, per-form figures.
- A clearly-labeled **"withheld"** column (the actual federal tax already paid for that job).

The **estimate** (liability, refund/owed, effective rate) is always computed on the **combined**
figures. Optionally we show an **approximate** per-filer share of the *total liability*, prorated by
each filer's share of taxable income — **explicitly labeled "approximate / for illustration"** so we
never imply an exact per-spouse tax. This avoids the most common joint-filing misconception.

> Net: **per-W-2 = wages + withholding (exact)**; **liability = joint (combined)**; **per-filer
> liability split = optional, approximate, labeled.**

---

## 3. Data model

### 3.1 Filers
A small list of household members the user can tag income/documents to.
```
Filer { id: string, name: string, role: "PRIMARY" | "SPOUSE" | "DEPENDENT" | "OTHER" }
```
- Default: `[{id:"you", name:"You", role:"PRIMARY"}]`.
- When filing status = `MARRIED_JOINT`, auto-add `{id:"spouse", name:"Spouse", role:"SPOUSE"}`.
- User can rename filers and add more (e.g. a dependent with a 1099).

### 3.2 W-2 entries (replaces the single `wages` field)
```
W2Entry { id, filerId, employer, wages (Box 1), federalWithholding (Box 2), source: "manual" | "upload" }
```
- The income section holds a **list** of W-2 entries.
- `wages` sent to the estimator = **Σ entry.wages**; `withholding` = **Σ entry.federalWithholding**
  (plus withholding extracted from 1099-R / 1099-INT etc., as today).

### 3.3 Uploaded documents
```
TaxDocument { id, fileName, docType (W2 | 1099-* | 1098 | 1098-E | 1098-T | UNKNOWN),
              filerId, status (parsed | unreadable | image-needs-ocr),
              fields: [{key,label,amount}], appliedTo: [entry/field ids] }
```
- One row per uploaded file, tagged to a filer, with a **delete** control.
- Deleting a document **reverses its applied amounts** (subtracts what it added), then removes it.

### 3.4 Persistence (`tax_profile.details_json`, already exists)
Extend the saved JSON the profile already round-trips:
```
{
  filers: [...],
  w2s: [{filerId, employer, wages, federalWithholding}],
  documents: [{fileName, docType, filerId}],   // metadata only — file bytes are never stored
  // existing categorized fields (rental, interest, mortgageInterest, ...) unchanged
}
```
No new table needed — `details_json` is a TEXT column (V10). Aggregate columns keep summing as today.

---

## 4. Backend (financial-core) — small, mostly additive

The estimator already **sums income categories**, so the core math needs no change — the frontend
sends Σwages and Σwithholding. Two optional refinements for transparency + validation:

1. **(Optional) structured echo.** Accept `w2s: [{filerId, wages, federalWithholding}]` on
   `POST /api/v1/planning/tax/estimate`. The controller sums them into `wages`/`withholding` (so the
   estimate is unchanged) and **echoes back** a `w2Breakdown` + an optional `filerLiabilityShare`
   (prorated, labeled approximate) for the transparency panel. If `w2s` is absent, behaves exactly
   as today. *Pure code; back-compatible.*
2. **Profile save/load.** `saveProfile` already persists `details_json`; just add `filers`, `w2s`,
   `documents` to the `DETAIL_FIELDS` set (or store the raw object). `getProfile` already returns it.

**Parser:** unchanged. `POST /documents/parse` already returns `fields[]` per document; the frontend
decides which filer/W-2 entry to apply them to.

**No migration needed** (reuses V10 `details_json`). **No new gateway route** (under `/api/v1/planning`).

### API summary
| Endpoint | Change |
|---|---|
| `POST /api/v1/planning/tax/estimate` | optional `w2s[]` in; optional `w2Breakdown` + approximate `filerLiabilityShare` out |
| `PUT /api/v1/planning/tax/profile` | persist `filers`, `w2s`, `documents` in `details_json` |
| `POST /api/v1/planning/tax/documents/parse` | unchanged |

---

## 5. Frontend (web — `TaxPage.jsx`)

### 5.1 W-2 income — repeatable entries
- Replace the single **"Wages (W-2)"** input with a **W-2 list** under the Income section:
  - Each entry: **Filer** (dropdown), **Employer**, **Wages (Box 1)**, **Fed. tax withheld (Box 2)**,
    and a **remove (×)** button.
  - **"+ Add W-2"** button.
  - A live **Combined** row: total wages + total withheld.
- `form.wages` / `form.withholding` become **computed sums** of the entries (the rest of the
  estimator payload is unchanged).

### 5.2 Transparency panel (per-W-2 + combined)
A small table near the results:
| Filer | Employer | Wages | Fed. tax withheld |
|---|---|---|---|
| You | Acme | $84,200 | $9,310 |
| Spouse | Globex | $61,000 | $6,400 |
| **Combined** | | **$145,200** | **$15,710** |

Plus the joint **estimated total tax** and, optionally, the labeled **approximate per-filer share**.

### 5.3 Document manager (multi-file + per-filer + delete)
- The upload card accepts **multiple files** (already does). For each parsed file, create a
  **document chip/row**: icon by type, file name, **filer dropdown**, a **"applied: Wages $84,200"**
  summary, and a **delete (×)**.
- **Grouped by filer** (collapsible groups: *You*, *Spouse*) so a household's papers are organized.
- **Delete** subtracts that document's applied amounts from the relevant W-2 entry/field, then
  removes the chip (so totals stay correct).
- A W-2 upload assigned to a filer **creates/updates that filer's W-2 entry**; a 1098 applies to
  the shared itemized **mortgage interest**, etc.

### 5.4 Error prevention (joint scenarios)
- If status = **Married-Filing-Jointly** but only one filer has any W-2/income → inline hint:
  *"Add your spouse's W-2s, or switch filing status."*
- **Duplicate W-2** guard (same employer + same wages) → warn before adding.
- Numeric-only money inputs; per-entry validation; **red-highlight** missing required parts
  (consistent with the CPA form validation).
- Deleting a document that fed a field shows a brief **"removed $X from Wages"** confirmation.

### 5.5 Single-filer users
For non-joint filers nothing feels heavier: one W-2 entry shows by default, the filer dropdown is
hidden (only "You"), and the transparency table collapses to a single row.

---

## 6. Design files to update

- **`assets/terravest-redesign.html`** (the mockup) — Taxes screen:
  - W-2 income sub-section with **multiple W-2 cards** (filer · employer · wages · withheld · delete)
    + "Add W-2" + a **Combined** total.
  - **Document manager** with per-filer groups, type icons, filer tags, and **delete** buttons.
  - A **per-W-2 / combined transparency table** in the results column.
- Keep the existing theme classes/vars; mirror the patterns already in the Taxes/CPA mockup screens.

---

## 7. Implementation phases

1. **Frontend-only MVP (no backend change):** W-2 list + combined totals + per-filer document chips
   with delete; `form.wages`/`withholding` computed from entries; persist `w2s`/`filers`/`documents`
   in the existing profile `details_json`. *Ships the whole UX with zero backend risk.*
2. **Transparency echo (optional backend):** add `w2s[]` in / `w2Breakdown` + approximate
   `filerLiabilityShare` out on `/estimate` for the per-filer share line.
3. **Polish:** duplicate-W-2 guard, joint-filing hints, named dependents.

## 8. Test plan

- **Estimator:** unchanged math holds (Σwages == single-wages case); a 2-W-2 joint case equals the
  same combined-income single estimate.
- **Frontend:** add/remove W-2 re-sums correctly; deleting a document subtracts exactly what it
  added; profile round-trips `filers`/`w2s`/`documents`; single-filer view stays simple.
- **(If phase 2) `filerLiabilityShare`** sums to the total and is labeled approximate.

## 9. Out of scope (note to set expectations)

Actual **filing/e-file**, exact per-spouse liability, and state returns are out of scope — this stays
an **educational joint estimate** with clear per-form transparency. Real photo/scanned-form OCR is
still the separate [Textract item](MVP2.md#1).
