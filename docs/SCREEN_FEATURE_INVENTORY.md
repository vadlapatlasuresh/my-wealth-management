# TerraVest — Screen Feature Inventory

> This document is auto-derived directly from the real React source under `finance-mvp/apps/web/src/pages/` (and supporting components in `/components/`). It is the **source of truth** for the design mockups: every section, tab, control, data field, badge, chart, and empty/error/loading state listed here exists in the shipped code. Labels are taken verbatim from the components. Where the code uses honest empty states or "mock/demo" markers (e.g., simulated broker OAuth, example fractional offerings), this is called out so mockups reflect the real product, not aspirational features.

---

## Sign in / Sign up (AuthPage)

Split-screen auth: left brand panel, right form panel.

**Sections/cards**
- Left brand panel: TerraVest logo + wordmark + tagline "All your wealth · One place"; headline "Build and manage your wealth with confidence."; sub-copy; feature list (3 items): "Complete net-worth picture", "Bank-grade security" (Plaid, read-only), "AI-powered guidance"; footer "© 2026 TerraVest · Your data is encrypted in transit and at rest."
- Right card: title toggles "Welcome back" (login) / "Create your account" (signup) with sub-line.

**Tabs / segmented controls**
- Segmented toggle: **Sign in** / **Create account** (also a text link at the bottom: "New to TerraVest? Create one" / "Already have an account? Sign in").

**Key controls & fields**
- *Login mode (TWO STEPS — MFA on every login):*
  - **Step 1:** Email, Password (show/hide eye), "Forgot password?" link, **Sign in** submit.
  - **Step 2 (MFA):** after a correct password, a code-entry view: "Enter the 6-digit code we sent to {masked destination} via {Email|SMS}", 6-digit code input, **Verify** button (→ token), **Resend** link, "Back to sign in", dev-only "Dev code: …" hint, inline invalid/expired-code error. Destination is masked (e.g. `d•••@gmail.com` / `•••-•••-1234`).
- *Signup mode:*
  - **Account type** selector — two cards: **Individual** ("Personal finances") / **Business** ("Company finances").
  - First name, Last name (combined into a display `name`).
  - **Date of birth** (date picker).
  - **Email** + **email verification**: "Verify email" → 6-digit code → "Verify"; "Email verified" badge; dev-code hint. **Required.**
  - Password (show/hide) + **strength meter** (Weak / Fair / Strong).
  - Confirm password with inline match hints.
  - **Phone number** + SMS verification (Send code → OTP → Verify; "Phone verified" badge; dev-code hint). **Required.**
  - **Address**: line 1, line 2 (optional), city, state, postal code, country.
  - **Preferred MFA channel** selector: **Email / SMS** (used for the login code).
  - *Individual only:* **Social Security Number** (input masked 123-45-6789; note "Encrypted at rest — only the last 4 are ever shown.").
  - *Business only:* **Business name** (required) + **EIN** (masked; "Used to link & verify your business.").
  - **Terms agreement** checkbox.
  - **Create account** submit (gated on first/last name, DOB, valid+verified email, password ≥ 8, matching confirm, terms, phone verified, full address, SSN (Individual) / business name + EIN (Business)).
- Footer: "Protected by bank-grade encryption · Powered by Plaid".

**States**: top error banner; disabled/greyed submit until valid; OTP/MFA error inline messages; the login MFA code step replaces the password card until verified or "Back".

---

## Navigation structure (Phase 2 expansion)

The sidebar (web) / bottom tabs (mobile) are config-driven (`moduleRegistry.js` + `platform-config-service`). Sections, in order:
- **Today** — Today, Alerts
- **Money** — Home, Accounts, Transactions, Budgets, Make Payment, Recurring, Cash Flow, Spending
- **Grow** — Goals, Debt Lab, Investments, Calculators, AI Assistant, Health Score, Emergency Fund, Coach
- **Shared** — Household, Goals & Bills
- **Business & Tax** — My Business, Taxes
- **Real Estate** — Properties, Deal Room, Fractional LLC
- **More** — Documents, Security, Messages, Subscription, Settings, Profile

Mobile bottom tabs: **Today · Money · Grow · AI · More**. *(Existing mobile frames still show the legacy Home/Accounts/Budget/Invest/More tab bar; the new-screen frames use the new tabs — a full per-frame tab-bar re-theme is a pending visual task.)*

---

## Today (TodayPage)  ·  *NEW, Phase 2*  ·  feature_key `individual.todayFeed` (Free)

The daily-open surface. A composition of data the app already loads — no new backend.

**Header**: live greeting "{Good morning/…}, {name}" + date · time; sub "here's what needs you today".
**Sections/cards**
- **Financial health card** (clickable → Health Score): conic-gradient score ring (0–100) + band ("Good") + the weakest factor's action line + chevron.
- **Quick stats** (3 clickable tiles): Net worth (→ home), Available cash (→ accounts), Bills due soon ("{n} scheduled", → make-payment).
- **Needs you today**: prioritized action list from real state — bills due within 7 days (amber, "Review" → make-payment), low-cash warning (red, → accounts), up to 2 AI/system insights ("Ask AI"). Empty: "You're all caught up."
- **Recent activity**: top 6 transactions (in/out arrow, label, category, signed amount), "View all →" (→ transactions).
**States**: full empty state ("Link an account to begin" + Link accounts CTA) when no accounts/transactions; per-section empty states.

## Cash Flow (CashFlowPage)  ·  *NEW, Phase 2*  ·  feature_key `individual.cashflow`

Money in vs out over time + an honest safe-to-spend number. Computed client-side (`utils/cashflow.js`).

**Header**: "Cash flow" / "What's coming in, what's going out, and what's safe to spend".
**Sections/cards**
- **Safe to spend** headline card: wallet chip, big number, "{cash} cash − {scheduled bills}" breakdown (red when negative).
- **Averages** (3 KPI tiles): Avg money in (green), Avg money out (gold), Avg net (green/red) — all "/mo".
- **Last 6 months** card: grouped bar chart, income (forest) vs spend (gold) per month, with a legend.
**States**: empty state ("No cash flow yet" + Link accounts) until there's ≥1 month of activity. Disclaimer: "estimate for guidance, not financial advice."

