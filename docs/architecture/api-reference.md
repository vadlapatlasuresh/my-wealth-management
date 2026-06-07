# API Reference

Every endpoint, traced **UI method → gateway route → service → controller endpoint → storage**.
Base URL for the client is the gateway: `http://localhost:8080`. All routes require
`Authorization: Bearer <JWT>` unless marked _public_.

Legend: **UI** = method in `apps/web/src/api.js`. **Service** owns the endpoint behind the gateway.

---

## Auth — `auth-service` (8081)

| Method | Path (via gateway) | UI | Body / returns |
|---|---|---|---|
| POST | `/api/v1/auth/register` _(public)_ | `api.register` | `{email,password,name}` → `{token,message}` |
| POST | `/api/v1/auth/login` _(public)_ | `api.login` | `{email,password}` → `{token,message}` |

## Account Aggregation (Plaid) — `account-aggregation-service` (8082)

| Method | Path | UI | Notes |
|---|---|---|---|
| POST | `/api/v1/aggregation/link-token/create` | `api.createPlaidLinkToken` | → `{link_token}` |
| POST | `/api/v1/aggregation/public-token/exchange` | `api.exchangePlaidPublicToken` | `{publicToken}` → `{message}`; fetches accounts+tx |
| GET | `/api/v1/aggregation/accounts` | `api.getAccounts` | → `[AccountDto]` |
| GET | `/api/v1/aggregation/transactions` | `api.getTransactions` | → `[TransactionDto]` |
| POST | `/api/v1/aggregation/webhook` _(public)_ | — | Plaid webhooks |

DB tables: `plaid_items`, `accounts`, `transactions`.

## Financial Core — `financial-core-service` (8083)

| Method | Path | UI | Notes |
|---|---|---|---|
| GET | `/api/v1/me/snapshot?range=` | `api.getSnapshot` | net worth, cash, investments, debt |
| GET | `/api/v1/me/accounts` | — | proxied account view |
| GET | `/api/v1/me/transactions` | — | proxied tx view |
| GET | `/api/v1/planning/budgets/{month}` | `api.getBudget` | `YYYY-MM` |
| PUT | `/api/v1/planning/budgets/{month}` | `api.putBudget` | body: `[BudgetLineDto]` |
| GET | `/api/v1/planning/debt-scenarios` | `api.getDebts` | → `[DebtDto]` |
| POST | `/api/v1/planning/debt-scenarios` | `api.runDebtScenario` | `DebtScenarioRequest` |
| POST | `/api/v1/planning/debt-scenarios/add` | `api.addDebt` | `DebtDto` |

DB tables: `budgets`, `budget_lines`, `debts`, `debt_scenarios`.

## Real Estate — `real-estate-service` (8084) · Phase 3

| Method | Path | UI | Notes |
|---|---|---|---|
| GET | `/api/v1/real-estate` | `api.getRealEstate` | → `[PropertyDto]` (equity computed) |
| POST | `/api/v1/real-estate` | `api.addProperty` | `PropertyDto` |
| GET | `/api/v1/real-estate/{id}` | `api.getRealEstateDetail` | |
| PUT | `/api/v1/real-estate/{id}` | `api.updateProperty` | |
| DELETE | `/api/v1/real-estate/{id}` | `api.deleteProperty` | 204 |
| POST | `/api/v1/real-estate/{id}/revalue` | `api.revalueProperty` | provider re-estimates `currentValue` |

DB table: `properties`. Provider: `PropertyValuationProvider` (mock; real = RentCast/ATTOM).

## Business Financials — `business-financials-service` (8085) · Phase 4

| Method | Path | UI |
|---|---|---|
| GET | `/api/v1/business/connection` | `api.getBusinessConnection` |
| GET | `/api/v1/business/dashboard` | `api.getBusinessDashboard` |
| GET | `/api/v1/business/pnl?period=` | `api.getBusinessPnl` |
| GET | `/api/v1/business/invoices` | `api.getBusinessInvoices` |
| GET | `/api/v1/business/expenses` | `api.getBusinessExpenses` |
| POST | `/api/v1/business/connect` | `api.connectBusiness` |
| POST | `/api/v1/business/sync` | `api.syncBusiness` |

DB table: `qbo_connections`. Provider: `BusinessDataProvider` (mock; real = QuickBooks OAuth2).

## AI Insights — `ai-insights-service` (8086) · Phase 5

| Method | Path | UI |
|---|---|---|
| GET | `/api/v1/ai/insights` | `api.getInsights` |
| POST | `/api/v1/ai/insights/refresh` | `api.refreshInsights` |
| POST | `/api/v1/ai/chat` | `api.chatWithAssistant` |

DB table: `insights`. Provider: `AiProvider` (mock; real = Claude/OpenAI over the user's summary).

## Payments / Bill Pay — `payment-service` (8087) · Phase 6

| Method | Path | UI | Notes |
|---|---|---|---|
| GET | `/api/v1/payments/bill-pay-intents` | `api.getPaymentIntents` | → `{items:[...]}` |
| POST | `/api/v1/payments/bill-pay-intents` | `api.createBillPayIntent` | snake_case `intent_id`,`created_at` |
| GET | `/api/v1/payments/bill-pay-intents/{id}` | — | |
| POST | `/api/v1/payments/webhook` _(public)_ | — | Stripe webhook (mock) |

DB table: `bill_pay_intents`. Provider: `PaymentProvider` (mock; real = Stripe PaymentIntents).

## Notifications — `notification-service` (8088) · Phase 7

| Method | Path | UI |
|---|---|---|
| GET | `/api/v1/notifications` | `api.getNotifications` |
| GET | `/api/v1/notifications/preferences` | `api.getNotificationPreferences` |
| PUT | `/api/v1/notifications/preferences` | `api.putNotificationPreferences` |
| POST | `/api/v1/notifications/test` | `api.testNotification` |
| POST | `/api/v1/notifications/{id}/read` | `api.markNotificationRead` |

DB tables: `notifications`, `notification_preferences`. Provider: `NotificationProvider`
(mock; real = SendGrid/SES + FCM/APNs).

---

## Standard error shape
Non-2xx responses return JSON; the gateway returns its own error envelope for downstream
failures. A `401/403` triggers client-side token clear + redirect to login.
