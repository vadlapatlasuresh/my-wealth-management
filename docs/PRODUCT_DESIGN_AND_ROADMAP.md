# TerraVest — Product Design & Roadmap to Fundability

_Last updated: 2026-06-07_

This document covers what is **unclear or missing** in the current product, the **design
changes** that fix it, the **"good-to-have" features** that make TerraVest genuinely
useful (and fundable), and a **prioritized roadmap** tied to funding milestones.

It assumes the strategic wedge already in the codebase: **self-employed people and
small-business owners who also hold real estate** — a segment Mint-clones serve poorly
and that has real willingness to pay.

> **Shipped since first draft — the Deal Room** (full two-sided investment marketplace):
> deal registration with a category/subcategory + return-structure taxonomy, a
> filterable/sortable/paginated marketplace, investor interest with accreditation gating and
> indicative commitments, sponsor lead management, track records, link-based documents, an
> investor watchlist, and in-app sponsor notifications. See **[DEAL_ROOM.md](DEAL_ROOM.md)**.
> This directly advances the GROW area and the P2 "differentiation & moat" items below.
> Still outstanding from this doc's P0: **first-run onboarding** and **real net-worth history**.

> **Shipped since — platform hardening & QA pass:**
> - **Verified end-to-end on Postgres.** The full 11-service stack now runs against a
>   persistent local Postgres (`deploy/start-local.sh`); register → login → every read
>   endpoint → the complete Deal Room lifecycle (create → marketplace → investor interest
>   with contact-share → leads → documents → watchlist) and budgets/goals/properties/
>   bill-pay all verified green, with data persisting across restarts.
> - **Account deletion is real.** `DELETE /api/v1/auth/me` (authenticated) permanently
>   removes the user's identity; the Settings action now performs it and signs the user out.
> - **Data export is real.** Settings → "Export my data" downloads an actual JSON file
>   gathered across services (profile, net-worth snapshot, accounts, transactions, goals,
>   notifications, preferences) instead of a stubbed "we'll email you."
> - **Transaction categorization now persists.** The Cash page category editor was wired to
>   a dead legacy Node route; it now calls a real ownership-scoped
>   `PATCH /api/v1/aggregation/transactions/{id}/category`.
> - **Dark mode** is reachable from Settings (was a stale "coming soon" toggle) and stays in
>   sync with the existing topbar theme switcher.
> - **Mobile navigation works.** Below 900px the sidebar is now an off-canvas drawer toggled
>   by the hamburger (with a dimming backdrop), wide grids stack, and the chrome tightens —
>   previously the desktop layout just got cramped and most pages were hard to reach.
> - **No more blocking `alert()`s.** Budget/Debt/Cash error paths use inline, dismissible
>   banners. A latent bug where every 204-returning API call (all DELETEs) threw on an empty
>   body was also fixed.

---

## 1. Design principles (the lens for every decision)

1. **Trust before features.** This is a money app. Every screen should answer "why is
   this safe and accurate?" before "what can I do?". One fake number destroys trust
   permanently.
2. **One clear job per screen.** 22 pages today is overload. Each screen should have a
   single primary action and a single primary number.
3. **Progressive disclosure.** A new user sees a 3-step path, not a 22-item sidebar.
   Power features reveal themselves as accounts/data accumulate.
4. **Show the math.** Net worth, runway, tax estimates — always link to "how this was
   calculated." Transparency is the moat against "I don't trust this number."
5. **Calm, premium, neutral.** Wealth UX should feel quiet and confident, not gamified.

---

## 2. What's unclear / missing today (the gaps)

| Gap | Why it hurts adoption & rating | Severity |
|---|---|---|
| **No first-run onboarding.** New user lands in a 22-page app with empty data. | No "aha moment" → immediate churn. This is the #1 fundability blocker. | 🔴 Critical |
| **Information architecture overload.** 22 sidebar pages, flat. | Users can't find the value; reviews say "confusing/bloated." | 🔴 Critical |
| **No activation metric designed in.** Nothing guides user to the one action (link an account) that creates value. | Can't show investors an activation funnel. | 🔴 Critical |
| **Empty states exist but don't guide.** They say "no data" but not "do THIS next." | Dead ends instead of conversion. | 🟠 High |
| **Net-worth chart is synthetic** (growth curve is generated, not real history). | A fabricated trend line is a demo landmine and a trust risk. | 🟠 High |
| **Trust signals absent.** No visible encryption/read-only/bank-security messaging — even though Plaid tokens are now actually encrypted. | Users hesitate to link banks; you under-sell real security. | 🟠 High |
| **No goals or narrative.** App shows balances, not progress toward anything. | No reason to return weekly → low retention. | 🟠 High |
| **Self-employed value not surfaced.** Business/real-estate services exist but aren't the hero. | You look like every other dashboard instead of the niche leader. | 🟠 High |
| **No mobile-first empty/loading/error states.** | Mobile is where these users live. | 🟡 Medium |
| **Accessibility unaudited** (contrast, focus order, screen-reader labels). | Caps your addressable users and app-store/web rating. | 🟡 Medium |