## Recurring & subscriptions (RecurringPage)  ·  *NEW, Phase 2*  ·  feature_key `individual.recurring` (Free hook)

Surfacing of the existing `RecurringBillDetector` (`/api/v1/aggregation/recurring-bills`).

**Header**: "Recurring & subscriptions" / "Every repeating charge we found…".
**Sections/cards**
- **Aha numbers** (2 KPI): monthly burn "~${x}/mo · on {n} recurring charges"; annualized "${y}/yr · cancel one you forgot…".
- **Subscription list**: per charge — repeat icon, name, "{cadence} · seen {n}× · next {date}", median amount, and a due chip ("Due today"/"Tomorrow"/"in {n} days", red when ≤5 days).
**States**: loading ("Scanning your transactions…"); empty ("No recurring charges yet" + Link accounts); error message inline. Footer note on median amounts + auto-drop-off.

## Household (HouseholdPage)  ·  *NEW, Phase 3a*  ·  feature_key `individual.household` (Plus, owner-pays)

Membership + invitations. **No financial data is shared** — a household grants access to
household-owned objects only.

**Header**: "Household" / "Share goals and bills with a partner — without sharing everything".
**States / sections**
- **Not in a household**: "Start a household" (name + Create) and "Got an invite?" (paste code + Join).
- **In a household**: name card with member count and your role, plus **Leave**.
- **Members**: avatar, name/email, Owner|Member; owners get **Remove** on other members.
- **Invite someone** (owner only): email field → **Create invite**; the single-use code is shown
  **once** in a highlighted box with **Copy code**; pending invites listed with **Revoke**.
- **Share an account** (Phase 3c): every linked account listed with a lock/shared icon, its
  balance, and a **Share** / **Stop sharing** toggle. Default private — nothing is on until the
  owner turns it on; revoking takes effect immediately.
- **Shared with you**: accounts other members shared, showing label + "Shared by {name}".
- Footer: only explicitly shared accounts are visible; transactions, properties and business data
  are never shared.
**Rules surfaced**: code is single-use, expires in 7 days, and only works for the invited email.

## Shared goals & bills (SharedMoneyPage)  ·  *NEW, Phase 3b*  ·  feature_key `individual.sharedGoals`

Household-**owned** goals and bills — not shared views of personal ones.

**Header**: "Shared goals & bills" / "What you're saving for together — and who actually paid".
**Tabs**: **Shared goals** / **Shared bills**.
**Goals tab**: "New shared goal" (name + target → Add); each goal card shows saved-of-target, a
progress bar, a **per-member contribution split** ("Alex $11,200 · Jordan $7,200"), an
"Add contribution" field, and Delete.
**Bills tab**: "New shared bill" (name + amount → Add); each bill shows amount + cadence,
total paid to date, a **who-paid-what** list (member, amount, date), **I paid this**, and Delete.
**States**: "Start a household first" (→ Household) when the user has none; per-tab empty states.
**Guarantee**: contributions and payments are always attributed to the caller — you cannot log
money as someone else.

## Money Coach (CoachPage)  ·  *NEW, Phase 3*  ·  feature_key `individual.aiProactive`

The proactive layer: ranked next-best-actions composed from every signal the client computes
(`utils/recommendations.js`), with the AI service's insights merged in and attributed.

**Header**: "Your money coach" / "What to do next, ranked — built from your real numbers, not guesses".
**Sections/cards**
- **Summary card**: "{n} things need you now" (or "Nothing urgent right now") + total recommendation count.
- **Three priority bands**, each with a sub-caption:
  - **Do this now** — "Costs you money if ignored": high-severity anomalies, spending-exceeds-income (with the monthly gap), emergency fund below one month.
  - **Worth doing soon** — "Moves your score and your margin": emergency-fund gap with the required monthly saving, weak health-score factors, the biggest month-over-month spending riser.
  - **Opportunities** — "Easy wins when you have a minute": debt-payoff modelling, subscription review, and AI insights.
- Each card: tinted icon chip, left accent bar by tone (red/amber/forest), title, detail carrying the actual number, and an action button that deep-links (`/alerts`, `/cash-flow`, `/emergency-fund`, `/health-score`, `/debt`, `/spending`, `/recurring`, `/ai-assistant`).
- AI-sourced items carry an **AI** badge.
**States**: an un-linked banner ("Link an account for personalized guidance — until then we'll only show general opportunities, never made-up numbers"); with no data only Opportunity-band items appear.
**Guarantee**: money figures are computed by the app, never generated by a model. Footer disclaims AI items as educational information, not personalized financial advice.

## Smart alerts (AlertsPage)  ·  *NEW, Phase 2*  ·  feature_key `individual.smartAlerts`

Anomaly detection computed client-side (`utils/alerts.js`) from accounts + transactions.

**Header**: "Smart alerts" / "Unusual activity we spotted in your accounts — before it costs you".
**Sections/cards**
- **Count line**: "{n} alerts · {m} need attention".
- **Alert cards**, severity-ordered (high first), each with a left accent bar, tinted icon chip, title, detail, and a chevron that deep-links: **Low balance** (red → /accounts), **Possible duplicate charge** (red → /transactions), **Unusually large charge** vs the category norm (amber → /transactions), **Price went up** on a recurring charge (amber → /recurring).
**States**: no-data ("Link accounts to enable alerts" + CTA); all-clear ("Nothing unusual right now"). Footer note that alerts update as activity syncs.
*Also feeds the top 2 alerts into Today's "Needs you today" list.*

## Spending insights (SpendingInsightsPage)  ·  *NEW, Phase 2*  ·  feature_key `individual.spendInsights`

Category breakdown and movers computed client-side (`utils/spending.js`).

