# Proposal: Automated Budget Planning

**Status:** Draft for review
**Area:** Budget tab (web `PlanPage`, mobile equivalents)
**Author:** Product/Engineering
**Related shipped work:** PR #130 introduced a first‑cut “Auto‑fill from accounts” button. This proposal expands that into a complete, configurable automation experience.

---

## 1. Executive summary

Today, building a budget in TerraVest is largely manual: the user types a take‑home income figure and adds spending categories and amounts one by one. Meanwhile, the app already has the data needed to do most of this automatically — **categorized transactions from the user’s linked bank accounts and credit cards (via Plaid)**.

This proposal describes a feature that **turns linked‑account transaction data into a ready‑to‑edit budget**: it detects income (deposits, direct deposits) and expenses, categorizes them, and proposes budget lines — while always leaving the user in control of what is included, whether it **replaces or merges** with their existing budget, and the ability to fine‑tune everything by hand.

The guiding principle is **“automation with a safety belt”**: do the heavy lifting automatically, but never change a saved budget without an explicit, reviewable, reversible action.

---

## 2. Problem & motivation

- **Manual entry is the biggest source of friction** in budgeting. Users abandon budgets because setting one up — and keeping it current — is tedious.
- The app **already ingests transactions** with categories, amounts, and dates from every linked institution. Not using that data to bootstrap the budget is a missed opportunity.
- Pure automation, however, is also a trap: a budget that silently rewrites itself feels untrustworthy. Users need to **see, approve, and adjust** what the system proposes.

**Goal:** reduce manual budget entry to near‑zero for the common case, while preserving full manual control and customization for users who want it.

---

## 3. Goals & design principles

1. **Automate the first draft.** From linked transactions, propose income and categorized spending so the user starts from a populated budget, not a blank page.
2. **Never surprise the user.** Automation only changes the *working* (unsaved) budget. Nothing is committed until the user reviews and saves. Everything is undoable.
3. **Replace or merge — the user decides.** Respect budgets people have already built.
4. **Manual override always wins.** Any auto‑generated line can be edited, renamed, removed, or added to by hand.
5. **Configurable, with sensible defaults.** Power users can tune which categories and transaction types feed the automation; everyone else gets a good result out of the box.
6. **Explainable.** Every proposed number can be traced back to the transactions behind it.

---

## 4. Functional requirements

### 4.1 Automatic detection & categorization
- Pull the user’s transactions for the relevant period (default: the **selected budget month**, falling back to the **last 30 days** if the month has little data).
- Classify each transaction:
  - **Income** — inflows (deposits, direct deposit / payroll). In Plaid’s convention, money *into* a depository account.
  - **Expense** — outflows, grouped by the transaction’s **category** (e.g. *Food & Drink, Rent & Utilities, Transportation*).
  - **Excluded** — internal money movement that is neither income nor spend: **transfers, credit‑card payments, loan payments**, and (configurably) refunds.
- Aggregate into a proposed budget: a **total monthly income** figure plus one **budget line per spending category**, each with a suggested amount equal to the user’s actual spend in the period (a realistic starting target the user can adjust).

### 4.2 Replace vs. merge
When the user runs automation and a budget already exists, they choose how to apply the results:
- **Replace** — discard the current working lines and use the detected ones. Best for first‑time setup or a fresh start.
- **Merge** — keep existing categories and budget targets; for matching categories, refresh the *actual spend* and optionally suggest a new target; add any new categories found. Best for an established budget the user is maintaining.
- The choice is **remembered as a preference** (with the option to be asked each time).

### 4.3 Manual adjustment & entry
- Every proposed line is fully editable: change the amount, rename the category, delete it, or add new lines that the data didn’t surface.
- Income is editable as a single figure (and, optionally, broken out by source).
- The user can ignore automation entirely and build a budget by hand — automation is **additive, never required**.

### 4.4 Customization of what’s automated
A lightweight settings surface lets users tune the automation without touching code:
- **Include / exclude categories** — e.g. always exclude *Transfers* and *Credit Card Payments* (defaults), optionally exclude *Income* categories from the spend list, or hide noisy ones.
- **Transaction‑type rules** — treat (or not treat) refunds as negative spend; decide whether *Transfer In* counts as income.
- **Account scope** — choose which linked accounts/cards feed the budget (e.g. exclude a business card, or a joint account).
- **Category mapping / renaming** — map Plaid categories to the user’s own labels (e.g. *“Food & Drink” → “Groceries + Eating out”*), and optionally **split or combine** categories. Mappings persist and apply on every run.
- **Recurring vs. one‑off** — optionally flag large one‑off transactions so they don’t distort a monthly target.

---

## 5. How the automation works (logic)

```
For each transaction in the selected period:
    category  = transaction.category (Plaid PFC) → mapped to the user's label
    amount    = transaction.amount               (Plaid: + = outflow, − = inflow)

    if category is in the EXCLUDE set (transfers, card/loan payments, user-excluded):
        skip
    else if amount < 0:                # money in
        income += |amount|             # unless the user excludes this income type
    else:                              # money out
        spendByCategory[category] += amount

Propose:
    income      = sum of detected inflows
    budgetLines = spendByCategory, sorted high → low,
                  each line: { category, suggestedAmount = actualSpend, actualSpend }
```

- **Confidence & transparency:** each proposed line links to the underlying transactions (“see the 14 transactions behind *Food & Drink — $612*”), so users trust the numbers.
- **Multi‑account & joint:** sums across all in‑scope accounts; de‑duplicates transfers between the user’s own accounts so an internal move isn’t counted as both income and expense.

---

## 6. Interface & UX design

