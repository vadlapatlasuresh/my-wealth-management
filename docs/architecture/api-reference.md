# API Reference

Every endpoint, traced **UI method → gateway route → service → storage**. Base URL for the client is
the gateway: `http://localhost:8080`. All routes require `Authorization: Bearer <JWT>` unless marked
_public_. Role-gated routes are marked **CARE/ADMIN**.

Legend: **UI** = method in `apps/web/src/api.js`. **Service** owns the endpoint behind the gateway.

> _Refreshed 2026-06-07 against `api.js` + the gateway route table + controllers._

---

## Auth — `auth-service` (8081)

| Method | Path (via gateway) | UI | Body / returns |
|---|---|---|---|
| POST | `/api/v1/auth/register` _(public)_ | `api.register` | full signup payload (name, DOB, address, MFA channel, ssn/ein) → `{token, ...}` (auto-login) |
| POST | `/api/v1/auth/login` _(public)_ | `api.login` | `{email,password}` → step 1: `{mfaRequired, channel, destination, devCode?}` (or token if MFA off) |
| POST | `/api/v1/auth/mfa/verify` _(public)_ | `api.verifyMfa` | `{email,code}` → `{token, name, email}` |
| POST | `/api/v1/auth/email/send` _(public)_ | `api.sendEmailCode` | `{email}` → `{sent, devCode?}` |
| POST | `/api/v1/auth/email/verify` _(public)_ | `api.verifyEmailCode` | `{email,code}` → `{verified}` |
| POST | `/api/v1/auth/sms/send` _(public)_ | `api.sendSmsCode` | `{phone}` → `{sent, devCode?}` |
| POST | `/api/v1/auth/sms/verify` _(public)_ | `api.verifySmsCode` | `{phone,code}` → `{verified}` |
| GET | `/api/v1/auth/validate` | — | token validation |
| GET | `/api/v1/auth/me` | `api.getProfile` | full profile (SSN/EIN **masked**) |
| PUT | `/api/v1/auth/me` | `api.updateProfile` | editable fields (name, phone, DOB, address, MFA channel) |
| DELETE | `/api/v1/auth/me` | `api.deleteAccount` | 204 — permanent (hard) delete |

DB tables: `users`, `user_roles`. JWT carries `sub` + `roles`.

## Customer Care / Support — `auth-service` (8081), **CARE/ADMIN**

| Method | Path | UI | Notes |
|---|---|---|---|
| GET | `/api/v1/support/users?query=&first=&last=&email=&phone=&page=&size=` | `api.supportSearchUsers` | paged help-desk search |
| GET | `/api/v1/support/users/{id}` | `api.supportGetUser` | member 360 (profile + verification + activity + issues) |
| GET | `/api/v1/support/users/{id}/activity?onlyIssues=&limit=` | `api.supportGetUserActivity` | timeline (or just problems) |
| POST | `/api/v1/support/users/{id}/roles` | `api.supportChangeUserRole` | **ADMIN only** — grant/revoke CARE/ADMIN |

## Account Aggregation (Plaid) — `account-aggregation-service` (8082)

| Method | Path | UI | Notes |
|---|---|---|---|
| POST | `/api/v1/aggregation/link-token/create` | `api.createPlaidLinkToken` | → `{link_token}` |
| POST | `/api/v1/aggregation/public-token/exchange` | `api.exchangePlaidPublicToken` | `{publicToken}` → fetches accounts+tx |
| GET | `/api/v1/aggregation/accounts` | `api.getAccounts` | → `[AccountDto]` |
| GET | `/api/v1/aggregation/transactions` | `api.getTransactions` | → `[TransactionDto]` |
| PATCH | `/api/v1/aggregation/transactions/{id}/category` | `api.categorizeTransaction` | `{category}` (ownership-scoped) |
| GET | `/api/v1/aggregation/support/{userId}/accounts` | `api.supportGetAccounts` | **CARE/ADMIN**, audited |
| GET | `/api/v1/aggregation/support/{userId}/transactions` | `api.supportGetTransactions` | **CARE/ADMIN**, audited |
| POST | `/api/v1/aggregation/webhook` _(public)_ | — | Plaid webhooks (⚠️ no signature verify) |

DB tables: `plaid_items` (🔑 access_token), `accounts`, `transactions`.