**Header**: "Spending insights" / "Where your money actually goes — and what changed".
**Tabs / controls**: range toggle **30 days / 90 days / 12 months**.
**Sections/cards**
- **Total spent** headline for the selected range.
- **What changed vs last month**: biggest movers with up/down arrows — "{category} up 30% — $640 vs $492", or "is new this month". Small moves are filtered out as noise.
- **By category**: a single proportional stacked bar + a list (color dot, category, % share, amount), top 8.
- **Top merchants**: ranked 1–5 with charge counts, plus "All transactions" (→ /transactions).
**States**: empty ("No spending to analyze yet" + Link accounts CTA).

## Emergency fund (EmergencyFundPage)  ·  *NEW, Phase 2*  ·  feature_key `individual.emergencyFund` (Free)

A cushion sized to **real** monthly expenses (`utils/emergencyFund.js`, reusing the health-score helpers).

**Header**: "Emergency fund" / "A cushion sized to your real expenses — and how to get there".
**Sections/cards**
- **Progress card**: saved-so-far vs target amount, a progress bar, "{x.x} months covered · {Not started|Getting started|Solid cushion|Fully covered}", and "{amount} to go" (or "Target reached 🎉").
- **Your target**: segmented **3 / 6 / 12 months**, with the derived monthly-expense figure stated.
- **Get there in**: segmented **6 / 12 / 24 months** → a highlighted plan card, "Save ${x}/month to reach {n} months of expenses in {h} months". Hidden once the target is met.
- **Milestones**: 1 / 3 / 6 months of expenses, each with a reached tick or "{amount} to go".
**States**: not-computable ("We need your spending first" + Link accounts CTA) when no monthly expense figure exists — deliberately avoids showing a scary "0 months" off no data. Footer note: counts easy-access balances only.

## Financial Health Score (HealthScorePage)  ·  *NEW, Phase 2*  ·  feature_key `individual.healthScore` (Free)

A single 0–100 score with an action-first breakdown. Computed client-side (`utils/healthScore.js`).

**Header**: "Financial health score" / "One number for where you stand — and the moves that raise it".
**Sections/cards**
- **Gauge card**: semicircular SVG gauge (color by score: forest ≥80/≥60, gold ≥40, red below) with the number + "out of 100", the band label, and "Based on {n} factors…".
- **What's driving it**: one row per factor (Savings rate, Emergency fund, Debt load, Net worth) — icon, label, band badge, detail line, a mini progress bar (colored by score), and a concrete action line. Only factors with data are shown/weighted.
**States**: empty ("Link accounts to see your score" + CTA) when nothing computable. Disclaimer: "estimate for guidance, not financial advice."

---

## Year in Review (YearInReviewPage)  ·  *NEW, Phase 4*  ·  feature_key `individual.yearInReview`

"Wrapped for your money." Client-computed (`utils/yearInReview.js`), design per IMG_1678.
**Header**: "Your year in money" + year selector. **Hero**: you-spent / you-earned big numbers + green net.
**Tabs**: Spending / Income / Cash Flow. **Sections**: stacked-bar spend-by-month (canonical category colors) + top-categories legend; "Where it went" donut; top merchants; fun-facts row (avg/mo, biggest month, biggest purchase, top category). **States**: honest empty ("No recap yet for {year}").

## Bill Timing (BillOptimizerPage)  ·  *NEW, Phase 4*  ·  feature_key `individual.billOptimizer`

Bill due-date optimizer. Reuses the recurring-bill sources (`utils/billOptimizer.js`).
**Verdict** card (balanced vs "{n}% lopsided"); **before/after** outflow split (1st–15th vs 16th–end); **suggested moves** (shift smallest bills off the heavy half — suggests only, never moves money). **States**: "Not enough bills to optimize yet."

## Investment Insights (InvestmentInsightsPage)  ·  *NEW, Phase 4*  ·  feature_key `individual.investInsights`

Allocation, concentration, fees, drift from REAL holdings (`utils/investmentInsights.js`).
**KPIs**: Total invested, Positions (+ effective holdings), Est. fees/yr, Top position. **Mix vs target** donut + drift bars with target ticks. **"What to look at"** ranked alerts (concentration/diversification/fees/cash-drag/drift). **Top positions** weight bars. **Fees** estimated only for recognized funds (public expense ratios) with an honest coverage %. **States**: "No holdings to analyze yet."

## Credit Score (CreditScorePage)  ·  *NEW, Phase 4*  ·  feature_key `individual.creditMonitoring`  ·  behind `FLAGS.CREDIT_MONITORING`

Credit monitoring (`utils/creditMonitoring.js`). Off by default; nav appears only when the
flag is on; route `/credit` always works for preview. Live bureau via `api.getCreditProfile()`
when `credit_monitoring_live` is on, else a deterministic per-user **demo** profile (clearly labeled).
**Hero**: banded 300–850 **ScoreGauge** + delta + band legend; **utilization ring**. **Score history** 12-month area chart. **Impact-first factor breakdown** (payment history/utilization/age/mix/inquiries with weight, status, impact, bar). **Recent changes** timeline. Demo banner + "not a credit decision" disclaimer.

## Home / Dashboard (HomePage)

**Header**: live greeting "{Good morning/…}, {name}" with date · time clock (ticks each minute); actions: Last-refreshed indicator, **Export** (downloads transactions CSV), **Add Account** (→ /accounts).

**Sections/cards**
- **Guided-tour banner**: "New to TerraVest? Take the guided tour" with **How to use** button (→ /guide).
- **KPI grid** (6 clickable cards, each navigates to its detail screen, each with 30d delta + %):
  - Net Worth (→ accounts), Cash (→ accounts), Investments (→ invest), Real Estate (→ realestate, total value), RE Equity (→ realestate), Total Debt (→ debt).
- **Net worth over time** card (full-width):
  - Chart-type toggle: **Area / Line / Bars** (persisted to localStorage).
  - Range buttons: **1H, 1D, 1W, 1M, 3M, 1Y, All** + **Custom** (popover with From/To date pickers, Apply/Cancel).
  - **Downfall alert** banner (shown only when net worth fell beyond threshold): "Net worth fell X% this period." + "Biggest drag: {contributor} ({amount})."
  - `NetWorthChart` (see component notes).
  - **"What moved it · 30d"** color-coded contributor chips (green up / red down; negatives emphasized during a downfall).
