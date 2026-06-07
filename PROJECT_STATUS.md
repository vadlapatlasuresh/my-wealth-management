# My Wealth Management — Project Status & Roadmap

_Last updated: 2026-06-06_

This is the master status document. Detailed, actionable breakdowns live in
[`docs/phases/`](docs/phases/). Each phase file lists scope, concrete steps, files to touch,
and acceptance criteria.

---

## 1. Architecture at a glance

**Frontend:** `finance-mvp/apps/web` — React 18 + Vite, React Router, single design system
(`src/styles/terravest-theme.css`). Talks only to the API Gateway (`http://localhost:8080`).

**Backend microservices (Java 17 / Spring Boot 3.2.5):**

| Service | Port | Responsibility | DB (dev) |
|---|---|---|---|
| api-gateway | 8080 | Single entry point, routing, CORS | — |
| auth-service | 8081 | Registration, login, JWT issuance | H2 (in-mem) |
| account-aggregation-service | 8082 | Plaid integration (link, accounts, transactions) | H2 (in-mem) |
| financial-core-service | 8083 | Snapshot/net-worth, budgets, debt scenarios | H2 (in-mem) |
| real-estate-service | 8084 | Properties + valuation (Phase 3) | H2 (in-mem) |
| business-financials-service | 8085 | QuickBooks-style business financials (Phase 4) | H2 (in-mem) |
| ai-insights-service | 8086 | AI insights + chat (Phase 5) | H2 (in-mem) |
| payment-service | 8087 | Bill pay intents (Phase 6) | H2 (in-mem) |
| notification-service | 8088 | Notifications + preferences (Phase 7) | H2 (in-mem) |
| (legacy) Node API | 4000 | Older `/v1/**` mock routes (superseded; being retired) | SQLite |

> Phases 3–7 integrate external systems (valuation / QuickBooks / LLM / Stripe / email-push)
> **behind a provider interface with a working mock implementation** — fully testable locally
> with no external keys. Switching to a real provider is a config + one-class change (per phase doc).

**Full architecture & flow docs:** [`docs/architecture/`](docs/architecture/) — system diagram,
complete API reference, and per-feature flow diagrams (UI → gateway → endpoint).

JWT secret is shared across all services so a gateway-issued token validates everywhere.

**Run locally:**
```bash
cd finance-mvp
npm install                       # web + node deps
npm run build:backend             # builds 4 Java services + prisma generate
npm run start:backend             # starts gateway + 3 services + node api
npm run dev -w apps/web           # starts Vite on :5173
```
Sandbox login: register any email, or use the seeded `test1@example.com` / `Password123!`.
Plaid sandbox: institution → `user_good` / `pass_good` (phone `415-555-0011`, OTP `123456`).

---

## 2. What is DONE (end-to-end, working locally)

### Phase 0 — Foundation & run-fixes ✅
- All 4 Java services build and boot on H2 (no external DB needed for dev).
- Fixed gateway CORS (single `Access-Control-Allow-Origin` via gateway only; downstream CORS disabled).
- Fixed budget endpoints (H2 reserved-word `month`, JPA `orphanRemoval` collection handling).
- Node API: absolute SQLite path, `--env-file=.env` loading, crash-guards, JSON responses,
  String user-id mapping for Plaid-schema compatibility.
- Frontend self-heals on 401/403 (clears stale token → login).

### Phase 1 — Core accounts & money ✅
- **Auth**: register/login via gateway → auth-service, JWT stored client-side.
- **Account Aggregation (Plaid)**: link token create, public-token exchange, accounts &
  transactions fetch. SDK upgraded to `plaid-java 35.0.0` (fixes `identity_match` enum + others).
- **Financial Core**: net-worth snapshot, budgets (GET/PUT), debt scenarios.

### Phase 2.1 — Auth redesign, account profile & UX completion ✅
- **Sign in / Sign up redesigned** into an elegant split-screen (brand panel + form), with a
  segmented Sign in/Create-account switch, show/hide password, and validation.
- **Real account profile:** signup now captures a **name** (persisted in auth-service: `users.name`
  via migration V2; returned on register/login). Name flows to the sidebar, Home greeting, Profile.
- **Placeholder pages replaced with real screens:** Settings, Security, Messages (inbox backed by
  the notification service), and Fractional LLC (co-investment marketplace).
- **Topbar wired:** notifications **bell dropdown** (live from notification-service) with unread dot,
  "View all messages", help → Learn, and search (Enter → Transactions). `/learn` route added.
