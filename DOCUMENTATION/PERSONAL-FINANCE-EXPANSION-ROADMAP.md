# Personal Finance Expansion — Phase-Wise Roadmap

> **Goal:** grow reach and retention of the personal-finance app by adding the
> connective, habit-forming, and social layers that turn a tool into a daily app —
> **without disturbing the existing `Finance` core** (Personal Finances is fixed
> infrastructure), and delivered identically on web, iOS and Android via the config
> layer that already exists.

**Status legend:** ⬜ not started · 🟨 in progress · ✅ done

---

## 0. Ground truth — what we're building on

The app already has the mechanism this expansion needs; we are **wiring features to
it, not building new infrastructure.**

| Capability | Where it lives | What it gives us |
|---|---|---|
| Config-driven nav | `apps/web/src/config/moduleRegistry.js` + `remoteConfig.js` | Per-module `enabled`, `platforms:[]`, `requiredFlags:[]`, reorder/hide from server. Web + iOS + Android read the **same** `/api/v1/config/app?platform=…`. |
| Subscription tiers (config) | `apps/payment-service` → `subscription_plan` + `plan_feature` tables | Prices, trial, and **per-tier feature toggles** are DB rows. Flip a row → access changes on next load. |
| Feature gating (UI) | `apps/web/src/config/subscription.jsx` → `hasFeature('individual.x')`, `<FeatureGate>` | Any screen gates on an entitlement key from the DB. |

**Fixed infrastructure (do not overlap/replace):** the `Finance` section —
`home, accounts, transactions, budget, billpay (Make Payment), debt, invest, goals,
calculators, tax, mybusiness, ai-assistant` — plus `Real Estate` and `Settings`.

---

## 1. Target information architecture (end state)

Five top-level sections. Existing module **ids are unchanged** (so saved per-user nav
ordering keeps resolving); only their `section` grouping changes, plus new modules.

```
TODAY    → daily-open surface: activity feed, alerts, "needs you today", health score  [NEW]
MONEY    → home/overview · accounts · transactions · cash flow[NEW] · budgets · recurring[NEW] · make payment
GROW     → goals · debt lab · investments · emergency fund[NEW] · health score[NEW] · calculators · scenarios[NEW]
SHARED   → household[NEW] · shared goals & bills[NEW] · who-paid-what[NEW]
WEDGE    → my business · properties · deal room · fractional · taxes · find a CPA   (unchanged, tier-gated)
MORE     → AI assistant (floating) · documents · security · subscription · settings
```

Mobile renders the same five as a **bottom tab bar** (Today · Money · Grow · AI · More);
push notifications become the engagement engine.

---

## 2. Subscription tiers (end state)

Four tiers, all pure config (`subscription_plan` + `plan_feature` rows). See migration
`V6__expand_personal_tiers.sql`.

| Tier | plan_key | Price | Role |
|---|---|---|---|
| Free | `free` | $0 | Acquisition floor (no free tier today = biggest reach blocker) |
| Plus | `individual` (label→"Plus") | ~$9.99/mo | Serious personal users + households |
| Premium | `premium` | ~$14.99/mo | Power users / wealth builders |
| Business | `business` | $29.99/mo | The biz + rental wedge (superset) |

**Free is an implicit entitlement *floor*, not a purchasable $0 plan** — this sidesteps
$0-checkout entirely. Implemented (Phase 1):
- Backend `getEntitlements()` grants the **`free`** plan's `plan_feature` set to anyone
  without a LIVE subscription (NONE / EXPIRED / CANCELED / PAST_DUE); a live sub grants its
  own (superset) features.
- Web `hasFeature()` gates on that resolved feature map instead of the old "NONE = everything
  open" blanket, with fail-open on a genuine load error so a backend hiccup never locks anyone out.
- `free` stays `active = FALSE` **by design** so it never appears in the paid catalog/checkout;
  its `plan_feature` rows are still read as the floor.

---

## Feature master list → tier + type

`T` = table stakes (absence loses users) · `D` = differentiator (market this)