- **Credit utilization** card: donut SVG with % + "Good"; total balance "of {limit} limit used"; "Below 30% — ideal" badge.
- **Upcoming bills** card: "View all →" (→ billpay); list rows (icon, name, "Due {date}", amount, **Pay** button → billpay); "Total due" footer. Empty state: "No upcoming bills."
- **Recent transactions** card: "View all →" (→ transactions); top 4 rows (icon, description, "{date} · {category}", signed amount).
- **AI Insights** card: "Updated daily" gold badge; top 2 insights (icon by positive/negative, title, description, "See recommendation →" → ai-assistant). Empty state: "No insights yet. Link accounts…".

**States**: empty states for bills, insights; downfall alert; clickable KPI hover.

---

## Accounts (AccountsPage)

**Header**: title + "All linked financial accounts in one place"; actions: Last-refreshed, **Refresh** (re-sync; "Syncing…"), **Link Account** (Plaid link button).

**KPI grid** (5 cards, each with info-tooltip): **Net Position** ("{N} accounts linked" delta), **Total Assets**, **Cash**, **Investments**, **Total Debt**.

**Account groups** (cards grouped + ordered): Cash & Banking, Investments, Credit Cards (liability), Loans (liability), Other Accounts. Each group header: icon, label, "{N} accounts", subtotal (shown negative + "Owed" for liabilities, else "Balance").

**Per-account rows**: icon, name, official name, subtype badge, "Plaid" lock badge, balance (negative for liabilities), available balance / available credit, chevron button → `/transactions?account={id}`.

**Footer**: "Connections are read-only and secured by Plaid. We never store your bank credentials."

**States**: empty state "No accounts linked yet" with **Link your first account**.

---

## Cash & Accounts (CashPage)

Distinct screen at /cash.

**Header**: "Cash & Accounts" + "All linked depository and card accounts".

**KPI grid** (4): **Total Cash**, **Linked Institutions**, **Accounts**, **Needs Attention** (count of non-HEALTHY accounts; only meaningful when accounts expose status).

**Filter bar**: search (account/institution); type dropdown: **All types / Checking / Savings / Credit / Investment**.

**Accounts table** columns: Account, Institution, Type (colored badge), Balance, Available, Status (only if any account has a status — Healthy / Stale / Action required badges).

**Recent activity** card: up to 12 transaction rows (icon by category/sign, description, category badge, signed amount, date, **edit-category** pencil → inline category `<select>` from Groceries/Dining/Housing/Income/Utilities/Transportation; calls categorize API).

**States**: dismissible inline error banner; empty states ("No accounts linked yet", "No accounts match your filters.", "No recent activity.").

---

## Transactions (TransactionsPage)

**Header**: title; subtitle shows selected-account name + "activity" or "All activity across your linked accounts"; actions: Last-refreshed, **Export** (CSV of current filtered view).

**Card chip row** (when user holds cards): "All accounts" + one chip per card (name, balance, tx-count badge); selectable.

**Selected-account context banner** (when a card/account is selected): icon, name, official name + subtype, Current balance / Balance, Available credit / Available, **Clear** button.

**KPI grid** (3): **Money In**, **Money Out**, **Net** ("{N} transactions" delta).

**Filter bar (row 1)**: search (description/category); Account/card dropdown (grouped: Cards / Bank accounts / Other); Category dropdown (All categories + dynamic); direction segmented: **All / Income / Spending**.

**Filter bar (row 2)**: Date range dropdown (**All time, Last 1 day, 1 week, 1 month, 3 months, 1 year, Custom range…** — Custom reveals From→To date inputs); Min $ / Max $ amount inputs; **Clear** (when filters active).

**Table** (sortable headers with direction indicators): Description, Account (clickable badge to filter, shown only when txns are account-tagged and "All accounts" selected), Category badge, Date, Amount (right-aligned, signed). Deep-linkable via `?account=` URL param.

**States**: empty ("No transactions yet" / "No transactions match your filters" / per-account variant).

---

## Budget (PlanPage — `budget` tab)

Built on the customizable 50/30/20 method (Needs / Wants / Savings).

**Header**: "Budget"; subtitle = days left / "complete" (month mode) or aggregated note (YTD/12mo); actions: Last-refreshed, **period segmented (Month / YTD / 12 mo)**, **month navigator** (◀ {Month Year} ▶, single-month only), **Export CSV**, **Save budget** (disabled when not dirty / in aggregate).

**Aggregate notice** (YTD/12mo): read-only roll-up banner; "Switch to Month to edit."

**Budgeting-rule method card**: title "{X/Y/Z} Method" ("default" tag on 50/30/20); **Customize rule** toggle revealing: preset buttons (`50/30/20 · Balanced (classic)`, `50/20/30 · Aggressive saver`, `50/40/10 · Lifestyle-first`, `60/20/20 · Higher cost of living`, `70/20/10 · Tight budget`, `40/20/40 · FIRE / wealth-build`), three % inputs (Needs/Wants/Savings) with live total validation ("must equal 100%"), **Save rule**; **Monthly take-home** income input; **Apply template** (builds budget from income). Three group tiles (Needs/Wants/Savings) with badge, "target {amount}", actual value, progress bar (red when over), "{pct}% of target".

**Summary cards** (3): **Spending vs Budget** (circular % gauge "used", Spent/Remaining/Budget), **Planned Spend** ("for {period}"), **Projected End** ("{pct}% of budget at current pace").

**Category breakdown table**: filter segmented **All / Needs / Wants / Savings**; **Add category** (inline form with category datalist + amount). Columns: Category (icon), Group badge, Budget (editable input in month mode), Spent, Remaining (red if over), **Pace** (progress bar + %), remove (trash). Over-budget rows tinted red. "Unsaved changes" warning + Save.

