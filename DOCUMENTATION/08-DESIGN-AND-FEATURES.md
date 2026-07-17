# 8. Design System and Features

This consolidates the visual design language and a per-feature description. The exhaustive,
per-screen "source of truth" (every section, tab, control, data field, and state) is
[`docs/SCREEN_FEATURE_INVENTORY.md`](../docs/SCREEN_FEATURE_INVENTORY.md). How designs stay in
sync across web/iOS/Android is [`docs/DESIGN_SYNC.md`](../docs/DESIGN_SYNC.md). The product
vision/roadmap is [`docs/PRODUCT_DESIGN_AND_ROADMAP.md`](../docs/PRODUCT_DESIGN_AND_ROADMAP.md).

---

## 8.1 Design system

**Brand & palette**
- Forest green `#1A4D3B` (primary) + gold `#C9973A` (accent); sage accents.
- Semantic colors: positive / negative / warning.
- The NetWorthChart switches to a **danger palette** on a >15% drop.

**Typography**
- Display: **Fraunces / DM Serif Display**. Body: **DM Sans**. **Tabular numerics** for money.
- Icons: **Tabler**.

**Themes**
- **Light / Dark / Glass**, implemented as CSS variables on `html[data-theme]`.
- Logic in [`apps/web/src/theme.js`](../finance-mvp/apps/web/src/theme.js) (persisted to the
  `tv_theme` localStorage key, switchable from the topbar).

**Components** (all in the single design-system file
[`terravest-theme.css`](../finance-mvp/apps/web/src/styles/terravest-theme.css)):
cards, kpi-grid/kpi-card, stat-tile, list-item, segmented controls, badges, progress bars,
forms, empty-states, filter bar, toggle switch, info tooltip, table-scroll, and the interactive
**NetWorthChart** (Area / Line / Bars, gradient fill, hover, downfall alert).

**Layout**
- Forest **sidebar** (collapsible + mobile drawer) + **topbar** (search, notifications bell,
  help, theme switcher, profile).
- Responsive: ≤900px → drawer; ≤600px → single column.

> ⚠️ Only [`src/styles/terravest-theme.css`](../finance-mvp/apps/web/src/styles/terravest-theme.css)
> is loaded. [`src/styles.css`](../finance-mvp/apps/web/src/styles.css) is **dead code** — never
> edit it.

**Design mockups / references:** the HTML mockups in [`assets/`](../assets/) mirror the app at
full depth (web/iOS/Android) and are kept in sync per `DESIGN_SYNC.md`. The ops portal design is
[`docs/designs/OPS_PORTAL_DESIGN.md`](../docs/designs/OPS_PORTAL_DESIGN.md), with the built
architecture and pending design in [`DOCUMENTATION/proposals/`](proposals/):
- [`ops-portal.md`](proposals/ops-portal.md) — the whole build, phase by phase
- [`ops-access-and-audit.md`](proposals/ops-access-and-audit.md) — the access matrix + audit trail
- [`ops-caller-verification.md`](proposals/ops-caller-verification.md) — **design for review**:
  verifying the person on the phone before disclosing anything, with tiered disclosure
- [`ops-portal-golive-runbook.md`](proposals/ops-portal-golive-runbook.md) — deploy steps

---

## 8.2 Features (per-screen descriptions)

Each screen below has a working page in
[`apps/web/src/pages/`](../finance-mvp/apps/web/src/pages/) and (where applicable) a backend
service. For full depth, see the inventory doc.

| Screen | What it does | Backed by |
|---|---|---|
| **Home** | Net-worth chart (range + Area/Line/Bars + downfall alert + "what moved it" contributors), KPI cards, upcoming bills, an AI insight | financial-core, ai-insights |
| **Accounts** | Grouped account cards + KPIs; Plaid "Link account" flow | account-aggregation |
| **Transactions** | Filterable table (date / amount / category / sort); recategorize | account-aggregation |
| **Plan / Budget** | 50/30/20 presets, period, Needs/Wants/Savings, alerts | financial-core |
| **Debt Lab** | Debts table, extra payment, Avalanche/Snowball/Hybrid explainers, recommended plan, cross-strategy comparison (Cheapest/Fastest) | financial-core |
| **Goals** | Targets, progress, required-monthly | financial-core |
| **Calculators** | Mortgage payoff / extra-payment, compound, simple | (web logic) |
| **Investments (Invest)** | Holdings, brokers connect, Alternatives, Marketplace | account-aggregation |
| **Cash** | Cash position view | account-aggregation / financial-core |
| **Pay Bills** | Multi-step: payee → amount → funding → schedule → confirm (idempotent, cancelable) | payment |
| **Real Estate / Properties** | Auto-estimate value, equity, rental cap-rate; add/revalue properties | real-estate (RentCast) |
| **Deal Room** | Sponsor marketplace: deals, leads, docs, watch, express interest, sponsor track-record | real-estate |
| **Fractional LLC** | Co-investment marketplace | real-estate |
| **My Business** | Multi-business, P&L, cash flow, invoices, expenses, QuickBooks connect | business-financials (QBO) |
| **AI Assistant** | Insights + chat with scope, response styles, prompt library, voice, disclaimer | ai-insights (Anthropic/Gemini) |
| **Learn / Guide** | Educational modules | platform-config / web |
| **Messages** | In-app inbox | notification |
| **Security** | 2FA, sessions, login history (from the audit stream) | auth, audit |
| **Settings** | Notifications, appearance, regional, data & privacy (export/delete) | notification, financial-core |
| **Profile** | Name, contact, identity (SSN/EIN masked); notification preference toggles | auth, notification |
| **Customer Care** | Member 360 (profile + verification + activity + issues) — CARE/ADMIN | auth-service /support |
| **Admin · Analytics** | Role-gated KPI dashboard from the audit/event stream | audit, services |
| **Auth (Sign in / Sign up)** | Split-screen brand + form; Individual/Business; first/last/email/phone; SSN/EIN; SMS+email OTP; MFA | auth |

---

## 8.3 Key product/design documents (deep dives)

| Topic | Document |
|---|---|
| Product vision & roadmap | [`docs/PRODUCT_DESIGN_AND_ROADMAP.md`](../docs/PRODUCT_DESIGN_AND_ROADMAP.md) |
| Screen & feature inventory (source of truth) | [`docs/SCREEN_FEATURE_INVENTORY.md`](../docs/SCREEN_FEATURE_INVENTORY.md) |
| Design sync (web/iOS/Android mockups) | [`docs/DESIGN_SYNC.md`](../docs/DESIGN_SYNC.md) |
| Deal Room | [`docs/DEAL_ROOM.md`](../docs/DEAL_ROOM.md) |
| User walkthrough | [`docs/USER_WALKTHROUGH.md`](../docs/USER_WALKTHROUGH.md) |
| Ops portal design | [`docs/designs/OPS_PORTAL_DESIGN.md`](../docs/designs/OPS_PORTAL_DESIGN.md) |
| Internationalization | [`docs/I18N.md`](../docs/I18N.md) |
| Architecture decision record | [`docs/ARCHITECTURE_DECISION.md`](../docs/ARCHITECTURE_DECISION.md) |
| Financial standards review | [`docs/FINANCIAL_STANDARDS_REVIEW.md`](../docs/FINANCIAL_STANDARDS_REVIEW.md) |
| Per-feature flow diagrams | [`docs/architecture/flows/`](../docs/architecture/flows/) |
| Per-service workflows | [`docs/workflows/components/`](../docs/workflows/components/) |
