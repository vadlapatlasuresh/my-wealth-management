# 6. APIs and Keys

Two kinds of APIs:
1. **Internal APIs** — the endpoints TerraVest's own services expose (consumed by the web/mobile
   app through the gateway).
2. **External APIs** — third-party services TerraVest calls (Plaid, Stripe, AI, etc.), each
   gated behind a key and a mock fallback.

---

## 6.1 Internal APIs (TerraVest's own endpoints)

All client calls go to the **gateway** (`http://localhost:8080` locally,
`https://app.terravest.app` in prod) under `/api/v1/...`. Every route needs
`Authorization: Bearer <JWT>` unless marked _public_. Role-gated routes are marked CARE/ADMIN.

> **The complete, authoritative endpoint reference** (every method, traced UI → gateway →
> service → storage) is **[`docs/architecture/api-reference.md`](../docs/architecture/api-reference.md)**.
> Below is the orientation map.

| Area | Service (port) | Base path | Examples |
|---|---|---|---|
| Auth & profile | auth-service (8081) | `/api/v1/auth` | `register`, `login`, `mfa/verify`, `email/send`, `sms/send`, `me` (GET/PUT/DELETE) |
| Customer care (CARE/ADMIN) | auth-service (8081) | `/api/v1/support` | `users?query=`, `users/{id}`, `users/{id}/activity`, `users/{id}/roles` |
| Account aggregation | account-aggregation (8082) | `/api/v1/aggregation` | `link-token/create`, `public-token/exchange`, `accounts`, `transactions`, `transactions/{id}/category` |
| Net worth / planning | financial-core (8083) | `/api/v1/me`, `/api/v1/planning`, `/api/v1/budgets` | `me/snapshot`, `me/export`, `planning/goals`, `planning/debt-scenarios`, `budgets` |
| Real estate / Deal Room | real-estate (8084) | `/api/v1/real-estate`, `/api/v1/deals` | `real-estate`, `real-estate/{id}/revalue`, `deals/marketplace` |
| Business financials | business-financials (8085) | `/api/v1/business` | `business/dashboard`, `business/pnl`, `business/invoices`, `business/connect`, `business/oauth/callback` |
| AI insights | ai-insights (8086) | `/api/v1/ai` | `ai/insights`, `ai/chat` |
| Payments / bill pay | payment-service (8087) | `/api/v1/payments` | `payments/bill-pay-intents` |
| Notifications | notification (8088) | `/api/v1/notifications` | `notifications`, `notifications/preferences` |
| Platform config / content | platform-config (8089) | `/api/v1/config`, `/api/v1/content` | `config/flags`, `content/disclaimers` |
| Audit | audit-service (8090) | `/api/v1/audit` | `audit/me`, `audit/verify` |

**Auth flow nuance:** `POST /auth/login` step 1 returns `{mfaRequired, channel, destination,
devCode?}` and sends an OTP — no token yet. Then `POST /auth/mfa/verify {email,code}` returns
`{token, ...}`. `POST /auth/register` returns a `token` directly (auto-login). The UI method for
each endpoint lives in [`apps/web/src/api.js`](../finance-mvp/apps/web/src/api.js).

---

## 6.2 External APIs — the complete list

**Every external integration defaults to a built-in mock.** The app is fully usable with all of
them off. To go live, set the **toggle flag + key(s)** in `.env.prod` and restart the service
(see [05-WORKFLOWS.md](05-WORKFLOWS.md) §5). Blank key ⇒ mock.

| Provider | Powers | Service | Turn ON by setting (`.env.prod`) | Status today |
|---|---|---|---|---|
| **Plaid** | Bank/investment linking, transactions | account-aggregation | `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV` (sandbox→production) | Mock* |
| **RentCast** | Property valuations | real-estate | `REALESTATE_PROVIDER=rentcast`, `REALESTATE_PROVIDER_API_KEY` | Mock |
| **QuickBooks Online** | Business P&L/invoices (OAuth2) | business-financials | `BUSINESS_PROVIDER=quickbooks`, `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REDIRECT_URI`, `QBO_ENVIRONMENT` | Mock |
| **Stripe** | Bill pay / billing | payment | `PAYMENT_PROVIDER=stripe`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Mock |
| **Anthropic Claude** | AI insights & chat | ai-insights | `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, `AI_MODEL` | Mock |
| **Google Gemini** | AI insights & chat (alt) | ai-insights | `AI_PROVIDER=gemini`, `GEMINI_API_KEY`, `GEMINI_MODEL` | Mock |
| **SendGrid** | Email | notification | `COMMS_PROVIDER_EMAIL=sendgrid`, `SENDGRID_API_KEY`, `SENDGRID_FROM` (verified sender) | Mock |
| **Twilio** | SMS | notification | `COMMS_PROVIDER_SMS=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | Mock |
| **Firebase (FCM)** | Push notifications | notification | `COMMS_PROVIDER_PUSH=fcm`, `FCM_SERVER_KEY` | Mock |
| **Google Maps Places** | Address autocomplete (web) | web (build-time) | `VITE_GOOGLE_MAPS_API_KEY` | Off (manual entry) |
| **Google Cloud KMS** | KEK for the secret store | secrets-service | `SECRETS_PROVIDER=kms`, `SECRETS_KMS_KEY_NAME` (Terraform output) | Local key |