**States**: empty state "No budget yet for {Month}" with **Apply {rule} template** / **Add category**; dismissible inline notice banner.

---

## Debt Lab (PlanPage — `debt` tab)

Titled "Debt Payoff Lab" — "Compare strategies and build your plan".

**KPI grid** (4): **Total Debt** ("{N} accounts"), **Weighted Avg APR**, **Min Payments / mo**, **Highest APR** (with debt name).

**Recommended-plan callout** (when scenarios run): "Recommended: {STRATEGY} — debt-free by {date}, saving the most interest…" + **Use this plan** button.

**Your debts card**: **Add debt** (inline form: name, balance, APR %, min payment). Table: Debt name, Balance, APR (color by tier: >15% red, >8% amber, else green), Min payment + Total row. Empty: "No debts tracked."
- **Extra monthly payment** input + **Compare strategies** button ("Running…").

**Strategy comparison** (3 cards: Avalanche / Snowball / Hybrid), each with:
- Strategy explainer — icon + tagline + blurb:
  - **Avalanche**: "Highest interest rate first" — "Mathematically cheapest — pays the least total interest."
  - **Snowball**: "Smallest balance first" — "Quick wins build momentum and motivation."
  - **Hybrid**: "Balanced approach" — "Clears small balances among your highest-rate debts."
- Winner badges: **Cheapest** (gold, lowest total interest) and **Fastest** (forest, soonest debt-free).
- **Total interest** value + relative **cost bar** (vs costliest), "Saves {amount} vs the costliest option" / "Most expensive of the three".
- Row of **Time** ({yr/mo}), **Debt-free** (date), **Liquidity** (Low/Medium/High).
- **Set as plan** / **Current plan** button; current plan highlighted.
- "All three strategies give the same result…" note when equal; "Assumes on-time payments and no new debt." footer.

**States**: empty comparison state ("Compare your payoff strategies" → hit Compare strategies).

---

## Pay Bills (BillPayPage)

Multi-step wizard (5 steps): **Payee → Amount → Funding → Review → Done**, with a visual stepper.

**Header**: "Pay a Bill" + "Move money to a card or biller — securely"; **Cancel** (→ home) until done.

**Step 0 — Payee**: segmented **Pay a credit card / Pay a biller**.
- Card path: selectable card cards (name ····last4, balance, % utilization, check when selected); empty: "No credit cards linked yet."
- Biller path: Payee name input + Payee type select (Utility / Loan / Mortgage / Person / Other).
- **Continue** (gated).

**Step 1 — Amount**: when paying a card, quick chips **Minimum {amt}** and **Statement balance {amt}**; $ amount input. Back / Continue.

**Step 2 — Funding**: selectable funding-account cards (name ····last4, "Available {amt}", "not enough to cover…" warning, check when selected); insufficient-funds red notice; empty: "No checking or savings account linked…". Back / Review.

**Step 3 — Review & schedule**: review list (Paying / Amount / Fund from); **When?** segmented **Pay now / Schedule** (date picker when scheduling); **Memo** input; **authorization checkbox** ("I authorize this payment and agree to the Terms of Service…"). Sidebar **Payment summary**: Paying, Amount, Payment fee $0.00, Total, Settlement / Scheduled-for; **Confirm & Pay** / **Schedule Payment** (gated, "Processing…"); Back; "256-bit encrypted · idempotency-protected".

**Step 4 — Done**: success check, "Payment scheduled!/submitted!", description, **Confirmation number**, **Make another payment** / **Back to Home**.

**Recent payments** (steps 0–3): table — Payee, Amount, **Status** badge (Completed/Scheduled/Processing/Pending/Failed/Canceled), Date, Confirmation, **Cancel** (Scheduled/Pending only). Empty: "No payments yet."

---

## Investments (InvestPage)

**Header**: "Invest" + "Holdings, linked brokers, alternatives, and the TerraVest marketplace"; Last-refreshed; **Export CSV** (holdings).

**Sub-tabs (segmented)**: **Stocks & ETFs / Brokers / Alternatives / Marketplace**.

### Tab 1 — Stocks & ETFs
- KPI grid (4): **Total Invested**, **Day Change** (value + % today, from real holdings), **Holdings** (count), **Allocations** ("Diversified").
- **Allocation** card: US Equity 58%, International 22%, Bonds 12%, Cash 8% (progress bars). *(static allocation model)*
- **Portfolio Snapshot** card: Total Invested, Day Change, Positions, Cash.
- **Portfolio holdings** table: broker filter dropdown (when holdings carry broker), "{N} positions" badge; columns Symbol, Name, Broker, Qty, Price, Mkt Value, Day Chg (signed %), Trend sparkline. Empty: "No holdings yet. Link a broker to sync your positions." / "No holdings for this broker."

### Tab 2 — Brokers
- KPI grid (2): **Brokers Linked**, **Total Brokerage Value**.
- **Available brokers** (config-driven from `BROKERS`; "{N} supported"): grid of broker tiles (icon, name, **OAuth / Credentials** badge, **Connect**). Inline connect panel (dynamic per broker): OAuth path = simulated "Continue to {broker}" + "Demo mode — no real redirect"; Credentials path = per-field inputs (with password show/hide), required-field validation, "Connect securely", "256-bit encrypted · read-only · credentials never stored". Credentials are never stored.
- **Connected brokers** ("{N} linked"): cards with name, account-type badge, "Connected", account value, "Last synced {time}", **Sync** + **disconnect (trash)**. Empty: "No brokers connected yet."

### Tab 3 — Alternatives
- KPI grid (3): **Total Alt Value**, **Holdings**, **Categories**.
- **Add/edit form** (Type select: LLC / Land / Apartments / Syndication / Private Equity / Crypto / Collectibles / Other; Name; Value; Ownership %; Notes).
- **Breakdown by type** stat tiles (value, count, % share).
- Holdings table: Type (icon), Name, Value, Ownership, Notes, **edit / delete** actions. Empty: "No alternative investments yet…".