| Feature | feature_key | Tier | Type | Phase |
|---|---|---|---|---|
| Today / activity feed | `individual.todayFeed` | Free | D | 1 |
| Net-worth trends | `individual.netWorthTrends` | Free | T | 1 |
| Financial health score | `individual.healthScore` | Free | T | 2 |
| Recurring & subscriptions radar (personal) | `individual.recurring` | Free→Plus | T | 2 |
| Cash-flow view (safe-to-spend) | `individual.cashflow` | Plus | D | 2 |
| Smart alerts / anomaly detection | `individual.smartAlerts` | Plus | D | 2 |
| Emergency-fund coach | `individual.emergencyFund` | Free | D | 2 |
| Spending insights & auto-categorize | `individual.spendInsights` | Free→Plus | T | 2 |
| Shared household | `individual.household` | Plus | D | 3 |
| Shared goals & bills | `individual.sharedGoals` | Plus | D | 3 |
| Proactive AI (action-oriented) | `individual.aiProactive` | Plus | D | 3 |
| Credit score + monitoring | `individual.creditScore` | Free→Plus | T | 4 |
| Bill negotiation / due-date optimizer | `individual.billOptimizer` | Plus | D | 4 |
| Investment insights (fees, drift) | `individual.investInsights` | Plus | D | 4 |
| Net-worth / savings benchmarking | `individual.benchmarks` | Plus | D | 4 |
| Goal scenarios (retire-at-X sliders) | `individual.goalScenarios` | Premium | D | 5 |
| Family / kids mode | `individual.family` | Premium | D | 5 |
| Year-in-review ("wrapped", shareable) | `individual.yearInReview` | Free | D | 4 |
| Export everything / no lock-in | `individual.export` | Free | T | 1 (market existing) |

---

## Phase 1 — Foundation (config + shell) — 🟨 IN PROGRESS

Near-zero-risk, config-driven; unblocks everything else.

