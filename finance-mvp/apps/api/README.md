# Finance MVP — API

Express REST API for the finance platform. Handles authentication, user-scoped financial data, mock bill-pay intents, and deterministic debt scenarios.

**Default URL:** http://localhost:4000

---

## Tech stack

| Component | Package / tool |
|-----------|----------------|
| HTTP server | Express 4 |
| ORM | Prisma 5 |
| Database | SQLite (`apps/api/prisma/dev.db`) |
| Password hashing | bcryptjs (10 rounds) |
| JWT | jsonwebtoken (7-day expiry) |
| Request validation | Zod (auth routes) |
| CORS | Enabled for local web dev |

---

## Project layout

```
apps/api/
├── prisma/
│   ├── schema.prisma      # Data models
│   ├── migrations/        # SQL migrations
│   └── dev.db             # SQLite file (created after migrate)
├── src/
│   ├── server.js          # Routes + HTTP server
│   ├── db.js              # PrismaClient singleton
│   ├── auth.js            # hash, compare, sign, authMiddleware
│   └── seed.js            # Demo user + mock accounts/tx/insights
├── .env.example
├── package.json
└── README.md
```

---

## How to run

From **monorepo root**:

```bash
cp apps/api/.env.example apps/api/.env
npm run prisma:generate -w apps/api
npm run prisma:migrate -w apps/api
npm run db:seed -w apps/api
npm run dev:api
```

From **this directory** (`apps/api`):

```bash
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run db:seed
npm run dev
```

Production-style (no file watch):

```bash
npm run start
```

---

## npm scripts

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `node --watch src/server.js` | Hot reload on file changes |
| `start` | `node src/server.js` | Single run |
| `prisma:generate` | `prisma generate` | Regenerate client after schema changes |
| `prisma:migrate` | `prisma migrate dev` | Create/apply migrations |
| `prisma:studio` | `prisma studio` | DB browser at http://localhost:5555 |
| `db:seed` | `node src/seed.js` | Idempotent demo seed |

---

## Environment variables

| Name | Example | Required |
|------|---------|----------|
| `DATABASE_URL` | `file:./dev.db` | Yes |
| `JWT_SECRET` | long random string | Yes (prod) |
| `PORT` | `4000` | No (default 4000) |

`DATABASE_URL` is resolved relative to the `prisma/` folder.

---

## Database models

| Model | Purpose |
|-------|---------|
| `User` | email, passwordHash |
| `Account` | institution, name, type, balance, status, optional credit fields |
| `Transaction` | per-account movements |
| `AiInsight` | severity, title, reason, suggestedAction |
| `PaymentIntent` | bill-pay mock records |

**Account types** used in app: `CHECKING`, `SAVINGS`, `CREDIT_CARD`.

**Account status** values in seed: `HEALTHY` (extend to `STALE`, `ACTION_REQUIRED` later).

---

## API endpoints

### Public

#### `GET /health`

```json
{ "ok": true, "service": "finance-mvp-api" }
```

#### `POST /v1/auth/register`

Body:

```json
{ "email": "user@example.com", "password": "minimum8chars" }
```

- Password min length: **8**
- Email must be valid (Zod)
- `409 CONFLICT` if email exists

Response `201`:

```json
{
  "token": "<jwt>",
  "user": { "id": "cuid...", "email": "user@example.com" }
}
```

#### `POST /v1/auth/login`

Same body as register. `401` on bad credentials.

---

### Protected (header: `Authorization: Bearer <token>`)

#### `GET /v1/me/snapshot`

Computes from user's accounts plus **mock constants**:

- `investments`: fixed `265930.4`
- `loans`: fixed `18480`
- `net_worth.total` = cash + investments − credit_cards − loans

#### `GET /v1/accounts`

Query: `?type=CHECKING` | `SAVINGS` | `CREDIT_CARD` (optional)

Returns Prisma `Account` rows (camelCase fields: `userId`, `lastSynced`, etc.).

#### `GET /v1/transactions`

Query: `?account_id=<cuid>` (optional)

#### `GET /v1/ai/insights`

Returns `{ insights: [...] }` with DB field `suggestedAction` (camelCase in JSON).

#### `POST /v1/payments/bill-pay-intents`

Body:

```json
{
  "card_account_id": "<account cuid>",
  "funding_account_id": "<account cuid>",
  "amount": 250,
  "currency": "USD"
}
```

Creates intent with `status: "PENDING"` and `estimated_settlement_at` ≈ +2 days.

Response uses snake_case aliases: `intent_id`, `created_at`, etc.

#### `GET /v1/payments/bill-pay-intents`

#### `GET /v1/payments/bill-pay-intents/:intentId`

#### `POST /v1/planning/debt-scenarios`

Body:

```json
{
  "strategy": "AVALANCHE",
  "extra_payment_monthly": 300
}
```

`strategy`: `AVALANCHE` | `SNOWBALL` | `HYBRID`

Mock formula adjusts months and interest from base tables in `server.js` (not user-specific debt yet).

---

## Error format

```json
{
  "error_code": "VALIDATION_ERROR",
  "message": "Human-readable message"
}
```

| Code | HTTP | When |
|------|------|------|
| `VALIDATION_ERROR` | 400 | Bad auth payload or bill-pay body |
| `UNAUTHORIZED` | 401 | Missing/invalid JWT or bad login |
| `CONFLICT` | 409 | Duplicate email on register |
| `NOT_FOUND` | 404 | Payment intent not found |
| `INTERNAL_ERROR` | 500 | Unhandled exception |

---

## Seed / mock data

`npm run db:seed` creates:

| Entity | Count | Notes |
|--------|-------|-------|
| User | 1 | `demo@finance.app` / `Demo@1234` |
| Accounts | 3 | Chase checking, SoFi savings, Amex card |
| Transactions | 3 | Payroll, rent, groceries |
| AI insights | 2 | actionable + warning |

Canonical JSON snapshot: `../../docs/mocks/seed-data.json`

Re-running seed prints `Seed already exists.` and does not duplicate.

---

## Extending the API

Suggested next steps (Wave 3+):

1. Add `Budget` and `Category` models.
2. Replace hardcoded snapshot fields with computed portfolio service.
3. Webhook route for aggregation provider (Plaid).
4. Move debt scenario inputs to user liabilities table.
5. Add integration tests with Supertest + test SQLite DB.

---

## Related docs

- [Root README](../../README.md)
- [API samples](../../docs/api-sample-responses.md)
- [Web app](../web/README.md)