### Tab 4 — Marketplace
- Honest empty state: "No live offerings yet" — "Curated alternative-investment deals will appear here once a marketplace provider is connected."

---

## My Business (MyBusinessPage)

**Header**: "My Business"; subtitle shows connected company name or selected business; status badges (Connected / Not connected / entity type / "Synced {date}"); Last-refreshed + **Sync** (when connected).

**Businesses switcher card**: **Add business** toggle (inline form: Business name*, Industry, Entity type [LLC / S-Corp / C-Corp / Sole Prop / Partnership], EIN optional); segmented switcher across businesses; selected-business meta row (industry · entity · EIN · added date) + delete (when >1).

**QuickBooks connect prompt** (when not connected): "Connect QuickBooks" → **Connect** ("Connecting…").

**Error card** with **Retry**; **Loading state** ("Loading business data…"); empty state "No business yet" → **Add a business**.

**KPI grid** (5): **Revenue (MTD)** (+ "% vs last month" when connected, else "Connect to track changes"), **Expenses (MTD)**, **Net Profit (MTD)**, **Cash Balance**, **Outstanding Invoices**.

**Manual-figures hint** (when not connected): "Showing manual figures — Connect QuickBooks for live numbers…".

**Revenue trend** card: "Last 6 months" inline SVG bar chart (zeroed/honest when no real series).

**Accounts** card: **Add** (inline form: Account name*, Institution, Type [Checking/Savings/Credit Card/Loan], Balance); table Account, Type badge, Balance + Total; delete per row. Empty: "No accounts yet."

**Activity** card: combined feed of invoices / expenses / account-added (icon, title, sub, signed amount, date), newest 12. Empty: "No recent activity yet."

**Invoices** table: Customer, Amount, **Status** badge (Paid/Overdue/Open), Due date. Empty: "No invoices yet."

**Expenses** table: Vendor, Category badge, Date, Amount (negative). Empty: "No expenses yet."

---

## AI Assistant (AIAssistantPage)

**Header**: "AI Assistant" + "Personalized insights and a chat that knows your finances"; Last-refreshed + **Refresh insights**.

**Portfolio scope card**: **Select all / Clear** toggle; explainer; multi-select scope buttons (toggle): **Net worth, Cash & accounts, Investments, Real estate, Business, Debt, Budget, Transactions** (sent as focus directive).

**Insights card**: per-insight row with severity icon + badge (**Info / Warning / Actionable**), title, reason, "Suggested: …" box with **Discuss** button (sends the insight into chat). Loading / empty / error states.

**Chat ("Ask the Assistant") card**:
- Response **style** segmented: **Concise / Balanced / Detailed** (persisted).
- **Export conversation** (markdown download) + **New chat** (clears).
- Empty state: prompt library grouped by capability — **Spending, Debt, Saving, Investing, Credit, Planning** — each with starter prompts as buttons.
- Message bubbles (user vs assistant; assistant renders lightweight markdown bold/italic/bullets). Assistant action row: timestamp, **Copy**, **thumb up / thumb down** feedback, **Regenerate** (last message). "Thinking…" indicator while sending.
- **Adaptive follow-up suggestions** (derived from selected scopes).
- "Considering: {scopes} · {style} answers" hint line.
- Input: textarea ("Enter to send, Shift+Enter for new line"), **voice mic** button (when speech recognition supported), **Send**.
- **Disclaimer** banner (DB/CMS-driven): "AI guidance notice — Not financial advice."

**States**: insights error, chat error inline.

---

## Calculators (CalculatorsPage)

**Header**: "Calculators" + "Model interest, growth, and what an extra mortgage payment really saves you."

**Tabs (buttons)**: **Mortgage payoff / Compound interest / Simple interest**.

- **Mortgage payoff**: optional "Use a linked property" select (prefills balance from real mortgaged properties); inputs Balance owed, Interest rate (APR), Monthly payment (P&I), Extra each month. Results: Payoff (current), Payoff (with extra), Time saved, Interest saved; summary sentence; total-interest comparison. Infeasible state: "That monthly payment doesn't cover the interest…".
- **Compound interest**: inputs Initial amount, Annual return %, Years, Monthly contribution, Compounding (Monthly/Quarterly/Annually). Results: Future value, You contribute, Interest earned + year-by-year balance table.
- **Simple interest**: inputs Principal, Annual rate %, Years. Results: Interest earned, Total value + formula note.

---

## Goals (GoalsPage)

**Header**: "Goals" + "Set targets and see exactly what to save each month to hit them."; **New goal**.

**KPI grid** (when goals exist): **Goals** (count), **Saved so far**, **Total target**.

**New goal form**: Name, Type (**Savings / Net worth / Debt payoff / Custom**), Target amount, Already saved, Target date.

**Goal cards** (grid): type icon, name, "{type} · by {Mon Year}", delete; current/target amounts + **progress bar**; "Save {amt}/mo for {duration}" (required monthly contribution from calculator util) or "{amt} to go"; **+$100 / +$500** quick-add buttons; "Goal reached" green badge when done.

**States**: error card; loading; empty "No goals yet…".

---

## Properties (RealEstatePage)

**Header**: "Properties" + "Your real estate portfolio"; Last-refreshed; **Add property** toggle.

**Add-property form**: address with **AddressAutocomplete** + **Auto-fill** (estimate value & details from address); Type (Primary residence / Rental property / Land); Purchase price; Current value ("auto if blank") with inline valuation **Disclaimer**; Mortgage balance; Beds / Baths / Sq ft / Year built / Est. monthly rent; **Save property** (estimates missing fields from address). "Only the address is required."

**KPI grid** (3): **Total Value**, **Total Equity**, **Total Mortgage** (each with 30d delta + %).

**Property cards**: 🏡 icon, address, "Purchased: {date}", type badge (Primary green / else gold), appreciation-vs-purchase badge; **Revalue** ("Revaluing…") + **delete**; stat row Current Value / Equity / Mortgage; detail row beds/baths/sqft/built; **rental analysis** box for rentals (Est. rent/mo + **Cap rate**).

