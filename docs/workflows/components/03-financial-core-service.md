# Component · Financial Core Service (:8083)

**Responsibility:** net-worth snapshot, budgets, debts & debt-payoff scenarios. Aggregates account
data from account-aggregation (the only inter-service call).
**Source:** [finance-mvp/apps/financial-core-service](../../../finance-mvp/apps/financial-core-service) · 🗄️ schema `core`

## Endpoints
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/me/snapshot` | net-worth snapshot (+series, components) |
| GET | `/api/v1/me/accounts` / `/me/transactions` | proxied account/tx views |
| GET/PUT | `/api/v1/planning/budgets/{month}` | get/set monthly budget lines |
| GET/POST | `/api/v1/planning/debt-scenarios` | list / run a payoff scenario |
| POST | `/api/v1/planning/debt-scenarios/add` | add a debt |

## Data model
```mermaid
erDiagram
    BUDGETS ||--o{ BUDGET_LINES : has
    BUDGETS { bigint id PK; bigint user_id; string month "YYYY-MM" }
    BUDGET_LINES { bigint id PK; bigint budget_id FK; string category; decimal amount }
    DEBTS { bigint id PK; bigint user_id; string name; decimal balance; decimal apr; decimal min_payment }
    DEBT_SCENARIOS { bigint id PK; bigint user_id; string strategy "AVALANCHE|SNOWBALL|HYBRID"; decimal extra_payment_monthly; int months_to_debt_free; decimal total_interest_paid; date debt_free_date }
```

## Snapshot sequence (the one cross-service call)
```mermaid
sequenceDiagram
    participant CORE as financial-core
    participant GW as Gateway
    participant AGG as account-aggregation
    CORE->>GW: Feign GET /api/v1/aggregation/accounts
    GW->>AGG: accounts
    CORE->>GW: Feign GET /api/v1/aggregation/transactions
    GW->>AGG: transactions
    CORE->>CORE: compute net worth, components, series
    CORE-->>CORE: return snapshot (camelCase; client normalizes)
```

## Status / pending
- ✅ Budgets, debts, debt scenarios persisted; snapshot composes from aggregation via Feign.
- 🟠 Some **30d-change deltas** in the snapshot are placeholders; verify **real-estate equity** is included in `components`.
