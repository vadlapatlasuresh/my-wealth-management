# Component · Account Aggregation Service (:8082) — Plaid 🟢

**Responsibility:** the **only live external integration**. Links bank accounts via Plaid, exchanges
tokens, fetches and **persists** accounts & transactions. **Stores the Plaid access token.**
**Source:** [finance-mvp/apps/account-aggregation-service](../../../finance-mvp/apps/account-aggregation-service) · 🗄️🔑 schema `aggregation`

## Endpoints
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/aggregation/link-token/create` | create Plaid Link token |
| POST | `/api/v1/aggregation/public-token/exchange` | exchange public→access token, sync data |
| GET | `/api/v1/aggregation/accounts` | list persisted accounts |
| GET | `/api/v1/aggregation/transactions` | list persisted transactions |
| POST | `/api/v1/aggregation/webhook` | Plaid webhook (⚠️ **no signature verify**, payload discarded) |

## Data model
```mermaid
erDiagram
    PLAID_ITEMS ||--o{ ACCOUNTS : has
    ACCOUNTS ||--o{ TRANSACTIONS : has
    PLAID_ITEMS {
        bigint id PK
        bigint user_id
        string plaid_item_id UK
        text access_token "🔑 PLAINTEXT today"
        string institution_id
    }
    ACCOUNTS {
        bigint id PK
        bigint user_id
        string plaid_account_id UK
        string plaid_item_id FK
        string name
        string type "credit|depository|investment|loan"
        string subtype
        decimal current_balance
        decimal available_balance
        string currency
    }
    TRANSACTIONS {
        bigint id PK
        bigint user_id
        bigint account_id FK
        string plaid_transaction_id UK
        string plaid_account_id
        string name
        decimal amount
        date date
        string category
    }
```

## Link + sync sequence
```mermaid
sequenceDiagram
    actor U as User
    participant AGG as aggregation
    participant PLAID as Plaid 🟢
    participant DB as aggregation 🗄️
    U->>AGG: link-token/create
    AGG->>PLAID: /link/token/create
    U->>PLAID: authenticate (Plaid Link)
    PLAID-->>U: public_token
    U->>AGG: public-token/exchange
    AGG->>PLAID: exchange → access_token
    AGG->>DB: 🔑 save PlaidItem(access_token)
    AGG->>PLAID: /accounts/get, /transactions/get
    AGG->>DB: upsert Accounts + Transactions
```

## Status / pending
- ✅ Real Plaid (sandbox): link, exchange, accounts, transactions persisted with `created_at/updated_at`.
- 🔴 **Encrypt `access_token` at rest** (currently plaintext, comment says "encrypted in production").
- ⬜ **Webhook**: implement Plaid signature verification + handle `TRANSACTIONS_UPDATES`/`ITEM_ERROR`; store events.
- ⬜ Plaid **production** credentials; scheduled/refresh sync; consent log when an item is linked.
