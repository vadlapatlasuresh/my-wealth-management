# Component · Business Financials Service (:8085) — QuickBooks 🟡 mock

**Responsibility:** business dashboard, P&L, invoices, expenses via a **QuickBooks Online (QBO)**
provider — currently a **mock**. Persists only the connection metadata.
**Source:** [finance-mvp/apps/business-financials-service](../../../finance-mvp/apps/business-financials-service) · 🗄️ schema `business`

## Endpoints
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/business/connection` | connection status |
| POST | `/api/v1/business/connect` | connect (mock) |
| POST | `/api/v1/business/sync` | sync (mock) |
| GET | `/api/v1/business/dashboard` | KPIs (mock) |
| GET | `/api/v1/business/pnl?period=` | P&L (mock) |
| GET | `/api/v1/business/invoices` / `/expenses` | lists (mock) |

## Data model
```mermaid
erDiagram
    QBO_CONNECTIONS {
        bigint id PK
        bigint user_id UK
        boolean connected
        string realm_id "QBO company id (mock)"
        string company_name
        timestamp last_sync_at
    }
```
> Only connection metadata is stored. Dashboard/P&L/invoices/expenses are generated per-user by the
> mock — **not persisted**. No QBO OAuth token is stored.

## Provider selection
```mermaid
flowchart LR
    SVC[business service] --> IFACE[BusinessDataProvider]
    IFACE --> MOCK["MockBusinessDataProvider 🟡<br/>deterministic per-user seed"]
    IFACE -.future.-> REAL["QBO impl 🟢<br/>qbo.client-id / secret / redirect-uri"]
```

## Status / pending
- 🟡 Fully wired UI on mock data.
- ⬜ Real QBO OAuth flow; **store + refresh access/refresh tokens** (none stored today); persist synced P&L/invoices/expenses if needed for history.
