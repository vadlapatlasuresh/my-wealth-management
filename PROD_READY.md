# PROD-READY — Keys & Go-Live Playbook

**One place that lists every key the app needs, how to get each one, and the exact steps to turn each feature on in production.**

- **Live URL:** https://app.terravest.app · **Host:** GCP VM `terravest-prod` (`34.139.32.148`) · **Stack:** Docker Compose (11 Spring services + Caddy) + self-hosted Postgres.
- **Golden rule:** every third-party integration **defaults to a working offline mock**. The app is fully usable with everything off. You go live one feature at a time by setting a **toggle flag + its key(s)** and restarting that one service.
- **Companion docs (deeper detail):** [`DOCUMENTATION/06-APIS-AND-KEYS.md`](DOCUMENTATION/06-APIS-AND-KEYS.md) · [`DOCUMENTATION/00-GO-LIVE-TODO.md`](DOCUMENTATION/00-GO-LIVE-TODO.md) · [`finance-mvp/OPERATIONS_RUNBOOK.md`](finance-mvp/OPERATIONS_RUNBOOK.md) · [`finance-mvp/.env.prod.example`](finance-mvp/.env.prod.example) · [`finance-mvp/docs/SECRETS_HOWTO.md`](finance-mvp/docs/SECRETS_HOWTO.md).

> 🔒 **Never commit `.env.prod`, real keys, or the JWT secret.** They live **only on the VM** (`/home/deploy/my-wealth-management/finance-mvp/.env.prod`, gitignored) and, for provider keys, inside the KMS-encrypted **secrets-service** store.

---

## How "mock → real" works (read this once)

Each real provider is a Spring bean gated by `@ConditionalOnProperty`. It activates **only** when its toggle flag is set to the real value **and** the key is present. If the flag is off, the key is blank, or a live call errors, the service falls back to the deterministic mock and logs `falling back to mock` — so a misconfig never silently pretends to work. (Email/SMS/push instead return an explicit failure.)

**Two places a value can live:**
1. **Toggle flags & bootstrap config** → `.env.prod` on the VM (read at boot).
2. **Provider secret values** → the **secrets-service store** (KMS-encrypted). You put the value in `.env.prod` **temporarily**, run `deploy/seed-secrets.sh` to push it into the store, and the service loads it at boot via `secrets-client`. (Or set one secret interactively with `deploy/rotate-secret.sh <name>` without ever writing it to a file.)

---

## Part A — How any change goes live (the deploy loop)

```
merge to main  →  CI builds + pushes images to GHCR (must be GREEN)  →  one-click deploy  →  verify
```

1. **Merge the PR to `main`.** GitHub Actions (`.github/workflows/ci.yml`) builds & tests all services and, **only if green**, pushes `wealth-*` images to GHCR (`:sha` + `:latest`).
   - ⚠️ A single failing service test **skips the image build** → your deploy ships a stale image. Always confirm the main run is green first: `gh run list --branch main`.
2. **One-click deploy:** GitHub → Actions → **CI** → **Run workflow** (input `tag=latest`), or `gh workflow run ci.yml --ref main -f tag=latest`. This SSHes to the VM, does `git reset --hard origin/main`, and runs `deploy/deploy.sh` (pulls images, **rebuilds the web SPA**, restarts, waits-for-healthy).
3. **Verify:** `curl -s -o /dev/null -w '%{http_code}' https://app.terravest.app/` → `200`, plus the feature's acceptance test below.

