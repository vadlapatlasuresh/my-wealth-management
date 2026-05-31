# Finance MVP — Documentation

Central documentation for API contracts, mock data, and product delivery waves.

---

## Contents

| Document | Description |
|----------|-------------|
| [api-sample-responses.md](./api-sample-responses.md) | Full REST API reference with request/response JSON |
| [mocks/seed-data.json](./mocks/seed-data.json) | Demo user, accounts, transactions, insights (canonical mocks) |
| [roadmap-waves.md](./roadmap-waves.md) | Wave 1–6 scope, timeline, dependencies |

---

## Quick links

- **Run the project:** [../README.md](../README.md)
- **API details:** [../apps/api/README.md](../apps/api/README.md)
- **Web UI:** [../apps/web/README.md](../apps/web/README.md)

---

## Mock data strategy

| Layer | What is mocked | Where |
|-------|----------------|--------|
| Seed database | User, 3 accounts, 3 transactions, 2 insights | `apps/api/src/seed.js` |
| JSON reference | Same data as portable fixtures | `docs/mocks/seed-data.json` |
| Snapshot | Investments, loans, 30d change | `apps/api/src/server.js` constants |
| Debt scenarios | Strategy outcome tables | `apps/api/src/server.js` |
| Bill pay | No ACH; status `PENDING` only | PaymentIntent model |

---

## Testing API with curl

```bash
# Health
curl http://localhost:4000/health

# Login
curl -s -X POST http://localhost:4000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@finance.app","password":"Demo@1234"}'

# Use token from response:
export TOKEN="<paste token>"
curl -s http://localhost:4000/v1/me/snapshot \
  -H "Authorization: Bearer $TOKEN" | jq
```

---

## Implementation status (summary)

| Wave | Status | Notes |
|------|--------|-------|
| Wave 1 | Done | Monorepo, web UI, core endpoints |
| Wave 2 | Done | JWT auth, Prisma SQLite, seed |
| Wave 3+ | Planned | Plaid, budgets, real payments — see roadmap |
