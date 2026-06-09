# Component · Financial Core Service (:8083)

**Responsibility:** net-worth snapshot, budgets, debts & debt-payoff scenarios, **goals**, and the
**GDPR/CCPA data export**. Aggregates account data from account-aggregation (the only inter-service
business call).
**Source:** [finance-mvp/apps/financial-core-service](../../../finance-mvp/apps/financial-core-service) · 🗄️ schema `core`

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/me/snapshot?range=` | net-worth snapshot (+series, components) |
| GET | `/api/v1/me/accounts` / `/me/transactions` | proxied account/tx views |
| GET | `/api/v1/me/export` | **data export** — the signed-in user's full data bundle as a downloadable JSON (`terravest-my-data.json`) |
| GET/PUT | `/api/v1/planning/budgets/{month}` | get/set monthly budget lines |
| GET/POST | `/api/v1/planning/debt-scenarios` | list / run a payoff scenario |
| POST | `/api/v1/planning/debt-scenarios/add` | add a debt |
| GET/POST | `/api/v1/planning/goals` | list / create goals |
| PUT/DELETE | `/api/v1/planning/goals/{id}` | update (incl. +$ quick-add) / delete a goal |

## Data model

```mermaid
erDiagram
    BUDGETS ||--o{ BUDGET_LINES : has
    BUDGETS { bigint id PK; bigint user_id; string month "YYYY-MM" }
    BUDGET_LINES { bigint id PK; bigint budget_id FK; string category; decimal amount }
    DEBTS { bigint id PK; bigint user_id; string name; decimal balance; decimal apr; decimal min_payment }
    DEBT_SCENARIOS { bigint id PK; bigint user_id; string strategy "AVALANCHE|SNOWBALL|HYBRID"; decimal extra_payment_monthly; int months_to_debt_free; decimal total_interest_paid; date debt_free_date }
    GOALS { bigint id PK; bigint user_id; string name; string goal_type "SAVINGS|DEBT_PAYOFF|NET_WORTH|CUSTOM"; decimal target_amount; decimal current_amount; date target_date; decimal monthly_contribution; timestamp created_at; timestamp updated_at }
```

## Snapshot sequence (the one cross-service business call)

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

## Goals flow

```mermaid
sequenceDiagram
    actor U as User
    participant CORE as financial-core
    participant DB as core schema 🗄️
    U->>CORE: POST /planning/goals {name, type, target, current, date}
    CORE->>DB: save goal
    U->>CORE: PUT /planning/goals/{id} {currentAmount += 100}
    Note over U: "+$100 / +$500" quick-add; required monthly<br/>contribution is computed client-side
```

## Status / pending
- ✅ Budgets, debts, debt scenarios, **goals** persisted; snapshot composes from aggregation via
  Feign; **data export** (`/me/export`) downloads the user's bundle as JSON.
- 🟠 Some **30d-change deltas** in the snapshot are placeholders; verify **real-estate equity** is
  included in `components`.
- ⬜ Goal progress is user-updated — auto-progress from linked accounts/net-worth would make goals live.
