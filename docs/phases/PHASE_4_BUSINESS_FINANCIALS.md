# Phase 4 — Business Financials Service (QuickBooks Online) ✅ DONE (mock provider)

## QuickBooks-parity update (2026-07-28)
- Phase 3b reconciliation is now implemented in the backend and web UI for matching bank transactions to open invoices and bills.
- Inventory/COGS and payroll/1099 contractor flows are now implemented end-to-end in the backend and MyBusiness UI, including CRUD, stock adjustments, and basic ledger posting.
- Business-team RBAC is now implemented as a working foundation in the backend and surfaced in the MyBusiness UI with view/manage access rules.

> **Status:** Built and live. `business-financials-service` (:8085) at `/api/v1/business`
> (connection, dashboard, pnl, invoices, expenses, connect, sync); `MyBusinessPage` is wired.
> Data comes from `MockBusinessDataProvider` (deterministic per user). Set the `qbo.*` keys and
> implement the real `BusinessDataProvider` (QuickBooks OAuth2) to go live. Checklist kept for cutover.


**Goal:** Power `MyBusinessPage` with real small-business financials via QuickBooks Online
(OAuth2) — P&L, cash flow, invoices, expenses.

## Backend
- [ ] Scaffold `apps/business-financials-service` (Spring Boot, Java 17), port **8085**.
- [ ] QuickBooks OAuth2: store per-user `realmId`, access/refresh tokens (encrypted).
      Endpoints: `GET /connect` (returns auth URL), `GET /callback` (exchange code), token refresh job.
- [ ] Entities: `QboConnection`, cached `ProfitLoss`, `CashFlow`, `Invoice`, `Expense` snapshots.
- [ ] Endpoints (`/api/v1/business`): `GET /dashboard` (KPIs), `GET /pnl?period=`,
      `GET /cashflow`, `GET /invoices`, `GET /expenses`, `POST /sync`.
- [ ] Gateway route `/api/v1/business/**` → 8085; retire legacy `/v1/my-business/*` mock.
- [ ] Add to build/start scripts.

## Frontend
- [ ] `MyBusinessPage.jsx` (already theme-compliant) → live data; add a "Connect QuickBooks" CTA
      and connection status badge; charts use existing `chart-wrap`/SVG patterns.
- [ ] `api.js`: add `getBusinessDashboard`, `getPnl`, `getCashflow`, `getInvoices`, `syncBusiness`.

## Env / keys
- [ ] `qbo.client-id`, `qbo.client-secret`, `qbo.redirect-uri`, `qbo.environment` (sandbox/prod).

## Acceptance criteria
- [ ] User connects a QBO sandbox company → dashboard shows real P&L/cash KPIs.
- [ ] Token refresh works; disconnect clears tokens; data scoped to JWT user.