## Financial Core — `financial-core-service` (8083)

| Method | Path | UI | Notes |
|---|---|---|---|
| GET | `/api/v1/me/snapshot?range=` | `api.getSnapshot` | net worth, cash, investments, debt, components, series |
| GET | `/api/v1/me/accounts` / `/me/transactions` | — | proxied views |
| GET | `/api/v1/me/export` | `api.exportMyData` | GDPR/CCPA bundle → `terravest-my-data.json` |
| GET/PUT | `/api/v1/planning/budgets/{month}` | `api.getBudget`/`putBudget` | `YYYY-MM`; PUT body `[BudgetLineDto]` |
| GET | `/api/v1/planning/debt-scenarios` | `api.getDebts` | → `[DebtDto]` |
| POST | `/api/v1/planning/debt-scenarios` | `api.runDebtScenario` | strategy comparison |
| POST | `/api/v1/planning/debt-scenarios/add` | `api.addDebt` | `DebtDto` |
| GET/POST | `/api/v1/planning/goals` | `api.getGoals`/`addGoal` | list / create |
| PUT/DELETE | `/api/v1/planning/goals/{id}` | `api.updateGoal`/`deleteGoal` | update (incl. +$ quick-add) / delete |

DB tables: `budgets`, `budget_lines`, `debts`, `debt_scenarios`, `goals`.

## Real Estate — `real-estate-service` (8084)

| Method | Path | UI | Notes |
|---|---|---|---|
| GET/POST | `/api/v1/real-estate` | `api.getRealEstate`/`addProperty` | list / add (equity computed) |
| GET/PUT/DELETE | `/api/v1/real-estate/{id}` | `api.getRealEstateDetail`/`updateProperty`/`deleteProperty` | |
| POST | `/api/v1/real-estate/{id}/revalue` | `api.revalueProperty` | provider re-estimates `currentValue` |
| POST | `/api/v1/real-estate/lookup` | `api.lookupProperty` | `{address}` → estimate (mock) |

DB table: `properties`. Provider: `PropertyValuationProvider` (mock; real = RentCast/ATTOM).

## Deal Room (Deals & Sponsor) — `real-estate-service` (8084)

| Method | Path | UI | Notes |
|---|---|---|---|
| GET/POST | `/api/v1/deals` | `api.getDeals`/`createDeal` | my deals / register |
| GET | `/api/v1/deals/taxonomy` | `api.getDealTaxonomy` | category → subcategory |
| GET | `/api/v1/deals/marketplace?...` | `api.getMarketplace` | OPEN deals, filter + sort |
| GET/PUT/DELETE | `/api/v1/deals/{id}` | `api.getDeal`/`updateDeal`/`deleteDeal` | owner-scoped writes |
| POST/DELETE | `/api/v1/deals/{id}/watch` | `api.watchDeal`/`unwatchDeal` | watchlist |
| GET | `/api/v1/deals/watchlist` | `api.getWatchlist` | saved deals |
| POST | `/api/v1/deals/{id}/interests` | `api.expressDealInterest` | investor lead (contact + accredited attestation) |
| GET | `/api/v1/deals/{id}/interests` | `api.getDealInterests` | owner: leads |
| PUT | `/api/v1/deals/{id}/interests/{iid}/status` | `api.updateLeadStatus` | NEW/CONTACTED/COMMITTED/PASSED |
| GET | `/api/v1/deals/my-interests` | `api.getMyInterests` | deals I'm interested in |
| GET/POST | `/api/v1/deals/{id}/documents` | `api.getDealDocuments`/`addDealDocument` | link-based docs |
| DELETE | `/api/v1/deals/{id}/documents/{docId}` | `api.deleteDealDocument` | |
| GET | `/api/v1/deals/{id}/sponsor-projects` | `api.getDealSponsorProjects` | track record on detail page |
| GET/POST | `/api/v1/sponsor/projects` | `api.getMySponsorProjects`/`createSponsorProject` | my track record |
| PUT/DELETE | `/api/v1/sponsor/projects/{id}` | `api.updateSponsorProject`/`deleteSponsorProject` | |
| GET | `/api/v1/deals/support/{userId}` | `api.supportGetDeals` | **CARE/ADMIN**, audited |

DB tables: `deals`, `deal_interests`, `deal_documents`, `deal_watches`, `sponsor_projects`.

