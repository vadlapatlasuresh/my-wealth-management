# Delivery waves, timeline, and dependencies

Product roadmap for the full finance platform. **Current codebase completes Wave 1–2.**

---

## Status overview

| Wave | Focus | Status | Est. duration |
|------|--------|--------|----------------|
| **Wave 1** | MVP foundation | **Done** | 2–3 weeks |
| **Wave 2** | Auth + persistence | **Done** (SQLite; Postgres optional upgrade) | 3–4 weeks |
| **Wave 3** | Aggregation + budgets | **Done** | 4–5 weeks |
| **Wave 4** | Payments + rewards + debt | Planned | 4–6 weeks |
| **Wave 5** | Investment marketplace | Planned | 5–7 weeks |
| **Wave 6** | AI advisor + production | Planned | 3–5 weeks |

**Total (full v1):** ~21–30 weeks depending on team size and compliance.

A team of **4–6 engineers** can reach a production-leaning beta in **~12–16 weeks** by deferring or narrowing Wave 5 scope.

---

## Wave 1 — MVP foundation (DONE)

### Delivered

- npm monorepo (`apps/api`, `apps/web`)
- Express REST API with finance endpoints
- React + Vite dashboard UI
- Dashboard snapshot, accounts, transactions, insights
- Bill-pay intent API (mock)
- Debt scenario API (deterministic mock)
- Documentation: API samples, roadmap

### Tech stack

- Node.js 20+, npm workspaces
- Express, CORS
- React 18, Vite 5

### How to verify

```bash
npm install && npm run dev:api && npm run dev:web
```

---

## Wave 2 — Auth, persistence, stability (DONE)

### Delivered

- `POST /v1/auth/register`, `POST /v1/auth/login`
- JWT middleware on protected routes
- Prisma + SQLite schema (User, Account, Transaction, AiInsight, PaymentIntent)
- Migrations + seed (`demo@finance.app` / `Demo@1234`)
- Zod validation on auth
- Web login/register screen + token in `localStorage`

### Tech stack additions

- Prisma 5, bcryptjs, jsonwebtoken, Zod

### Optional upgrade (not required for local MVP)

- Switch `datasource` to PostgreSQL for staging/production
- Add Vitest + Supertest for API tests

### How to verify

```bash
cp apps/api/.env.example apps/api/.env
npm run prisma:migrate -w apps/api
npm run db:seed -w apps/api
# Login at http://localhost:5173
```

---

## Wave 3 — Financial aggregation and budget intelligence (DONE)

### Scope implemented in this repo

- Mock aggregation link session and aggregation items (APIs + seed data)
- Transaction categorization API (user override endpoint) and frontend inline edit in Cash page
- Budget model, seed of monthly budget lines, GET/PUT budget endpoints
- Budget UI: Plan page loads budget, shows budget lines with inline edit, save, and overspend alerts
- Internal integrator proxy endpoint to fetch aggregator accounts (`/internal/fetch-aggregator-accounts`) to support integrator Java microservice (mocked call)
- Mocked Real Estate listing endpoints to support the Real Estate wireframe (list + detail)

### How to verify Wave 3 locally

1. Ensure API + web are running (see root README).  
2. Login with seeded demo user: `demo@finance.app` / `Demo@1234`.

3. Budget flow (example):

```bash
# login and capture token
TOKEN=$(curl -s -X POST http://localhost:4000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@finance.app","password":"Demo@1234"}' | jq -r .token)

# fetch the May 2026 budget
curl -s http://localhost:4000/v1/planning/budgets/2026-05 -H "Authorization: Bearer $TOKEN" | jq

# update budget lines
curl -s -X PUT http://localhost:4000/v1/planning/budgets/2026-05 \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"lines":[{"category":"Dining","amount":500},{"category":"Groceries","amount":650}]}' | jq
```

4. Transaction categorization (example):

```bash
# replace <txId> with a transaction id from GET /v1/transactions
curl -s -X PATCH http://localhost:4000/v1/transactions/<txId>/category \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"category":"Groceries"}' | jq
```

5. Aggregation endpoints (mock):

```bash
# create a (mock) link token
curl -s -X POST http://localhost:4000/v1/aggregation/link-sessions -H "Authorization: Bearer $TOKEN" | jq

# list aggregation items
curl -s http://localhost:4000/v1/aggregation/items -H "Authorization: Bearer $TOKEN" | jq
```

---

### Notes and next steps

- Aggregation linking is mocked; integrate an actual provider (Plaid or other) and implement webhooks for real sync.
- Budget calculations use transaction sign heuristics; you may want to refine spend detection and recurring transaction handling.
- The integrator proxy endpoint expects an integrator service (Java or other) if you want to surface raw connected accounts from an external system.

---

## Wave 4 — Payments, rewards, debt optimization (PLANNED)

### Scope

- Real bill pay via ACH/payment processor
- Payment state machine: PENDING → SUBMITTED → SETTLED / FAILED
- Rewards points ledger + rule engine
- User-specific debt planner from real liabilities

### Dependencies

| Dependency | Purpose |
|------------|---------|
| Payment processor / ACH (Stripe Treasury, Dwolla, etc.) | Money movement |
| KYC / AML vendor (as required) | Compliance |
| Double-entry ledger tables | Auditable balances |
| Fraud velocity rules | Risk |

### Estimated timeline

4–6 weeks

---

## Wave 5 — Investment marketplace (PLANNED)

### Scope

- Offering listings (land / LLC structure)
- Investor eligibility + document acknowledgments
- Subscription funding flow
- Cap table + distributions (admin)

### Dependencies

| Dependency | Purpose |
|------------|---------|
| E-sign (DocuSign, etc.) | Legal docs |
| Object storage (S3) | PPM, agreements |
| Securities legal review | Reg compliance |
| Admin portal | Ops workflows |

### Estimated timeline

5–7 weeks (high compliance risk — may run parallel with legal)

---

## Wave 6 — AI advisor and production hardening (PLANNED)

### Scope

- AI orchestration (RAG over user financial snapshot)
- Prompt categories + guardrails + audit log
- Observability (metrics, tracing, alerts)
- CI/CD, security review, load testing

### Dependencies

| Dependency | Purpose |
|------------|---------|
| LLM provider (OpenAI, Anthropic, etc.) | Coach + insights |
| Vector store / feature store (optional) | Retrieval |
| Datadog / Grafana / Sentry | Ops |
| SOC2-oriented controls (as needed) | Enterprise readiness |

### Estimated timeline

3–5 weeks

---

## Cross-cutting dependencies (all waves)

| Area | Requirement |
|------|-------------|
| **Runtime** | Node 20+ LTS |
| **Secrets** | Vault / cloud secret manager for JWT, DB, API keys |
| **Hosting** | API (Railway, Fly, ECS), Web (Vercel, S3+CloudFront) |
| **Database** | SQLite (dev) → PostgreSQL (staging/prod) |
| **Compliance** | Legal review before real payments or securities offerings |
| **Design** | Figma system (see project `docs/` and assets) |

---

## Suggested team composition

| Role | Waves 1–2 | Waves 3–6 |
|------|-----------|-----------|
| Full-stack | 1–2 | 2–3 |
| Backend / platform | 1 | 2 |
| Frontend | 1 | 1 |
| DevOps | 0.25 | 0.5 |
| Product / compliance | 0.25 | 0.5+ |

---

## Repository map (current)

```
finance-mvp/
├── apps/api/     ← Wave 1–2 backend
├── apps/web/     ← Wave 1–2 frontend
└── docs/         ← API mocks, roadmap, seed JSON
```

See [README.md](../README.md) for run instructions.