- ✅ `V6__expand_personal_tiers.sql` — add `premium` (active) + `free` (inactive) plans; add new personal `feature_key` rows across `free`/`individual`/`premium`/`business`.
- ✅ `Today` page — client-side aggregator (reuses `snapshot/accounts/transactions/paymentIntents/insights`); registered in `moduleRegistry`, routed in `AppLayout`, added as first Finance nav item.
- ✅ **6-section nav restructure** — `Today / Money / Grow / Business & Tax / Real Estate / More`. Done on BOTH sides: server (`platform-config-service` `V7__restructure_nav_sections.sql`) and web registry defaults (`moduleRegistry.js` sections + `DEFAULT_SECTIONS` + `DEFAULT_MODULES`). Module ids untouched; `resolveNav.test.js` green; build clean. *(Shared section deferred to Phase 3 — its features don't exist yet, so no empty section shipped.)*
- ✅ Entitlement resolver: `getEntitlements()` grants the Free floor to any non-live user (`SubscriptionService.java`); web `hasFeature()` updated to match with fail-open safety (`subscription.jsx`). Backend compiles, web builds. *(No $0-checkout change needed — Free is a floor, not a purchasable plan.)*
- ✅ `<UpgradePrompt>` overlay already exists and backs `<FeatureGate>` (used today on the 3 `business.*` screens). Free-floor users now correctly see it there.
- ⬜ Apply `<FeatureGate>` to the new Plus/Premium screens as they ship (per-phase).
- ⬜ Market the existing **export/no-lock-in** as a Free feature (copy only).

**Exit criteria:** ✅ new tiers in config · ✅ Today reachable · ✅ Free floor enforced (business screens gate for free users) · ✅ Finance core intact. Remaining: surface Free/Premium on the Subscription pricing UI (optional copy/UI pass).

---

## Phase 2 — Retention layer (daily-open habits) — 🟨 IN PROGRESS

The features that create reasons to open the app; highest retention ROI.

- ✅ **Net-worth trends** — ALREADY SHIPPED. `NetWorthChart` (area/line/bar + ranges + series), `computeContributors` ("what moved it", 30d), and `computeDownfall` exist and render on HomePage. No rebuild needed; revisit only for deeper drill-downs later.
- ✅ **Recurring radar (personal)** — detection already existed unused (`account-aggregation-service` `RecurringBillDetector` + `/recurring-bills` + `api.getRecurringBills()`). Built the surfacing: `RecurringPage.jsx` (monthly burn + annualized "aha" numbers, per-sub cadence/next-charge, empty/error states), registered in `Money` nav (server `V8__add_recurring_module.sql` + web registry). Build clean, nav test green. *(Currently ungated like Today; tighten to `individual.recurring` tier if desired — or add the key to the Free floor to keep it as a pure acquisition hook.)*
- ⬜ **Cash-flow view** — money in/out over time + safe-to-spend number.
- ⬜ **Smart alerts / anomaly detection** — large charge, low balance, double charge, bill increased → notifications (`notification-service`, `pushClient.js`).
- ⬜ **Emergency-fund coach** — target = N months of *real* expenses; auto-progress.
- ⬜ **Spending insights** — auto-categorize + merchant enrichment + "dining up 30%."
- ✅ **Financial health score** — 0–100 from savings rate, emergency-fund months, debt-to-asset, and net-worth trend, **action-first** (every factor says what to do next). Pure testable util (`utils/healthScore.js` + `healthScore.test.js`, 6 cases), `HealthScorePage.jsx` (gauge + factor breakdown), and a **compact score card on Today** as the daily centerpiece. Only weights factors it has data for (thin accounts don't get a misleading 0). In `Grow` nav (server `V9` + web). feature_key `individual.healthScore` (already on Free floor).
- ✅ **Recurring is a Free hook** — `individual.recurring` added to the Free floor (`payment-service` `V7__recurring_free_hook.sql`) so config matches the ungated page.

- ✅ **Cash-flow view** — money in vs out over the last 6 months + an honest **safe-to-spend** number (liquid cash − scheduled bills). Pure util (`utils/cashflow.js` + `cashflow.test.js`), `CashFlowPage.jsx` (grouped bar chart + avg in/out/net tiles), in `Money` nav (server `V10` + web). 58/58 tests pass.
- ✅ **Designs synced** — per `docs/DESIGN_SYNC.md`: updated `SCREEN_FEATURE_INVENTORY.md` (source of truth) with the 4 new screens + the new nav structure, then added them to all three mockups — web `terravest-redesign.html` (6-section sidebar + 4 `#page-*` screens + nav labels), iOS `terravest-ios.html` and Android `terravest-android.html` (4 phone frames each, new bottom tabs on new frames). All parse; div balance clean (web + Android); iOS carries a 1-div imbalance that pre-existed at HEAD.

- ✅ **Smart alerts / anomaly detection** — `utils/alerts.js` + 6 tests: low balance, possible duplicate charge, unusually large charge vs the category norm, recurring price hike. Dedicated `AlertsPage` in the Today section (V11), and the top alerts feed Today's "Needs you today" list.
- ✅ **Spending insights** — `utils/spending.js` + 8 tests: category breakdown with shares, month-over-month movers ("dining up 30%"), top merchants, 30d/90d/12mo range toggle. `SpendingInsightsPage` in Money (V12).
- ⚠️ **Sign-convention fix (important)** — Plaid returns `amount > 0` for a **charge**, and the API does not flip it (verified against the data, `RecurringBillDetector`, and `api.js`). The health-score/cash-flow/alerts utils had assumed the opposite, so income/spend, savings rate, emergency-fund months and anomaly detection were inverted. Fixed and encoded in the test fixtures. **The same inversion existed pre-existing on `TransactionsPage` and `HomePage`** (every purchase painted green as income) — also fixed: category icon, IN/OUT filter, Money In/Out/Net tiles, amount cells, and Home's recent-transaction rows.

- ✅ **Emergency-fund coach** — target sized to **real** monthly expenses (reuses `summarizeAccounts` + `monthlyCashFlow` from `healthScore.js`, so "months of expenses" is consistent app-wide). 3/6/12-month target, 6/12/24-month horizon → required monthly saving, and 1/3/6-month milestones. `utils/emergencyFund.js` + 8 tests; nav row V13.
- ✅ **Designs re-synced** — audited drift, then added **Alerts + Spending + Emergency Fund** to web + iOS + Android mockups and the inventory. Also fixed 3 pre-existing gaps in the web `navigate()` label map.

### ✅ Phase 2 COMPLETE
All retention-layer features shipped. 80/80 unit tests. Remaining polish (not blocking Phase 3):
- Re-theme the legacy per-frame mobile bottom tab bars to Today·Money·Grow·AI·More (new frames already use them).
- iOS mockup carries a 1-div imbalance that pre-dates this work.

**Exit criteria:** D1/D7 open-rate measurably up; recurring radar produces a real "found $X/mo" moment on first run; health score gives a first-run "aha".

---

## Phase 3 — Reach layer (multiplayer + AI moat) — ⬜

Doubles TAM and builds the defensible differentiator.

- ✅ **Shared household (3a + 3b + 3c) SHIPPED** — membership + invites, household-owned goals & bills, and opt-in account sharing. Design + rationale: [`docs/designs/SHARED_HOUSEHOLD_DESIGN.md`](../docs/designs/SHARED_HOUSEHOLD_DESIGN.md). Key finding: the JWT subject *is* the user id and every service authorizes via `WHERE user_id = :me` across **~59 user_id columns in 10 services**, so a "share everything" approach would require auditing every query — one miss is a cross-household leak. Recommended instead: phase it, starting with **household-owned** goals/bills that never touch existing scoping.
- ✅ **Shared goals & bills** — household-OWNED entities (not shared views), with per-member contribution split and who-paid-what. 64/64 auth-service tests across 3a/3b/3c.
- ✅ **Proactive AI — the Money Coach** — `utils/recommendations.js` + 7 tests composes anomalies, cash flow, emergency-fund gap, health factors, spending movers and debt into three ranked bands (Do this now / Worth doing soon / Opportunities), each with a real number and a deep link. Server AI insights merge in badged "AI". **Money figures are computed by our own math, never by a model** — a recommendation cannot hallucinate an amount (there's a test asserting no figures are invented with no data). `CoachPage` in Grow (nav row V14); synced into all three mockups + the inventory.

**Exit criteria:** ≥X% of active accounts add a second household member; proactive AI drives a measurable action (transfer/goal set) per active user.

---

## Phase 4 — Depth + monetization pull — ⬜

- ⬜ **Credit score + monitoring** — bureau partner integration (config-gated provider toggle; mock fallback per existing pattern).
- ⬜ **Bill due-date optimizer** — reorder due dates to smooth cash flow.
- ⬜ **Investment insights** — allocation, fees you're paying, drift alerts (not advice).
- ⬜ **Savings/net-worth benchmarking** — "vs. people like you," anonymized + opt-in. *(Guardrail: aggregate/anonymized insight only — never a data-broker model; see GTM notes.)*
- ⬜ **Year-in-review** — shareable "wrapped"; seasonal viral loop.

**Exit criteria:** Plus→Premium upgrade rate hits target; at least one differentiator (benchmarks or year-in-review) drives organic acquisition.

---

## Phase 5 — Premium power features — ⬜

- ⬜ **Goal scenarios** — retire-at-60-vs-65 sliders, Monte-Carlo-lite.
- ⬜ **Family / kids mode** — allowance, teen accounts, guardian view.
- ⬜ **Priority AI** — faster/deeper assistant for Premium.

**Exit criteria:** Premium tier justifies its price; churn on Premium below target.

---

## Phase 6 — Mobile parity (iOS + Android) — ⬜ (runs alongside every phase)

The config + entitlements are already cross-platform; mobile is a rendering job, not a re-architecture.

- ⬜ Every new feature built **config-first + API-first** (thin client over shared services).
- ⬜ Mobile shell: bottom tab bar (Today · Money · Grow · AI · More) instead of sidebar.
- ⬜ Push notifications as the engagement engine (bill due, unusual charge, goal hit, tax estimate ready).
- ⬜ Per-platform module visibility via `platforms:[]` where a feature ships web-first.
- ⬜ Keep the three design mockups (web + iOS + Android) in sync on every UI change *(see design-mockups-sync memory)*.

---

## Cross-cutting guardrails

- **Never break the Finance core.** New features slot beside existing modules in the same sections; ids stay stable.
- **Every integration behind a config flag + mock fallback** (existing provider-toggle pattern).
- **Subscription = overlay, never a lockout.** A backend hiccup must leave users un-gated, not locked out (current `hasFeature` policy already does this).
- **No data-broker monetization.** Benchmarks/insights are aggregate + anonymized + opt-in only; the business model is subscriptions. This protects the trust required for bank links.
- **Rebuild the SPA on deploy** for any frontend change *(web-deploy-needs-rebuild + PWA stale-cache memories)*.