---

## 3. The activation flow (highest-leverage design change)

The single most important thing for ratings AND funding is a **first-run flow that
reaches an "aha moment" in under 2 minutes.** Define activation as:
**"linked ≥1 account AND saw a real net-worth number."**

```
┌─────────────────────────────────────────────────────────────┐
│  Welcome to TerraVest                              ● ○ ○ ○    │
│                                                              │
│   See your whole financial life — business, property,        │
│   and personal — in one honest number.                       │
│                                                              │
│   What best describes you?                                   │
│   ┌───────────────┐ ┌───────────────┐ ┌───────────────┐      │
│   │ 🧑‍💼 Self-      │ │ 🏠 Real-estate │ │ 👤 Personal    │      │
│   │   employed /  │ │   investor     │ │   finances     │      │
│   │   business    │ │                │ │                │      │
│   └───────────────┘ └───────────────┘ └───────────────┘      │
│                                                              │
│   [ This personalizes your dashboard. You can change it. ]   │
│                                            [ Continue → ]     │
└─────────────────────────────────────────────────────────────┘
        │
        ▼  (persona tailors which modules show first)
┌─────────────────────────────────────────────────────────────┐
│  Step 1 of 3 — Link your first account        ● ● ○ ○        │
│                                                              │
│   🔒 Bank-level security. Read-only. We can never move       │
│      your money. Your credentials are never stored.          │
│                                                              │
│         ┌──────────────────────────────────────┐            │
│         │        + Connect a bank (Plaid)        │            │
│         └──────────────────────────────────────┘            │
│         or  · Add an account manually                        │
│             · Add a property                                 │
│                                                              │
│                                  [ Skip for now ]            │
└─────────────────────────────────────────────────────────────┘
        │
        ▼  (the aha moment — first real number)
┌─────────────────────────────────────────────────────────────┐
│  🎉 Here's your net worth                                     │
│                                                              │
│              $ 84,210                                         │
│         ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔                                     │
│   Cash $12,400 · Investments $—  · Property $—  · Debt $4,200 │
│                                                              │
│   Next best step:                                            │
│   ☐ Link a credit card to see your full debt picture         │
│   ☐ Add your business income (you're self-employed)          │
│   ☐ Set your first goal                                      │
│                                       [ Go to dashboard → ]   │
└─────────────────────────────────────────────────────────────┘
```

Design notes:
- **Persona selection** drives which dashboard modules lead (business cash-flow for
  self-employed; equity/cap-rate for real-estate; budgets for personal).
- The security copy on the link step is now **literally true** (tokens are encrypted at
  rest, Plaid is read-only) — say it loudly.
- Every empty state elsewhere becomes a **"next best step" card**, not a dead end.

---

## 4. Information architecture redesign (22 pages → 5 clear areas)

Collapse the flat 22-item sidebar into **5 top-level areas**, with the rest as
sub-tabs. Lead with the wedge.

```
TODAY                      → Home dashboard: net worth, this-week cash flow, alerts
ACCOUNTS & NET WORTH       → Accounts, Transactions, Cash, Investments, Real Estate
BUSINESS                   → P&L, invoices/expenses, runway, estimated taxes   (self-employed hero)
PLAN                       → Goals, Budgets, Debt Lab, AI Assistant
GROW                       → Learn, Deal Room, Fractional LLC   (clearly labeled "concept/preview")
─────────────────────────
Profile · Security · Settings · Support   (footer, not primary nav)
```

Rules:
- Persona reorders these (self-employed → BUSINESS second; real-estate → ACCOUNTS leads
  with Real Estate).
- Anything not backed by real data is labeled **"Preview"** so it never reads as fake.
- The sidebar is already config-driven (`resolveNav`), so this is a config change, not a
  rewrite.

---

## 5. "Good-to-have" features, ranked by impact on funding

Tiered. P0 = needed for a credible launch + investor demo; P1 = drives retention/ARPU;
P2 = differentiation/moat.

### P0 — credible launch (do these before showing investors)
1. **First-run onboarding + activation funnel** (Section 3). _Single biggest lever._
2. **Real net-worth history.** Persist a daily snapshot per user; the chart and the
   30-day change become real instead of synthetic/zero. (Backend job already scoped.)
3. **Guided empty states** everywhere ("next best step" cards).
4. **Trust center.** A visible "How your data is protected" page + per-screen security
   badges. Back it with the real encryption/read-only facts.