**Changing only a toggle/key (no code):** edit `.env.prod` on the VM (and/or run `seed-secrets.sh`), then restart just that service:
```bash
cd /home/deploy/my-wealth-management/finance-mvp
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --force-recreate <service>
```
> Frontend/UI changes require the SPA rebuild — use `bash deploy/deploy.sh`, not a plain `up -d` (that's backend-only).

---

## Part B — Bootstrap secrets (REQUIRED — the stack won't run correctly without these)

These are TerraVest's own secrets, not third-party. Generate each with the command shown and set it in `.env.prod`. Several services **fail fast at boot** if these are blank/weak in prod.

| Var | Powers | Generate |
|---|---|---|
| 🔒 `JWT_SECRET` | Login-token signing — **identical across ALL services** | `openssl rand -base64 48` |
| 🔒 `APP_ENCRYPTION_KEY` | AES key for Plaid tokens + SSN/EIN at rest (auth + account-aggregation refuse to boot without it) | `openssl rand -base64 32` |
| 🔒 `AUDIT_INGEST_KEY` | Internal key services present to write audit events | `openssl rand -base64 32` |
| 🔒 `NOTIFICATIONS_INTERNAL_KEY` | Internal key: real-estate → notification (Deal Room leads) | `openssl rand -base64 32` |
| 🔒 `SECRETS_INTERNAL_KEY` | Internal key services present to read the secret store | `openssl rand -base64 32` |
| 🔒 `SECRETS_KMS_KEY_NAME` | KEK for the store in **GCP KMS** (recommended). Set `SECRETS_PROVIDER=kms`; leave `SECRETS_MASTER_KEY` blank | `terraform -chdir=finance-mvp/infra/gcp output -raw secrets_kms_key_name` |
| 🔒 `SECRETS_MASTER_KEY` | KEK source **only if** `SECRETS_PROVIDER=local` (dev/interim) | `openssl rand -base64 32` |
| 🔒 `POSTGRES_PASSWORD` | Self-hosted Postgres superuser password (all per-service DBs) | `openssl rand -base64 24` |

**Deploy/hosting config (not secret):** `GHCR_OWNER`, `TAG`, `API_DOMAIN`, `ACME_EMAIL`, `WEB_API_BASE`, `WEB_ORIGINS`.

> Full annotated template with every variable: [`finance-mvp/.env.prod.example`](finance-mvp/.env.prod.example).

---

## Part C — Feature-by-feature go-live playbook

Each block: **what it powers → how to get the key → env vars → enable & verify.** Do them in any order; each is independent.

### 1. Plaid — bank & investment account linking 🔴 (highest value)
- **Powers:** Link accounts, balances, transactions (account-aggregation-service). *Plaid is deliberately not mocked — linking 502s until a key (even free sandbox) is set.*
- **Get the key:** Sign up at **dashboard.plaid.com** → **Team Settings → Keys**. Copy `client_id` and the **Sandbox** secret (instant). For real banks, request **Production** access (Plaid runs a compliance review) → use the Production secret + `PLAID_ENV=production`.
- **Env vars:** `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV=sandbox|production`. Webhook hardening (optional): `PLAID_WEBHOOK_VERIFY=true`.
- **Enable:** put values in `.env.prod` → `bash deploy/seed-secrets.sh` → restart `account-aggregation-service`.
- **Verify:** in the app, Link an account → accounts + transactions populate (Sandbox creds: user `user_good` / pass `pass_good`).

### 2. AI insights & chat — Google Gemini *or* Anthropic Claude
- **Powers:** AI insights + chat (ai-insights-service).
- **Get the key:**
  - **Gemini (free tier):** **aistudio.google.com** → **Get API key**. Model `gemini-2.5-flash` is validated.
  - **Anthropic:** **console.anthropic.com** → **API Keys** → **Create Key**.
- **Env vars:** `AI_PROVIDER=gemini` + `GEMINI_API_KEY` (+ `GEMINI_MODEL`) — or — `AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` (+ `AI_MODEL`).
- **Enable:** set in `.env.prod` → `seed-secrets.sh` → restart `ai-insights-service`.
- **Verify:** open AI insights / chat → responses are grounded in your data (not the canned mock).

### 3. Email (OTP / notifications) — SendGrid 🔴 (needed to hide OTP codes)
- **Powers:** Email OTP + notification emails (notification-service).
- **Get the key:** **sendgrid.com** → **Settings → API Keys → Create** (Restricted "Mail Send" is enough). Then **Settings → Sender Authentication** → verify a **Single Sender** (fast) or, for deliverability, authenticate the **domain** (SPF/DKIM).
- **Env vars:** `COMMS_PROVIDER_EMAIL=sendgrid`, `SENDGRID_API_KEY`, `SENDGRID_FROM=<verified sender>`.
- **Enable:** set in `.env.prod` → `seed-secrets.sh` → restart `notification-service` (+ ensure `auth-service` has `NOTIFICATION_URI=http://notification-service:8080`).
- **Verify:** trigger a login → the OTP arrives by email. **Then flip the security gate** (Part D).

### 4. SMS (OTP) — Twilio *(optional; email already covers OTP)*
- **Get the key:** **console.twilio.com** → copy **Account SID** + **Auth Token** → buy a phone number (**Phone Numbers → Buy a number**) or create a Messaging Service.
- **Env vars:** `COMMS_PROVIDER_SMS=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM=<your Twilio number>`.
- **Enable:** `.env.prod` → `seed-secrets.sh` → restart `notification-service`.
- **Verify:** choose SMS MFA → code arrives by text.

### 5. Payments / bill pay — Stripe
- **Get the key:** **dashboard.stripe.com** → **Developers → API keys** → **Secret key** (`sk_live_…` / `sk_test_…`). Then **Developers → Webhooks → Add endpoint** (`https://app.terravest.app/api/v1/payments/webhook`) → copy the **Signing secret** (`whsec_…`).
- **Env vars:** `PAYMENT_PROVIDER=stripe`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
- **Enable:** `.env.prod` → `seed-secrets.sh` → restart `payment-service`.
- **Verify:** a bill-pay intent creates a real Stripe PaymentIntent; a signed webhook updates status; a forged webhook is rejected.

### 6. Real-estate valuations — RentCast
- **Get the key:** **app.rentcast.io** → sign up → **API** → copy API key (free tier ~50 calls/mo).
- **Env vars:** `REALESTATE_PROVIDER=rentcast`, `REALESTATE_PROVIDER_API_KEY` (base URL defaults to `https://api.rentcast.io/v1`).
- **Enable:** `.env.prod` → `seed-secrets.sh` → restart `real-estate-service`.
- **Verify:** revalue a property → real AVM/rent values (no mock fallback in logs).

### 7. Business financials — QuickBooks Online (OAuth2)
- **Get the key:** **developer.intuit.com** → **Create an app** (Accounting scope) → **Keys & credentials** → copy **Client ID** + **Client Secret** (Development vs Production sets). Add the **Redirect URI** `https://app.terravest.app/api/v1/business/oauth/callback`.
- **Env vars:** `BUSINESS_PROVIDER=quickbooks`, `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_ENVIRONMENT=sandbox|production`, `QBO_API_BASE_URL`, `QBO_REDIRECT_URI`, `APP_WEB_URL=https://app.terravest.app`.
- **Enable:** `.env.prod` → `seed-secrets.sh` → restart `business-financials-service`.
- **Verify:** connect a QBO (sandbox) company → real P&L / invoices / expenses; token refresh works.

### 8. Push notifications — Firebase Cloud Messaging (FCM)
- **Get the key:** **console.firebase.google.com** → your project → **Project settings → Cloud Messaging**. (The legacy server key is deprecated — prefer an FCM **HTTP v1** service-account JSON.)
- **Env vars:** `COMMS_PROVIDER_PUSH=fcm`, `FCM_SERVER_KEY` (or service-account creds).
- **Enable:** `.env.prod` → `seed-secrets.sh` → restart `notification-service`.
- **Verify:** a registered device receives a push.

### 9. Social sign-in — Google / Apple *(button auto-appears when keyed)*
- **Get the key:**
  - **Google:** **console.cloud.google.com** → **APIs & Services → Credentials → Create OAuth client ID → Web application**. Add **Authorized JavaScript origin** `https://app.terravest.app`. Copy the **Client ID**.
  - **Apple:** **developer.apple.com** → **Identifiers → Services IDs** → enable **Sign in with Apple** → configure domains/redirect.
- **Env vars:** `GOOGLE_OAUTH_CLIENT_ID`, `APPLE_OAUTH_CLIENT_ID`.
- **Enable:** set in `.env.prod` → restart `auth-service`. *(No web rebuild needed — the SPA reads `GET /api/v1/auth/oauth/config` at runtime, so the button appears automatically.)*
- **Verify:** the Google/Apple button shows on the login screen and completes sign-in.

### 10. Address autocomplete — Google Maps Places *(build-time key)*
- **Get the key:** **console.cloud.google.com** → enable **Places API** → **Create API key** → restrict to your web origin.
- **Env var:** `VITE_GOOGLE_MAPS_API_KEY` (baked into the SPA at build time).
- **Enable:** set in `.env.prod` → **run `bash deploy/deploy.sh`** (rebuilds the web bundle).
- **Verify:** address fields autocomplete instead of manual entry.

### 11. Login-history location — MaxMind GeoLite2 *(offline, no API calls — new)*
- **Powers:** City/country next to each entry in **Security → Login history / Active sessions** (audit-service). Off by default → shows the raw IP.
- **Get the DB:** **maxmind.com** → free account → **Manage License Keys → Generate** → download **`GeoLite2-City.mmdb`**. Copy the file onto the VM (e.g. `/home/deploy/geoip/GeoLite2-City.mmdb`, ~60 MB, not in git).
- **Env vars:** `GEOIP_ENABLED=true`, `GEOIP_DB_PATH=/path/to/GeoLite2-City.mmdb` (mount the file into the audit-service container if using compose).
- **Enable:** set in `.env.prod` → restart `audit-service`.
- **Verify:** sign in from a public IP → the login-history row shows a city/country instead of the IP.

---

## Part D — Security gate BEFORE any real user 🔴

Do **not** onboard real users until these are done (see `DOCUMENTATION/00-GO-LIVE-TODO.md` Phase 1):

- **[ ] Real OTP delivery on + dev code OFF.** After SendGrid (and/or Twilio) is live, set **`OTP_EXPOSE_DEV_CODE=false`**. While `true`, OTP codes are returned in API responses → MFA is bypassable. Turn the provider on **and** this off together.
- **[ ] Bootstrap secrets are strong & unique** (`JWT_SECRET`, `APP_ENCRYPTION_KEY`, …) — never the public demo values. Fail-fast guards enforce this in prod.
- **[ ] CORS locked** to the real web origin (`WEB_ORIGINS`, no `*`); CSP/security headers active (already shipped).
- **[ ] Rotate any secret that ever touched git/chat** before holding real financial data.
- **[ ] Legal:** Terms, Privacy Policy, disclaimers, and the third-party processor list, accepted at signup.

---

## Part E — Current status snapshot (keep updated)

Provider keys are centralized in the KMS store, so a local `.env.prod` copy may read blank even when a provider is live on the VM. Source of truth = the VM + `DOCUMENTATION/00-GO-LIVE-TODO.md`.

| Feature | Provider | Status | Notes |
|---|---|---|---|
| Bank linking | Plaid | 🟢 Live (sandbox) | Production access gated on Plaid review |
| AI insights/chat | Gemini | 🟢 Live | Anthropic swappable anytime |
| Email OTP | SendGrid | 🟢 Live | Single-sender; domain SPF/DKIM still TODO |
| Security store KEK | GCP KMS | 🟢 Live | `SECRETS_PROVIDER=kms` |
| SMS OTP | Twilio | ⚪ Mock | Optional — email covers OTP |
| Payments | Stripe | ⚪ Mock | Needs webhook signature verify |
| Real-estate AVM | RentCast | ⚪ Mock | |
| Business P&L | QuickBooks | ⚪ Mock | OAuth redirect + refresh |
| Push | FCM | ⚪ Mock | Migrate to HTTP v1 |
| Social login | Google/Apple | ⚪ Off | Button hidden until keyed |
| Address autocomplete | Google Maps | ⚪ Off | Build-time key |
| Login-history location | MaxMind GeoLite2 | ⚪ Off | Ship the `.mmdb` to enable |

Legend: 🟢 live · ⚪ mock/off.

---

## Part F — Secret store commands (on the VM, from `finance-mvp/`)

```bash
# Push ALL provider values currently in .env.prod into the encrypted store (idempotent):
bash deploy/seed-secrets.sh

# Set/rotate ONE secret interactively (value hidden, never written to a file or history):
bash deploy/rotate-secret.sh plaid.secret        # or sendgrid.api_key, gemini.api_key, ...

# Restart the one service that consumes it (secrets-client fetches once, at boot):
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --force-recreate <service>
```

Secret names map 1:1 to their env var (lower-dotted): `GEMINI_API_KEY` → `gemini.api_key`, `STRIPE_SECRET_KEY` → `stripe.secret_key`, etc. Every read/write/rotate is recorded in the tamper-evident audit chain. Deep dive: [`finance-mvp/docs/SECRETS_HOWTO.md`](finance-mvp/docs/SECRETS_HOWTO.md).

---

*Keep this file current: when you turn a provider on, flip its row in Part E and check its box in `DOCUMENTATION/00-GO-LIVE-TODO.md`.*
