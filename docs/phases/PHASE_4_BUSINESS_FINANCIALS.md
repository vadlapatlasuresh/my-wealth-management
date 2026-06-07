# Phase 4 — Business Financials Service (QuickBooks Online) ✅ DONE (mock provider)

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