## Business Financials — `business-financials-service` (8085)

| Method | Path | UI |
|---|---|---|
| GET | `/api/v1/business/connection` | `api.getBusinessConnection` |
| GET | `/api/v1/business/dashboard` | `api.getBusinessDashboard` |
| GET | `/api/v1/business/pnl?period=` | `api.getBusinessPnl` |
| GET | `/api/v1/business/invoices` / `/expenses` | `api.getBusinessInvoices`/`getBusinessExpenses` |
| POST | `/api/v1/business/connect` / `/sync` | `api.connectBusiness`/`syncBusiness` |

DB table: `qbo_connections`. Provider: `BusinessDataProvider` (mock; real = QuickBooks OAuth2).

## AI Insights — `ai-insights-service` (8086)

| Method | Path | UI |
|---|---|---|
| GET | `/api/v1/ai/insights` | `api.getInsights` |
| POST | `/api/v1/ai/insights/refresh` | `api.refreshInsights` |
| POST | `/api/v1/ai/chat` | `api.chatWithAssistant` |

DB table: `insights`. Provider: `AiProvider` (mock; real = Claude/OpenAI).

## Payments / Bill Pay — `payment-service` (8087)

| Method | Path | UI | Notes |
|---|---|---|---|
| GET | `/api/v1/payments/bill-pay-intents` | `api.getPaymentIntents` | list |
| POST | `/api/v1/payments/bill-pay-intents` | `api.createBillPayIntent` | idempotent |
| GET | `/api/v1/payments/bill-pay-intents/{id}` | — | read |
| POST | `/api/v1/payments/bill-pay-intents/{id}/cancel` | `api.cancelBillPayIntent` | cancel |
| GET | `/api/v1/payments/support/{userId}/bill-pay-intents` | `api.supportGetPayments` | **CARE/ADMIN**, audited |
| POST | `/api/v1/payments/webhook` _(public)_ | — | Stripe webhook (⚠️ no signature verify) |

DB table: `bill_pay_intents`. Provider: `PaymentProvider` (mock; real = Stripe).

## Notifications — `notification-service` (8088)

| Method | Path | UI |
|---|---|---|
| GET | `/api/v1/notifications` | `api.getNotifications` |
| GET/PUT | `/api/v1/notifications/preferences` | `api.getNotificationPreferences`/`putNotificationPreferences` |
| POST | `/api/v1/notifications/test` | `api.testNotification` |
| POST | `/api/v1/notifications/{id}/read` | `api.markNotificationRead` |
| GET | `/api/v1/notifications/templates` | — | template list |
| POST | `/api/v1/notifications/send` | — | orchestrated multi-channel send |

DB tables: `notifications`, `notification_preferences`, `message_template`. Channel router selects
provider by config (in-app real; email/SMS/push mock).

## Platform Config / Content — `platform-config-service` (8089)

| Method | Path | UI |
|---|---|---|
| GET | `/api/v1/config/app?platform=` | (remoteConfig.js) |
| GET | `/api/v1/config/flags` | (remoteConfig.js) |
| GET | `/api/v1/content/disclaimers?keys=&locale=` | (contentClient.js) |
| POST | `/api/v1/content/disclaimers/accept` | (contentClient.js) |

DB tables: `app_module/section/setting`, `feature_flag`, `disclaimer`, `disclaimer_acceptance`.

## Audit — `audit-service` (8090)

| Method | Path | UI | Notes |
|---|---|---|---|
| POST | `/api/v1/audit/events` | — | **internal key** (`X-Internal-Key`) — gateway/services ingest |
| GET | `/api/v1/audit/me?page=&size=` | `api.getMyActivity` | the signed-in user's own activity |
| GET | `/api/v1/audit/stats?days=` | `api.getAuditStats` | **ADMIN/CARE** — KPI dashboard |
| GET | `/api/v1/audit/users/{userId}` | (via support) | **ADMIN** / internal key |
| GET | `/api/v1/audit/events?userId=&action=&from=&to=` | — | **ADMIN** filtered search |

DB table: `audit_events`.

---

## Standard error shape
Non-2xx responses return JSON; the gateway returns its own error envelope for downstream failures.
A `401/403` triggers client-side token clear + redirect to login. The gateway audit filter records
the request regardless of outcome.