- Every nav item, button, and screen now resolves to a designed, functional page.

### Phase 2 — UI redesign to design system ✅
- Every screen rewritten to the **TerraVest design system** (`terravest-theme.css`); the old,
  unloaded `styles.css` classes (which rendered as plaintext) are gone from all live pages.
- Redesigned: Accounts (grouped cards + KPIs + info tooltips), Transactions (filterable table),
  Invest, Cash, Profile, Learn, Auth/Login, plus audits of Plan, Bill Pay, Deal Room,
  AI Assistant, My Business, Real Estate.
- Added shared components to the theme: filter bar, segmented control, toggle switch,
  stat tile, card grid, info tooltip, table scroll.
- Design reference (`assets/terravest-redesign.html`) updated with full Accounts & Transactions mockups.

---

### Phase 3 — Real Estate Service ✅
CRUD + valuation (mock provider) at `/api/v1/real-estate`; RealEstatePage live; seeded for userId 1.

### Phase 4 — Business Financials Service ✅
QuickBooks-style dashboard/P&L/invoices/expenses (mock) at `/api/v1/business`; MyBusinessPage live.

### Phase 5 — AI Insights Service ✅
Insights + chat (mock LLM provider) at `/api/v1/ai`; AIAssistantPage live (insights + working chat).

### Phase 6 — Payment Service ✅
Bill pay intents (mock Stripe) at `/api/v1/payments`; BillPayPage live end-to-end.

### Phase 7 — Notification Service ✅
Notifications + preferences (mock email/push) at `/api/v1/notifications`; ProfilePage toggles persist.

## 3. Status overview

| Phase | Theme | Status | Doc |
|---|---|---|---|
| 0–2 | Foundation, core money, UI redesign | ✅ Done | [PHASE_1_2_COMPLETED.md](docs/phases/PHASE_1_2_COMPLETED.md) |
| 3 | Real Estate | ✅ Done (mock provider) | [PHASE_3_REAL_ESTATE.md](docs/phases/PHASE_3_REAL_ESTATE.md) |
| 4 | Business Financials | ✅ Done (mock provider) | [PHASE_4_BUSINESS_FINANCIALS.md](docs/phases/PHASE_4_BUSINESS_FINANCIALS.md) |
| 5 | AI Insights | ✅ Done (mock provider) | [PHASE_5_AI_INSIGHTS.md](docs/phases/PHASE_5_AI_INSIGHTS.md) |
| 6 | Payments / Bill Pay | ✅ Done (mock provider) | [PHASE_6_PAYMENTS.md](docs/phases/PHASE_6_PAYMENTS.md) |
| 7 | Notifications | ✅ Done (mock provider) | [PHASE_7_NOTIFICATIONS.md](docs/phases/PHASE_7_NOTIFICATIONS.md) |
| 8 | Mobile (React Native) | 🟡 Scaffold (`finance-mvp/mobile/`) | [PHASE_8_MOBILE.md](docs/phases/PHASE_8_MOBILE.md) |
| 9 | Production hardening | 🟡 Infra started (compose/CI/env) | [PHASE_9_HARDENING.md](docs/phases/PHASE_9_HARDENING.md) |

**Remaining to be production-real:** swap each mock provider for the real API + keys (Phases 3–7),
finish the mobile app (Phase 8), and complete hardening — Postgres cutover, secret manager,
webhook signature verification, tests, containerize all services, deploy (Phase 9).

---

## 4. Known gaps / tech debt

- **In-memory H2** wipes data on restart (dev only). Postgres wiring exists in `pom.xml`/prod
  profiles but isn't validated — see Phase 9.
- **Legacy Node API** still serves `/v1/**` (real estate, AI, payments) with mock data and a
  SQLite schema whose user IDs differ from the Java services. Each Java service in Phases 3–6
  replaces a slice of it; retire the Node API when empty.
- **No automated tests / CI** beyond a couple of unit tests. See Phase 9.
- **Secrets in `application.properties`** (Plaid keys, JWT secret) — move to env/secret manager.
- Some pages use **mock data** (Invest holdings, Learn modules, Deal Room) pending their services.

---

## 5. How to pick up the next phase

Open the relevant `docs/phases/PHASE_X_*.md`, which contains: goal, backend steps (service
scaffold, entities, endpoints), frontend steps (page wiring), env/keys needed, and acceptance
criteria. Implement backend → wire one screen → verify end-to-end → check the boxes → update
this file's status table.
