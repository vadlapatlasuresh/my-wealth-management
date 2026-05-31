# API reference and sample responses

**Base URL:** `http://localhost:4000`  
**Content-Type:** `application/json`  
**Auth header (protected routes):** `Authorization: Bearer <jwt>`

---

## Table of contents

1. [Health](#get-health)
2. [Auth](#authentication)
3. [Snapshot](#get-v1mesnapshot)
4. [Accounts](#get-v1accounts)
5. [Transactions](#get-v1transactions)
6. [AI insights](#get-v1aiinsights)
7. [Bill pay intents](#bill-pay-intents)
8. [Debt scenarios](#post-v1planningdebt-scenarios)
9. [Errors](#error-responses)

---

## GET /health

No authentication.

**Response `200`**

```json
{
  "ok": true,
  "service": "finance-mvp-api"
}
```

---

## Authentication

### POST /v1/auth/register

**Request**

```json
{
  "email": "newuser@example.com",
  "password": "SecurePass1"
}
```

| Field | Rules |
|-------|--------|
| `email` | Valid email (Zod) |
| `password` | Minimum 8 characters |

**Response `201`**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "clx1234567890abcdef",
    "email": "newuser@example.com"
  }
}
```

**Response `409`**

```json
{
  "error_code": "CONFLICT",
  "message": "Email already exists"
}
```

---

### POST /v1/auth/login

**Request** — same shape as register.

**Response `200`**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "clx1234567890abcdef",
    "email": "demo@finance.app"
  }
}
```

**Response `401`**

```json
{
  "error_code": "UNAUTHORIZED",
  "message": "Invalid credentials"
}
```

**Demo credentials (after `npm run db:seed -w apps/api`):**

- Email: `demo@finance.app`
- Password: `Demo@1234`

---

## GET /v1/me/snapshot

Requires authentication.

**Response `200`**

```json
{
  "user_id": "clx1234567890abcdef",
  "computed_at": "2026-05-28T12:00:00.000Z",
  "net_worth": {
    "total": 284110.04,
    "change_30d": 4510.12
  },
  "components": {
    "cash": 42110.2,
    "investments": 265930.4,
    "credit_cards": 2450.56,
    "loans": 18480
  }
}
```

| Field | Source |
|-------|--------|
| `components.cash` | Sum of user `CHECKING` + `SAVINGS` balances |
| `components.credit_cards` | Sum of user `CREDIT_CARD` balances |
| `components.investments` | **Mock constant** `265930.4` |
| `components.loans` | **Mock constant** `18480` |
| `net_worth.change_30d` | **Mock constant** `4510.12` |
| `net_worth.total` | `cash + investments - credit_cards - loans` |

---

## GET /v1/accounts

Requires authentication.

**Query parameters**

| Param | Example | Description |
|-------|---------|-------------|
| `type` | `CHECKING` | Filter by account type |

**Response `200`**

```json
{
  "items": [
    {
      "id": "clxacc00000000000001",
      "userId": "clx1234567890abcdef",
      "institution": "Chase",
      "name": "Everyday Checking",
      "type": "CHECKING",
      "balance": 18350.42,
      "available": 17920.1,
      "creditLimit": null,
      "dueDate": null,
      "status": "HEALTHY",
      "lastSynced": "2026-05-28T12:00:00.000Z",
      "createdAt": "2026-05-28T10:00:00.000Z"
    },
    {
      "id": "clxacc00000000000002",
      "userId": "clx1234567890abcdef",
      "institution": "SoFi",
      "name": "High Yield Savings",
      "type": "SAVINGS",
      "balance": 23759.78,
      "available": 23759.78,
      "creditLimit": null,
      "dueDate": null,
      "status": "HEALTHY",
      "lastSynced": "2026-05-28T12:00:00.000Z",
      "createdAt": "2026-05-28T10:00:00.000Z"
    },
    {
      "id": "clxacc00000000000003",
      "userId": "clx1234567890abcdef",
      "institution": "American Express",
      "name": "Gold Card",
      "type": "CREDIT_CARD",
      "balance": 2450.56,
      "available": 12549.44,
      "creditLimit": 15000,
      "dueDate": "2026-06-10",
      "status": "HEALTHY",
      "lastSynced": "2026-05-28T12:00:00.000Z",
      "createdAt": "2026-05-28T10:00:00.000Z"
    }
  ]
}
```

> IDs are Prisma CUIDs; values differ per database. Use IDs from this response in bill-pay requests.

---

## GET /v1/transactions

Requires authentication.

**Query parameters**

| Param | Description |
|-------|-------------|
| `account_id` | Filter by account CUID |

**Response `200`**

```json
{
  "items": [
    {
      "id": "clxtx0000000000000001",
      "userId": "clx1234567890abcdef",
      "accountId": "clxacc00000000000001",
      "date": "2026-05-25",
      "description": "Payroll Deposit",
      "category": "Income",
      "amount": 4250,
      "createdAt": "2026-05-28T10:00:00.000Z"
    },
    {
      "id": "clxtx0000000000000002",
      "userId": "clx1234567890abcdef",
      "accountId": "clxacc00000000000001",
      "date": "2026-05-26",
      "description": "Rent Payment",
      "category": "Housing",
      "amount": -1850,
      "createdAt": "2026-05-28T10:00:00.000Z"
    },
    {
      "id": "clxtx0000000000000003",
      "userId": "clx1234567890abcdef",
      "accountId": "clxacc00000000000003",
      "date": "2026-05-27",
      "description": "Grocery Store",
      "category": "Groceries",
      "amount": -128.44,
      "createdAt": "2026-05-28T10:00:00.000Z"
    }
  ]
}
```

---

## GET /v1/ai/insights

Requires authentication.

**Response `200`**

```json
{
  "insights": [
    {
      "id": "clxins00000000000001",
      "userId": "clx1234567890abcdef",
      "severity": "actionable",
      "title": "Reduce dining spend by $120 this month",
      "reason": "Dining is 24% above your 3-month average.",
      "suggestedAction": "Adjust dining budget cap to $480 and enable weekly alert.",
      "createdAt": "2026-05-28T10:00:00.000Z"
    },
    {
      "id": "clxins00000000000002",
      "userId": "clx1234567890abcdef",
      "severity": "warning",
      "title": "Pay your card before statement close",
      "reason": "Card utilization is trending up.",
      "suggestedAction": "Schedule a payment this week.",
      "createdAt": "2026-05-28T10:00:00.000Z"
    }
  ]
}
```

**Severity values:** `actionable` | `warning` | `informational`

---

## Bill pay intents

Mock payment flow only — no real money movement. Status remains `PENDING`.

### POST /v1/payments/bill-pay-intents

**Request**

```json
{
  "card_account_id": "clxacc00000000000003",
  "funding_account_id": "clxacc00000000000001",
  "amount": 350,
  "currency": "USD"
}
```

| Field | Required |
|-------|----------|
| `card_account_id` | Yes |
| `funding_account_id` | Yes |
| `amount` | Yes (number) |
| `currency` | No (default `USD`) |

**Response `201`**

```json
{
  "intent_id": "clxpi0000000000000001",
  "card_account_id": "clxacc00000000000003",
  "funding_account_id": "clxacc00000000000001",
  "amount": 350,
  "currency": "USD",
  "status": "PENDING",
  "estimated_settlement_at": "2026-05-30T12:00:00.000Z",
  "created_at": "2026-05-28T12:00:00.000Z"
}
```

**Response `400`**

```json
{
  "error_code": "VALIDATION_ERROR",
  "message": "card_account_id, funding_account_id and amount are required"
}
```

---

### GET /v1/payments/bill-pay-intents

**Response `200`**

```json
{
  "items": [
    {
      "intent_id": "clxpi0000000000000001",
      "card_account_id": "clxacc00000000000003",
      "funding_account_id": "clxacc00000000000001",
      "amount": 350,
      "currency": "USD",
      "status": "PENDING",
      "estimated_settlement_at": "2026-05-30T12:00:00.000Z",
      "created_at": "2026-05-28T12:00:00.000Z"
    }
  ]
}
```

---

### GET /v1/payments/bill-pay-intents/:intentId

**Response `200`** — same object shape as single intent in POST response.

**Response `404`**

```json
{
  "error_code": "NOT_FOUND",
  "message": "Payment intent not found"
}
```

---

## POST /v1/planning/debt-scenarios

Requires authentication. Deterministic mock — not based on user's actual liabilities.

**Request**

```json
{
  "strategy": "AVALANCHE",
  "extra_payment_monthly": 300
}
```

| `strategy` | Base months | Base interest |
|------------|-------------|---------------|
| `AVALANCHE` | 22 | 4120 |
| `SNOWBALL` | 25 | 4580 |
| `HYBRID` | 23 | 4310 |

Adjustment rules (simplified):

- `months_to_debt_free` = max(8, base_months - floor(extra_payment_monthly / 200))
- `total_interest_paid` = max(1200, base_interest - extra_payment_monthly * 2.2)

**Response `200`**

```json
{
  "scenario_id": "debt_1748400000000",
  "strategy": "AVALANCHE",
  "months_to_debt_free": 21,
  "total_interest_paid": 3460,
  "assumptions": {
    "extra_payment_monthly": 300
  }
}
```

**Example — SNOWBALL with $500 extra**

Request:

```json
{
  "strategy": "SNOWBALL",
  "extra_payment_monthly": 500
}
```

Response (approximate):

```json
{
  "scenario_id": "debt_1748400001234",
  "strategy": "SNOWBALL",
  "months_to_debt_free": 23,
  "total_interest_paid": 3480,
  "assumptions": {
    "extra_payment_monthly": 500
  }
}
```

---

## Error responses

Standard error body:

```json
{
  "error_code": "ERROR_CODE",
  "message": "Human-readable description"
}
```

| error_code | HTTP | When |
|------------|------|------|
| `VALIDATION_ERROR` | 400 | Invalid register/login or bill-pay body |
| `UNAUTHORIZED` | 401 | Missing/invalid JWT, or bad login |
| `NOT_FOUND` | 404 | Payment intent not found |
| `CONFLICT` | 409 | Email already registered |
| `INTERNAL_ERROR` | 500 | Unhandled server error |

**Missing token example**

```json
{
  "error_code": "UNAUTHORIZED",
  "message": "Missing token"
}
```

---

## curl cookbook

```bash
# 1. Login and capture token
TOKEN=$(curl -s -X POST http://localhost:4000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@finance.app","password":"Demo@1234"}' \
  | jq -r '.token')

# 2. Snapshot
curl -s http://localhost:4000/v1/me/snapshot \
  -H "Authorization: Bearer $TOKEN" | jq

# 3. Accounts
curl -s http://localhost:4000/v1/accounts \
  -H "Authorization: Bearer $TOKEN" | jq

# 4. Debt scenario
curl -s -X POST http://localhost:4000/v1/planning/debt-scenarios \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"strategy":"HYBRID","extra_payment_monthly":400}' | jq
```

---

## Related files

- Seed script: `apps/api/src/seed.js`
- Mock fixtures: `docs/mocks/seed-data.json`
- Server implementation: `apps/api/src/server.js`