5. **Manual accounts & assets.** Not everyone can/will link Plaid. Let users add cash,
   property, vehicles, crypto, private holdings by hand — critical for the real-estate
   and self-employed segments.

### P1 — retention & willingness-to-pay
6. **Goals.** "Emergency fund to $15k", "Pay off card by Dec", "Down payment $60k" with
   progress and projections. _This is the reason to return weekly._
7. **Cash-flow & runway for self-employed.** "At your burn, business cash lasts 4.2
   months." Nobody serves this well — it's the wedge's killer feature.
8. **Estimated quarterly taxes** for self-employed (set-aside %, due-date reminders).
   High pain, high willingness to pay.
9. **Alerts that matter** (low runway, large/unusual transaction, bill due, goal hit) —
   delivered through the now-real notification channels, opt-in.
10. **Net-worth report export / shareable snapshot** (PDF). Doubles as organic growth.
11. **Accountant / partner access** (read-only invite). Sticky for business owners.

### P2 — differentiation & moat
12. **Peer benchmarks** ("self-employed, 30s, your region: you're saving more than 62%").
    Anonymous, aggregate — also a community/virality hook.
13. **Real estate intelligence** (per-property cap rate, cash-on-cash, refinance alerts).
14. **Scenario planning** ("what if I hire", "what if rates drop 1%").
15. **Document vault** (leases, tax docs, entity docs) — increases switching cost.
16. **Open net-worth benchmarks / content** published publicly for SEO + community trust.

---

## 6. Trust & credibility design (fintech-specific)

- **Security badge component** on every data-entry/link screen: "🔒 Read-only · Encrypted
  · We can't move your money."
- **A real Trust/Security page**: what you encrypt, that Plaid is read-only, how to delete
  data, who can see what. (Now truthful after the security hardening.)
- **Calculation transparency**: every headline number has an "ⓘ how this is calculated."
- **No fabricated data, ever** — already enforced; make it a written product rule.
- **Status & uptime** honesty: show "last synced" timestamps, sync errors plainly.

---

## 7. Community & virality (the "useful to the community" + funding angle)

- **Shareable net-worth / financial-health report** (privacy-safe, numbers optional).
- **Anonymous benchmarks** people genuinely want ("am I normal?") — strong word-of-mouth.
- **Free public tools** (net-worth calculator, self-employed tax-set-aside calculator,
  runway calculator) as SEO/top-of-funnel — each links into signup.
- **Educational Learn track for the self-employed** (real content, not placeholders).
- **Referral / invite** with a clear value (e.g. extra goal slots, longer history).
- **Public roadmap + changelog** — builds community trust and shows momentum to investors.

---

## 8. Metrics the design must produce (what investors ask for)

Design the funnel so these are measurable from day one:
- **Activation rate** = % of signups who link ≥1 account and see a net-worth number.
- **Time-to-activation** (target < 2 min).
- **WAU/MAU** and **week-4 retention cohort** (the number that decides seed funding).
- **Accounts linked per active user** (depth of engagement / data moat).
- **% on a paid tier** once pricing is introduced.

Instrument the onboarding steps, the link-account event, goal creation, and weekly return.

---

## 9. Visual / brand polish

- Tighten to one type scale, one spacing scale, one elevation system (the theme CSS is a
  good base — audit for consistency).
- **Number-forward dashboard**: one hero number, calm supporting tiles, generous
  whitespace.
- **Dark mode** finished (currently "coming soon").
- **Accessibility pass**: WCAG AA contrast, visible focus states, semantic labels,
  keyboard nav — raises both rating and addressable market.
- **Empty/loading/error states** designed for every async surface (no blank flashes).

---

## 10. Prioritized roadmap → funding milestones

**Milestone A — "Credible product" (pre-demo):** Onboarding + activation funnel · real
net-worth history · guided empty states · trust center · manual accounts. _Outcome: a demo
with zero fake data and a clear aha moment._

**Milestone B — "Retention" (pre-seed traction):** Goals · self-employed cash-flow/runway ·
estimated taxes · meaningful alerts · report export. _Outcome: 50–100 weekly-active users
in the niche; measurable week-4 retention._

**Milestone C — "Moat & monetization" (raise):** Peer benchmarks · accountant access · real
estate intelligence · paid tier. _Outcome: retention cohorts + early revenue → the seed
pitch is "traction + an underserved segment," not "an idea."_

---

### The one-line version
Stop being "a net-worth dashboard for everyone." Become **"the financial command center
for self-employed people with property"** — and prove it with an onboarding that delivers
a real number in 2 minutes, features that make them return weekly, and zero fake data.
That is what earns good ratings, community trust, and a fundable retention curve.
