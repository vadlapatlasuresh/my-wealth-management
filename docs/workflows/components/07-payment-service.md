# Component · Payment Service (:8087) — Stripe 🟡 mock

**Responsibility:** bill-pay intents (schedule/cancel) via a **Stripe** provider — currently a **mock**.
**Source:** [finance-mvp/apps/payment-service](../../../finance-mvp/apps/payment-service) · 🗄️ schema `payments`

## Endpoints
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/payments/bill-pay-intents` | list intents |
| POST | `/api/v1/payments/bill-pay-intents` | create intent (idempotent) |
| GET | `/api/v1/payments/bill-pay-intents/{id}` | read |
| POST | `/api/v1/payments/bill-pay-intents/{id}/cancel` | cancel |
| GET | `/api/v1/payments/support/{userId}/bill-pay-intents` | Customer Care read-only view of a member's payments (CARE/ADMIN, audited) |
| POST | `/api/v1/payments/webhook` | Stripe webhook (⚠️ **no signature verify**, payload discarded; `permitAll`) |

## Data model
```mermaid
erDiagram
    BILL_PAY_INTENTS {
        bigint id PK
        bigint user_id
        decimal amount
        string currency
        string payee
        string from_account
        string to_account
        string payee_type "CREDIT_CARD|UTILITY|LOAN|PERSON|OTHER"
        date scheduled_date
        string memo
        string confirmation_number "mock"
        string idempotency_key "dedupe double-pay"
        string status "SCHEDULED|PROCESSING|COMPLETED|FAILED|CANCELED"
        string provider_ref "external ref (mock)"
    }
```

## Provider selection
```mermaid
flowchart LR
    SVC[payment] --> IFACE[PaymentProvider]
    IFACE --> MOCK["MockPaymentProvider 🟡 generates mock intent ids"]
    IFACE -.future.-> REAL["Stripe impl 🟢<br/>STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET"]
```

## Status / pending
- 🟡 Intents persisted with idempotency keys; full bill-pay wizard works on mock.
- ⬜ Real Stripe (or ACH) integration.
- 🔴 **Webhook signature verification** (`Stripe-Signature` + secret) and **persist webhook events** — see [03 · Persistence & Audit](../03-data-persistence-and-audit.md).