\* *Plaid bank data is deliberately **not** mocked — linking 502s until a key (even free sandbox)
is set.*

**How the mock/real switch works (so you can trust it):** each real provider is a Spring bean
annotated `@ConditionalOnProperty` — it only activates when its flag is set. If the flag is
unset, the key is blank, or the live call errors, the service falls back to the deterministic
mock and **logs a warning** (`falling back to mock`). Email/SMS/push return an explicit failure
if misconfigured — it never silently pretends a real message was sent.

---

## 6.3 Internal keys / secrets (not third-party)

These are TerraVest's own secrets. Generate with the command shown; **store only in `.env.prod`
on the VM** (gitignored). 🔒 = secret.

| Var | Purpose | Generate |
|---|---|---|
| 🔒 `JWT_SECRET` | Login-token signing key — **must be identical across all services** | `openssl rand -base64 48` |
| 🔒 `APP_ENCRYPTION_KEY` | AES key to encrypt Plaid tokens + SSN/EIN at rest (account-aggregation won't start without it) | `openssl rand -base64 32` |
| 🔒 `AUDIT_INGEST_KEY` | Internal key services present to write audit events | `openssl rand -base64 32` |
| 🔒 `NOTIFICATIONS_INTERNAL_KEY` | Internal key: real-estate → notification (Deal Room leads) | `openssl rand -base64 32` |
| 🔒 `SECRETS_INTERNAL_KEY` | Internal key services present to read from secrets-service | `openssl rand -base64 32` |
| 🔒 `SECRETS_MASTER_KEY` | KEK source when `SECRETS_PROVIDER=local` (use KMS in prod instead) | `openssl rand -base64 32` |
| 🔒 `<X>_DATABASE_PASSWORD` | Per-service Neon DB password (`X` = AUTH, AGG, CORE, RE, BIZ, AI, PAY, NOTIF, CONFIG, AUDIT, SECRETS) | from Neon |

**Database connection vars** (one set per service):
`<X>_DATABASE_URL`, `<X>_DATABASE_USER`, `<X>_DATABASE_PASSWORD`. Each points at its **own** Neon
database — never share one DB across services.

**Deploy / hosting vars:** `GHCR_OWNER`, `TAG`, `API_DOMAIN`, `ACME_EMAIL`, `WEB_API_BASE`,
`WEB_ORIGINS`. **Tuning (optional):** `SVC_MEM_LIMIT` (`600M`), `JVM_OPTS`,
`SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE` (`5`).

> The committed template with **every** variable name + inline notes is
> **[`finance-mvp/.env.prod.example`](../finance-mvp/.env.prod.example)** — copy it to
> `.env.prod` and fill values. The secret-store how-to is in
> [`finance-mvp/docs/SECRETS_HOWTO.md`](../finance-mvp/docs/SECRETS_HOWTO.md).

---

## 6.4 Where keys are stored (today vs. target)

- **Today:** all secrets live in a single `finance-mvp/.env.prod` file **on the VM only**
  (gitignored). The web build-time `VITE_*` keys are baked in when the web app is rebuilt.
- **Target (hardening):** move secrets into the **secrets-service** with the KEK in **Cloud KMS**
  (`SECRETS_PROVIDER=kms`), or Doppler. Rotate `JWT_SECRET`, `APP_ENCRYPTION_KEY`, and all
  provider keys before taking real financial data. See [04-ROADMAP-TO-LIVE.md](04-ROADMAP-TO-LIVE.md)
  Phase D.

> 🔒 **Never commit `.env.prod`, real keys, or the JWT secret to git.** The repo ships a public
> demo JWT secret for local dev only — do not reuse it in production.
