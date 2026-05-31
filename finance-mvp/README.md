# TerraVest

**TerraVest** is a personal finance platform starter: consolidated dashboard, linked accounts, transactions, AI-style insights, bill-pay intents, and debt scenario simulation. Built as an npm monorepo with a React web app and Express API backed by Prisma + SQLite.

**Project location (local):**  
`/Users/suresh/.cursor/projects/empty-window/finance-mvp`

---

## Monorepo structure

```
finance-mvp/
├── apps/
│   ├── api/          # Express REST API, Prisma, JWT auth
│   └── web/          # React + Vite SPA
├── docs/             # API samples, mocks, roadmap
├── package.json      # Workspace root scripts
└── README.md         # This file
```

| Package | Path | Description |
|---------|------|-------------|
| Root | `.` | npm workspaces, shared dev scripts |
| API | `apps/api` | Backend service on port **4000** |
| Web | `apps/web` | Frontend on port **5173** |

---

## Tech stack

### Root / tooling

| Layer | Technology |
|-------|------------|
| Package manager | npm workspaces |
| Runtime | Node.js **20+** recommended |
| Language | JavaScript (ES modules) |

### Backend (`apps/api`)

| Layer | Technology |
|-------|------------|
| Framework | Express 4 |
| Database | SQLite via **Prisma 5** |
| Auth | JWT (`jsonwebtoken`) + **bcryptjs** password hashing |
| Validation | **Zod** (register/login) |
| CORS | `cors` middleware |

### Frontend (`apps/web`)

| Layer | Technology |
|-------|------------|
| UI | **React 18** |
| Build | **Vite 5** |
| Styling | Plain CSS (`src/styles.css`) |
| API client | `fetch` + Bearer token in `localStorage` |

### Documentation

| File | Purpose |
|------|---------|
| `docs/api-sample-responses.md` | Full API reference + sample JSON |
| `docs/mocks/seed-data.json` | Canonical mock/seed dataset |
| `docs/roadmap-waves.md` | Wave 1–6 delivery plan |

---

## Prerequisites

- **Node.js** 20.x or newer
- **npm** 10.x or newer
- No Docker required for local MVP (SQLite file DB)

---

## How to run (first time)

From the project root:

```bash
cd /Users/suresh/.cursor/projects/empty-window/finance-mvp

# 1) Install all workspace dependencies
npm install

# 2) API environment
cp apps/api/.env.example apps/api/.env

# 3) Database: generate client, migrate, seed demo user
npm run prisma:generate -w apps/api
npm run prisma:migrate -w apps/api
npm run db:seed -w apps/api
```

Start services in **two terminals**:

```bash
# Terminal A — API
npm run dev:api

# Terminal B — Web
npm run dev:web
```

| Service | URL |
|---------|-----|
| Web app | http://localhost:5173 |
| API | http://localhost:4000 |
| Health check | http://localhost:4000/health |

### Demo login (after seed)

| Field | Value |
|-------|-------|
| Email | `demo@finance.app` |
| Password | `Demo@1234` |

You can also **Register** a new account from the web UI; new users start with empty data until you add accounts/transactions (or extend seed logic).

---

## Root npm scripts

| Script | Command | Description |
|--------|---------|-------------|
| `dev:api` | `npm run dev -w apps/api` | API with Node `--watch` |
| `dev:web` | `npm run dev -w apps/web` | Vite dev server |
| `dev` | Both (background API + web) | Convenience; prefer two terminals |
| `build` | Build web production bundle | Output: `apps/web/dist` |
| `start:api` | Production API (no watch) | `node src/server.js` |

API-only scripts (run with `-w apps/api`):

| Script | Description |
|--------|-------------|
| `prisma:generate` | Generate Prisma client |
| `prisma:migrate` | Apply migrations (`prisma migrate dev`) |
| `prisma:studio` | Open Prisma Studio GUI |
| `db:seed` | Insert demo user + mock financial data |

---

## Implemented features (current)

### Wave 1 — MVP UI + APIs

- Dashboard snapshot (net worth, cash, investments, card debt, loans)
- Linked accounts table with institution, type, balance, status
- Transaction list
- AI insight cards (seeded rule-style copy)
- Bill-pay **intent** creation + history (mock settlement; no real ACH)
- Debt scenario simulator (AVALANCHE / SNOWBALL / HYBRID)

### Wave 2 — Auth + persistence

- `POST /v1/auth/register`, `POST /v1/auth/login`
- JWT on all `/v1/*` resources except auth and `/health`
- Prisma models: User, Account, Transaction, AiInsight, PaymentIntent
- Seed script with realistic demo portfolio

### Not yet implemented (see `docs/roadmap-waves.md`)

- Plaid / bank aggregation, real payments, rewards, marketplace, production LLM advisor

---

## Authentication flow

1. User registers or logs in → API returns `{ token, user }`.
2. Web stores token in `localStorage` key `finance_token`.
3. Subsequent requests send `Authorization: Bearer <token>`.
4. Logout clears token and resets UI state.

Token expiry: **7 days** (see `apps/api/src/auth.js`).

---

## API overview

Base URL: `http://localhost:4000`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Service health |
| POST | `/v1/auth/register` | No | Create user |
| POST | `/v1/auth/login` | No | Login |
| GET | `/v1/me/snapshot` | Yes | Net worth snapshot |
| GET | `/v1/accounts` | Yes | Accounts (`?type=CHECKING` optional) |
| GET | `/v1/transactions` | Yes | Transactions (`?account_id=` optional) |
| GET | `/v1/ai/insights` | Yes | Insight cards |
| POST | `/v1/payments/bill-pay-intents` | Yes | Create bill-pay intent |
| GET | `/v1/payments/bill-pay-intents` | Yes | List intents |
| GET | `/v1/payments/bill-pay-intents/:id` | Yes | Single intent |
| POST | `/v1/planning/debt-scenarios` | Yes | Run debt simulation |

Full request/response examples: **`docs/api-sample-responses.md`**  
Mock seed dataset: **`docs/mocks/seed-data.json`**

---

## Mock vs real data

| Data | Source | Notes |
|------|--------|-------|
| Accounts, transactions, insights | **Database** (seed or per-user) | Persists across API restarts |
| Investments in snapshot | **Hardcoded** in API | `265930.4` in `server.js` until brokerage integration |
| Loans in snapshot | **Hardcoded** | `18480` |
| Net worth `change_30d` | **Hardcoded** | `4510.12` |
| Debt scenarios | **Deterministic formula** | Not tied to user liabilities yet |
| Bill pay settlement | **Mock** | Status stays `PENDING`; no payment rail |

---

## Environment variables (API)

Copy `apps/api/.env.example` → `apps/api/.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `file:./dev.db` | SQLite path (relative to `prisma/`) |
| `JWT_SECRET` | (required in prod) | Signing secret for tokens |
| `PORT` | `4000` | HTTP port |

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `401 Missing token` | Login again; check `finance_token` in browser devtools |
| Empty dashboard for new user | Expected — run seed or add data via Prisma Studio |
| Prisma client not found | `npm run prisma:generate -w apps/api` |
| CORS errors | API must run on 4000; web on 5173 |
| Port in use | Change `PORT` in `.env` and `API_BASE` in `apps/web/src/api.js` |

---

## Further reading

- [API app README](apps/api/README.md) — server layout, Prisma, scripts
- [Web app README](apps/web/README.md) — UI pages, API client, build
- [Docs index](docs/README.md) — mocks and roadmap
- [Delivery waves](docs/roadmap-waves.md) — timeline and dependencies

---

## License

Private MVP scaffold — add license before open-sourcing.