**States**: error banner; dismissible success notice; loading; empty "No properties added yet" → **Add your first property**.

---

## Deal Room (DealRoomPage)

**Header**: "Deal Room" + "Register deals, browse the marketplace, and connect with interested investors"; **Register a deal** (on My Deals / Marketplace).

**Tabs (list views)**: **My Deals / Marketplace / Saved / My Interests / Track Record**. Plus sub-views: deal **detail**, owner **leads**, owner **documents**.

**Create/edit deal form**: Title*; Category (Real Estate / Business / Private Equity / Startup / Other); Subcategory (taxonomy per category, e.g. Multifamily, Single Family, Townhomes, Construction, Land, Commercial, Mixed Use; Acquisition/Franchise/…; Buyout/Growth/Venture; Pre-Seed/Seed/Series A/…); Status (Draft/Open/Closed/Funded, "Set to Open to list it"); Location; Website link. **Returns** section: Return type (Fixed (annual %)/Equity (IRR)/Hybrid), Distribution frequency (Monthly/Quarterly/Annual/At Exit), Annual return min/max %, Target IRR %. **Deal economics**: Target raise $, Minimum investment $, Hold period months. Description.

**My Deals** cards: title + status badge, category/subcategory/return tags, location, metrics (Target raise, Min investment, Target IRR, Hold period); **Interested investors (N)**, **Documents**, **Edit**, **delete**. Empty: "No deals yet."

**Marketplace**: filter bar (Category, Subcategory, Return type, Sort: Newest/Highest return/Lowest minimum/Largest raise, Clear); deal cards → **View details**. Empty: "No matching deals."

**Saved** (watchlist): deal cards → details. Empty: "No saved deals."