The experience is built around a single, obvious entry point and a **review‑before‑apply** flow — the user is always shown what *will* change before it changes.

### 6.1 Entry point
On the Budget tab, alongside the existing controls (*Customize rule*, *Monthly take‑home*, *Apply template*), add a primary action:

```
[ 🏦  Auto‑fill from accounts ]
```

A short helper line sets expectations:
> *“We’ll read your linked bank and card transactions and suggest income and spending categories. Nothing is saved until you review.”*

### 6.2 Review sheet (the heart of the feature)
Clicking the button opens a **review sheet** rather than silently editing the budget:

```
┌─ Auto‑fill your budget ─────────────────────────────────────┐
│ From: June 2025 · 3 linked accounts            [ Change ▸ ] │
│                                                             │
│ Apply as:   ( ) Replace my budget   (•) Merge into it       │
│                                                             │
│ Detected income            $5,420   (2 deposits)   [ ⓘ ]   │
│                                                             │
│ Spending categories (12)                  Include  Amount   │
│   Rent & Utilities                          [✓]    $1,850   │
│   Food & Drink                              [✓]    $  612   │
│   Transportation                            [✓]    $  240   │
│   Shopping                                  [✓]    $  330   │
│   …                                                         │
│   Transfers / Card payments  (excluded)     [ ]      —      │
│                                                             │
│ [ Customize what’s included ▸ ]                             │
│                                                             │
│            [ Cancel ]            [ Apply to budget ]        │
└─────────────────────────────────────────────────────────────┘
```

Key affordances:
- **Replace vs. Merge** is a clear, two‑option toggle at the top, with a one‑line description of each.
- Each detected line has an **include checkbox** and an **inline‑editable amount**, so the user adjusts *before* applying.
- **“ⓘ / see transactions”** expands the transactions behind any number.
- **“Customize what’s included”** opens the filters (6.4) without leaving the flow.
- Applying writes to the **working budget only** (marked *unsaved*); the existing **Save** button commits it. A toast confirms: *“Budget auto‑filled — review and Save.”*

### 6.3 After applying
- Auto‑generated lines are visually tagged (e.g. a small *“auto”* chip) so the user can tell them from hand‑entered ones — and the tag clears once they edit a line.
- A subtle **“Updated from accounts · Undo”** affordance lets them revert to the pre‑fill state in one tap (since nothing was saved, this is just restoring local state).

### 6.4 Customization / filters
Reached from the review sheet or Budget settings:
- **Accounts** to include (checkbox list of linked accounts/cards).
- **Excluded categories** (chips you can add/remove; *Transfers* and *Card payments* excluded by default).
- **Income rules** (what counts as income; treat refunds as negative spend?).
- **Category mapping** (rename / combine / split Plaid categories into your labels).
- **Default apply mode** (Replace / Merge / *Ask each time*).

These settings persist, so future auto‑fills follow the user’s preferences automatically.

### 6.5 Balancing automation and control — interaction principles
- **Propose, don’t impose.** Automation produces a *draft* in a review sheet; the user approves it.
- **One‑tap to accept, easy to tune.** The default path (open → Apply → Save) is three taps; customization is available but never required.
- **Always reversible.** Because automation only touches unsaved state, “undo” is trivial and trustworthy.
- **Explainable numbers.** Every figure traces back to transactions.
- **Progressive disclosure.** Advanced filters live behind “Customize,” keeping the primary flow simple.

---

## 7. Edge cases & safeguards

- **No linked accounts / no transactions:** the button explains how to link an account; manual entry remains available.
- **Sparse month:** fall back to the last 30 days and label the period used.
- **Irregular income (1099/gig):** show income as a sum with a note that it may vary month to month; let the user average it.
- **Large one‑off purchases:** optionally flag outliers so a single big expense doesn’t set an unrealistic monthly target.
- **Re‑running:** safe and idempotent on unsaved state; the review sheet always reflects the latest data.
- **Privacy:** transactions are already securely synced; the automation runs on data the user has linked, and **no new data is collected**. Make this explicit in the helper copy.

---

## 8. Phased rollout

1. **Phase 1 — Auto‑fill (shipped, PR #130):** one button that detects income + categorized spend and replaces the working budget for review. Foundation in place.
2. **Phase 2 — Review sheet + Replace/Merge:** the review‑before‑apply sheet, include checkboxes, inline amount edits, and the explicit Replace/Merge choice.
3. **Phase 3 — Customization & filters:** account scope, excluded categories, income rules, and persisted preferences (incl. default apply mode).
4. **Phase 4 — Category mapping & smarts:** custom category labels (map/split/combine), outlier flagging, recurring detection, and “see the transactions” drill‑down.
5. **Phase 5 — Keep‑it‑current:** gentle prompts (“Your spending changed — re‑sync your budget?”) and optional periodic refresh of *actuals* against the budget.

---

## 9. Success metrics

- **Time‑to‑first‑budget** (target: minutes → seconds).
- **% of budgets created via auto‑fill** vs. fully manual.
- **Budget retention / revisit rate** (do users come back and maintain it?).
- **Edit rate after auto‑fill** (a little is healthy — it means they’re engaging and trusting; a lot may signal poor categorization to improve).
- **Opt‑out / undo rate** (signals over‑aggressive automation to tune).

---

## 10. Summary

This feature reframes budgeting from *“type everything in”* to *“review what we found and adjust.”* By turning already‑synced transaction data into a categorized draft budget — and wrapping it in a transparent, reversible, **Replace‑or‑Merge** review flow with full manual control and per‑user filters — TerraVest can dramatically lower the effort of starting and maintaining a budget **without taking control away from the user**. Automation does the work; the user stays in charge.
