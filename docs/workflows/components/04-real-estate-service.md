# Component · Real Estate Service (:8084) — Valuation 🟡 mock

**Responsibility:** property CRUD + valuation. Valuation is a **mock provider** behind a real interface.
**Source:** [finance-mvp/apps/real-estate-service](../../../finance-mvp/apps/real-estate-service) · 🗄️ schema `real_estate`

> This service also hosts the **Deal Room** (`/api/v1/deals/**`, `/api/v1/sponsor/**`) — documented
> separately in [12-deals-and-sponsor-service.md](12-deals-and-sponsor-service.md).

## Endpoints
| Method | Path | Purpose |
|---|---|---|
| GET / POST | `/api/v1/real-estate` | list / add property |
| GET/PUT/DELETE | `/api/v1/real-estate/{id}` | read / update / delete |
| POST | `/api/v1/real-estate/{id}/revalue` | re-run valuation (mock) |
| POST | `/api/v1/real-estate/lookup` | estimate value from address (mock) |

## Data model
```mermaid
erDiagram
    PROPERTIES {
        bigint id PK
        bigint user_id
        string address
        string property_type "PRIMARY_RESIDENCE|RENTAL_PROPERTY|LAND"
        decimal purchase_price
        date purchase_date
        decimal current_value "mock valuation"
        decimal mortgage_balance
        timestamp last_valued_at
        int beds
        decimal baths
        int sqft
        int year_built
        decimal rent_estimate
    }
```

## Provider selection
```mermaid
flowchart LR
    SVC[real-estate service] --> IFACE[PropertyValuationProvider]
    IFACE --> MOCK["MockPropertyValuationProvider 🟡<br/>deterministic by address hash"]
    IFACE -.future.-> REAL["RentCast/ATTOM impl 🟢<br/>key: realestate.provider.api-key"]
```

## Status / pending
- 🟡 Full CRUD persisted; valuation/lookup are deterministic mock.
- ⬜ Real valuation provider + API key; 30d-change deltas in UI are placeholders.
- ✅ Uses the content service for the **valuation disclaimer** (`<Disclaimer/>`).