**My Interests** (investor): list of deals you expressed interest in (title, submitted date, deal status, your message, sponsor's lead status badge: New/Contacted/Committed/Passed). Empty: "No interests yet."

**Track Record** (sponsor): explainer + **Add a project** (Project name*, Location, Year, Outcome, Project link, Description); project cards (name·year, outcome badge, location, description, link, Edit/Remove). Empty: "No track record yet."

**Deal Detail**: Back to marketplace; **Save deal / Saved** (watchlist toggle); title + status/category/subcategory badges; location; **Visit project website**; Overview; **Key terms** grid (Asset type, Returns, Distributions, Hold period, Target raise, Minimum investment); **interest-committed progress bar** ("{committed} of {target} · {pct}%", "Indicative interest, not binding"); **Documents** list (external links + doc-type badge); **Sponsor track record** list. Right **Express interest** panel: "I'm interested" → form (Full name*, Email*, Phone, Amount you'd consider, Message) + **accredited-investor confirmation checkbox**; **Send interest** → "Interest sent" confirmation.

**Owner Leads view**: per-lead cards (name, status badge + **status select** [New/Contacted/Committed/Passed], email/phone mailto/tel links, commitment amount, "Accredited" badge, date, message). Empty: "No one has expressed interest yet. Set the deal to Open…".

**Owner Documents manager**: add-document form (Label*, URL*, Type [PPM/Financials/Operating Agreement/Subscription/Other]); document list with external link + type badge + remove. Empty: "No documents yet."

**States throughout**: positive/negative banners; loading text per tab; `window.confirm` on deletes.

---

## Fractional LLC (FractionalLLCPage)

> Marked **"Example offerings — not live"**; holdings & offerings are empty arrays (real data populates from a fractional-investing provider once connected). Mockups should show honest empty states.

**Header**: "Fractional LLC" + demo badge + "Co-invest in land & property through fractional ownership"; **How it works** toggle; **Browse deals** (→ Marketplace tab).

**How-it-works panel**: 4-step explainer (Pick a deal / Buy fractional shares / Earn passively / Exit when eligible) + "Illustrative only — not investment advice."

**KPI grid** (4): **Total Invested**, **Current Value**, **Total Return** ("+x% all-time"), **Active Holdings**.

**Tabs**: **My Holdings / Marketplace**.
- *Holdings*: per-holding property cards (name, address, return badge, Invested / Current Value / Return, shares owned + ownership % progress bar). Empty: "You don't own any fractional LLC positions yet."
- *Marketplace*: offering cards (name, address, risk badge, target-return badge, Minimum / Total Raise, raised + % funded progress, **Invest** button → "Investment request submitted"). Empty: "No open offerings right now…".

---

## Security (SecurityPage)

**Header**: "Security" + "Protect your account and review activity"; security-score badge (Weak/Good/Excellent).

**KPI grid**: **Security score** (label + "{N} of {total} protections enabled" + help), **Two-factor** (On/Off), **Login alerts** (On/Off).

**Two-factor authentication card**: toggle (Enabled/Disabled badge); when on, mocked authenticator setup (QR + 6-digit code; "Setup is mocked for this demo").

**Password card**: Current / New / Confirm password inputs; success/error message; **Update password** (local-only validation).

**Active sessions card**: "{N} active"; table Device, Location, Last active, **Revoke** ("This device" can't be revoked). Empty: "No other active sessions." *(sessions start empty)*

**Login history card**: **real** data from audit-service (`/api/v1/audit/me`) — rows with login/auth icon, action label, timestamp + IP, **SUCCESS/FAILURE** badge. Empty: "No login history to show yet."

---

## Messages (MessagesPage)

**Header**: "Messages" + "Notifications, alerts, and updates"; "{N} unread" badge; **Refresh**, **Send test** (real test notification), **Mark all read**.

**Filter bar**: search; segmented **All / Unread / Read**.

**Master–detail layout**:
- **Inbox** list (fixed width, own scroll): "{N}" badge; rows with type icon (Budget/Payment/Account/System), title (bold when unread), body preview, relative time, unread dot. Selecting marks read.
- **Reading pane** (sticky): type icon + title + full timestamp; **Mark as read / Mark as unread**; type badge; Read/Unread + channel badges; body. Empty: "Select a message."

**States**: error badge; loading; inbox empty ("Your inbox is empty" / "No messages match").

---

## Settings (SettingsPage)

**Header**: "Settings" + "Manage your preferences, notifications, and data".

**Notifications card** (backend-backed toggles, optimistic with revert): Email notifications, Push notifications, Weekly summary, Budget alerts, Payment alerts. Loading + error states.

**Appearance card** (local): **Compact mode** toggle, **Dark mode** toggle (synced with shared theme), **Display currency** select (USD/EUR/GBP).

**Regional card** (local): **Language** (English/Español/Français/Deutsch), **Timezone** (ET/CT/MT/PT/London/CET).

**Data & Privacy card**: **Export my data** (downloads real JSON across services; "Preparing…" → "Your data file has been downloaded."), **Download statements** (generates a monthly statement .txt), **Delete account** (confirm flow → "Confirm" calls delete API, clears session, reloads; error message on failure).

---

## Profile (ProfilePage)

**Header**: "Profile" + "Manage your account, security, and preferences".

**Profile header card**: avatar (email initials), email, "{N} linked accounts", **Member** badge.

**Personal details card** (from `GET /api/v1/auth/me`): first/last name, email (**Verified/Unverified** badge), phone (**Verified** badge), **date of birth**, full **address** (line1/line2/city/state/postal/country), account type (+ business name), **identity-verified** badge, **MFA channel** (Email/SMS). **SSN/EIN shown masked** (`•••-••-••••`) with a **Show/Hide eye toggle** that reveals only the last-4 (`•••-••-6789`) — the full value is never available. **Edit profile** mode PUTs editable fields (name, phone, DOB, address, MFA channel) via `PUT /api/v1/auth/me`; success/error message.

**Account card**: Email, Linked accounts (count badge), **Plan tier** ("TerraVest Premium" gold/crown badge).

**Preferences card** (notification toggles — same backend-backed set as Settings: Email, Push, Weekly summary, Budget alerts, Payment alerts; + local-only **Dark mode**). Error message on save failure.

**Security card**: Two-factor ("Not enabled" badge + **Enable** → /security), Password (**Change** → /security), Active sessions (**Manage** → /security).

**Administration card** (only for care agents/admins): Operator analytics → **Open dashboard** (→ /admin).

**Sign out** button.

---

## Admin · Analytics (AdminDashboardPage)

**Role-gated**: non-admins see "This dashboard is for administrators and customer-care agents only." (lock empty state).

**Header**: "Admin · Analytics" + "Operational KPIs from the audit event stream."; window select **Last 7 / 30 / 90 days**.

**KPI grid** (4): **Total events** ("last Nd"), **Active users**, **Error rate** (% — bad/good tone, "{N} failures"), **Logins** ("{N} failed · {N} signups").

**Daily activity** card: inline bar **sparkline** of daily volume.

**Top actions** / **By service** cards: ranked lists with count badges.

**Recent failures** card: rows (action, timestamp + user, outcome/status red badge). Empty: "No failures in this window."

**States**: error card; loading.

---

## Customer Care (CustomerCarePage)

**Header**: "Customer Care" + "Look up a member and review their profile, activity, and any issues".

**Left panel**: search form (by email/name) + **Search**; user list rows (icon, name/email, role badges except USER, chevron). Loads recent users on open. Empty: "No users found."

**Right panel (member 360)**:
- Empty prompt "Select a member"; loading state.
- **Profile card**: name, email · ID, role badges; KPI grid: **Account type** (+ business name), **Phone** (Verified/Unverified badge), **Identity** (SSN ••last4 / EIN ••last4, Verified/Unverified), **Member since** + "{N} issues".
- **Activity / Issues** card: segmented **Issues encountered (N) / Recent activity (N)**; table When / Action / Service / Status badge / IP. Empty states ("No issues encountered." / "No recorded activity.").

**States**: error card.

---

## Shared component notes

- **NetWorthChart**: presentational SVG chart supporting **area / line / bar** types; gridlines + right-edge value labels; animated line draw; hover crosshair + HTML tooltip; in-chart overlay (Current/Selected net worth + 30d change); **danger palette + "Down X% this period" pill** when a downfall alert is active; "Not enough history yet to chart your net worth." when <2 points.
- **PlaidLinkButton**: real Plaid Link integration (`usePlaidLink`); fetches link token, exchanges public token; error banner incl. a dev hint to start the backend.
- **Disclaimer**: DB/CMS-driven disclaimers (variants: warning, inline) used on AI Assistant and the Real Estate valuation field; renders fallback title/body when CMS is unavailable.
- **LastRefreshed**: "Updated …" indicator with an onRefresh action, reused across most screens.

---

## Coverage summary

**24 screens documented** (all requested screens covered): Home/Dashboard, Accounts, Cash, Transactions, Budget (PlanPage tab), Debt Lab (PlanPage tab), Pay Bills, Investments, My Business, AI Assistant, Calculators, Goals, Properties, Deal Room, Fractional LLC, Security, Messages, Settings, Profile, Admin · Analytics, Customer Care, Sign in / Sign up — plus shared chart/Plaid/disclaimer component notes.

**Largest / most feature-rich screens** (read in full): **Deal Room** (~56 KB; deepest — 5 tabs + 3 sub-views, deal form, leads, docs, track record, investor interest), **PlanPage** (~49 KB; powers both Budget and the rich Debt Lab), **InvestPage** (~43 KB; 4 tabs incl. config-driven broker connect), **MyBusinessPage** (~42 KB; multi-business + QuickBooks + invoices/expenses/activity), **HomePage** (~28 KB; 6 KPIs, multi-type net-worth chart with custom ranges + downfall alert), **AuthPage** (~27 KB; individual/business signup with SMS OTP, SSN/EIN), **TransactionsPage** (~26 KB; deep filtering, sorting, card chips), **AIAssistantPage** (~24 KB; scoped chat + insights). Notable honest-empty/demo areas to reflect in mockups: Investments Marketplace, Fractional LLC ("Example offerings — not live"), broker OAuth ("Demo mode"), 2FA setup ("mocked"), and Security active sessions (start empty).
