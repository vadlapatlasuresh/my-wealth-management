# TerraVest — Operations & Configuration Runbook

> **Audience:** you (the owner), future-you, and anyone you hand this to.
> **Goal:** one document that explains *what we built*, *what is live*, *every external API
> and configuration we use*, and *how to do everything yourself* — step by step.

**Live app:** https://app.terravest.app
**Last verified:** 2026-06-09 (full feature test below — all core flows green)

---

## 0. The 60-second mental model

- **One GCP VM** runs the whole backend as **Docker containers** (11 Java services + a Caddy
  web server). **Caddy** serves the website *and* forwards `/api` calls to the backend, and it
  auto-issues the HTTPS certificate.
- **Neon** (cloud Postgres) holds the data — **one database per service**.
- **Code lives on GitHub.** Push to `main` → GitHub builds container images → you click one
  button ("Run workflow") → the VM pulls the new images and restarts. That's a deploy.
- **Every paid integration (Plaid, Stripe, AI, email, SMS…) is OFF by default and uses a
  built-in "mock".** The app works fully without spending a cent. You turn each one on later by
  pasting its key into one file (`.env.prod`) and redeploying. Nothing in the code changes.

If you remember only that, you can operate this app.

---

## 1. What we built (the product)

A wealth-management platform aimed at self-employed people and real-estate owners. Features:

| Area | What it does | Service behind it |
|---|---|---|
| **Auth & accounts** | Sign up, log in, JWT sessions, MFA, encrypted SSN/EIN | auth-service |
| **Account aggregation** | Link bank/investment accounts, balances, transactions | account-aggregation-service |
| **Net worth & dashboard** | Consolidated net worth, cash flow, snapshot | financial-core-service |
| **Real estate** | Track properties, valuations, **Deal Room** (sponsor marketplace) | real-estate-service |
| **Business financials** | P&L, invoices, expenses (connect QuickBooks) | business-financials-service |
| **AI insights** | Personalized financial insights + chat | ai-insights-service |
| **Payments / bill pay** | Bill-pay intents, subscription billing | payment-service |
| **Notifications** | Email / SMS / push / in-app | notification-service |
| **Planning** | Goals, debt-payoff scenarios | financial-core-service |
| **Platform config** | Feature flags, disclaimers, marketing copy | platform-config-service |
| **Audit log** | Records logins, registrations, financial actions | audit-service |
| **Gateway** | Single entry point, routing, auth, CORS | api-gateway |

---

## 2. The 12 services (ports are internal to the VM)

| # | Service | Port | Talks to (external) |
|---|---|---|---|
| 1 | api-gateway | 8080 | — (routes everything) |
| 2 | auth-service | 8081 | — |
| 3 | account-aggregation-service | 8082 | **Plaid** |
| 4 | financial-core-service | 8083 | — |
| 5 | real-estate-service | 8084 | **RentCast** |
| 6 | business-financials-service | 8085 | **QuickBooks Online** |
| 7 | ai-insights-service | 8086 | **Anthropic Claude / Google Gemini** |
| 8 | payment-service | 8087 | **Stripe** |
| 9 | notification-service | 8088 | **SendGrid / Twilio / Firebase** |
| 10 | platform-config-service | 8089 | — |
| 11 | audit-service | 8090 | — |
| 12 | web (React) | served by Caddy | **Google Maps Places** (optional) |

---

## 3. Where everything lives (the map)

| Thing | Location |
|---|---|
| **Live URL** | https://app.terravest.app (apex `terravest.app` + `www` redirect here) |
| **Server (VM)** | GCP Compute Engine `terravest-prod`, IP `34.139.32.148`, region us-east1 |
| **Database** | Neon Postgres (cloud) — one DB per service (`auth_db`, `financial_core_db`, …) |
| **Container images** | GitHub Container Registry (GHCR), **private** |
| **Code** | GitHub repo `vadlapatlasuresh/my-wealth-management`, branch `main` |
| **Infra-as-code** | `finance-mvp/infra/gcp/` (Terraform — recreates the VM from scratch) |
| **Prod compose file** | `finance-mvp/docker-compose.prod.yml` |
| **Web/Caddy config** | `finance-mvp/Caddyfile` |
| **Deploy script** | `finance-mvp/deploy/deploy.sh` (runs on the VM) |
| **Secrets (the one file)** | `finance-mvp/.env.prod` — **lives only on the VM**, never in git |
| **DNS / domain** | Cloudflare (registrar + DNS). `app` A-record → VM IP, DNS-only/grey-cloud |
| **SSH key to VM** | `~/.ssh/terravest_deploy` (user `deploy`) |

---

## 4. External APIs — the complete list

**All of these default to a built-in mock.** The app is fully usable with every one of them
off. Each row tells you the **exact switch** to flip in `.env.prod` to go live. Blank key = mock.

| Provider | Powers | Turn it ON by setting (in `.env.prod`) | Status today |
|---|---|---|---|
| **Plaid** | Bank/investment linking | `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV` (sandbox→production) | Mock |
| **RentCast** | Property valuations | `REALESTATE_PROVIDER=rentcast`, `REALESTATE_PROVIDER_API_KEY` | Mock |
| **QuickBooks Online** | Business P&L/invoices | `BUSINESS_PROVIDER=quickbooks`, `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REDIRECT_URI`, `QBO_ENVIRONMENT` | Mock |
| **Stripe** | Bill pay / billing | `PAYMENT_PROVIDER=stripe`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Mock |
| **Anthropic Claude** | AI insights & chat | `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, `AI_MODEL` | Mock |
| **Google Gemini** | AI insights & chat (alt) | `AI_PROVIDER=gemini`, `GEMINI_API_KEY`, `GEMINI_MODEL` | Mock |
| **SendGrid** | Email | `COMMS_PROVIDER_EMAIL=sendgrid`, `SENDGRID_API_KEY`, `SENDGRID_FROM` (verified sender) | Mock |
| **Twilio** | SMS | `COMMS_PROVIDER_SMS=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | Mock |
| **Firebase (FCM)** | Push notifications | `COMMS_PROVIDER_PUSH=fcm`, `FCM_SERVER_KEY` | Mock |
| **Google Maps Places** | Address autocomplete (web) | `VITE_GOOGLE_MAPS_API_KEY` (build-time, web only) | Off (manual entry) |

**How the mock/real switch works (so you trust it):** each real provider is a Spring bean
annotated `@ConditionalOnProperty` — it only activates when its flag is set. If the flag is
unset *or* the key is blank *or* the live call errors, the service falls back to a deterministic
mock and **logs a warning** ("falling back to mock"). It never silently pretends a real email
was sent — email/SMS/push return an explicit failure if misconfigured. So you'll always know.

---

## 5. Every environment variable in `.env.prod`

This single file on the VM is the entire production configuration. Grouped by purpose.
**🔒 = secret.** Generate secrets with the commands shown.

### Core / shared (required)
| Var | Notes |
|---|---|
| `GHCR_OWNER` | GitHub user that owns the images (`vadlapatlasuresh`) |
| `TAG` | Image version to run (`latest` or a git SHA) |
| `API_DOMAIN` | `app.terravest.app` (Caddy issues the cert for this) |
| `ACME_EMAIL` | Email for Let's Encrypt |
| `WEB_API_BASE` | Public origin the browser calls — `https://app.terravest.app` |
| `WEB_ORIGINS` | Allowed CORS origins — `https://app.terravest.app` (no wildcard in prod) |
| 🔒 `JWT_SECRET` | Shared login-token key, **must be identical across all services**. `openssl rand -base64 48` |
| 🔒 `APP_ENCRYPTION_KEY` | Encrypts Plaid tokens + SSN/EIN at rest. `openssl rand -base64 32` |
| 🔒 `AUDIT_INGEST_KEY` | Internal key so services can write audit events. `openssl rand -base64 32` |
| 🔒 `NOTIFICATIONS_INTERNAL_KEY` | Internal key for Deal Room → notifications. `openssl rand -base64 32` |

### Database — one set per service (🔒 all secret)
For each of the 10 services there are three vars: `<X>_DATABASE_URL`, `<X>_DATABASE_USER`,
`<X>_DATABASE_PASSWORD`, where `<X>` is one of:
`AUTH`, `AGG`, `CORE`, `RE`, `BIZ`, `AI`, `PAY`, `NOTIF`, `CONFIG`, `AUDIT`.
(Each points at its own Neon database — never share one DB across services.)

### Provider keys (all optional — blank = mock)
See the table in §4 for which vars belong to which provider. They are all in the same file.

### Tuning (optional, has sane defaults)
| Var | Default | Notes |
|---|---|---|
| `SVC_MEM_LIMIT` | `600M` | Memory per container — lower it on a small host |
| `JVM_OPTS` | `-XX:MaxRAMPercentage=55 -XX:+UseSerialGC` | JVM memory/GC |
| `SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE` | `5` | DB connections per service (cap for Neon) |

> The committed template with all names is `finance-mvp/.env.prod.example`. Copy it to
> `.env.prod` and fill in values. **`.env.prod` is gitignored — never commit it.**

---

## 6. Live feature test — what passed (2026-06-09)

Run against https://app.terravest.app. All authenticated via a real signup → JWT.

| Check | Result |
|---|---|
| Website loads (`GET /`) | ✅ 200 |
| Gateway health (`/actuator/health`) | ✅ 200 |
| Register (`POST /api/v1/auth/register`) | ✅ 200 + token |
| Login (`POST /api/v1/auth/login`) | ✅ 200 + token |
| Accounts (`/api/v1/aggregation/accounts`) | ✅ 200 |
| Net worth (`/api/v1/me/snapshot`) | ✅ 200 |
| Properties (`/api/v1/real-estate`) | ✅ 200 |
| Business dashboard / P&L (`/api/v1/business/dashboard`, `/pnl`) | ✅ 200 |
| Bill pay (`/api/v1/payments/bill-pay-intents`) | ✅ 200 |
| AI insights (`/api/v1/ai/insights`) | ✅ 200 |
| Planning goals (`/api/v1/planning/goals`) | ✅ 200 |
| Notifications (`/api/v1/notifications`) | ✅ 200 |
| Feature flags (`/api/v1/config/flags`) | ✅ 200 |
| Deal Room marketplace (`/api/v1/deals/marketplace`) | ✅ 200 |
| Disclaimers (`/api/v1/content/disclaimers`) | ⚠️ was 500 → **fixed in code** (see §7), needs a deploy |

**Verdict:** every core money/feature flow works in production. One content endpoint
(disclaimers) had a database-mapping bug, now fixed in code; it ships on the next deploy.

### How to re-run this test yourself
```bash
BASE=https://app.terravest.app
EMAIL="me$(date +%s)@terravest.app"
# 1) register and grab a token
TOKEN=$(curl -s -X POST $BASE/api/v1/auth/register -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"Test1234!\",\"firstName\":\"A\",\"lastName\":\"B\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))")
# 2) hit any feature (repeat for others)
curl -s -o /dev/null -w "accounts=%{http_code}\n" -H "Authorization: Bearer $TOKEN" $BASE/api/v1/aggregation/accounts
curl -s -o /dev/null -w "networth=%{http_code}\n" -H "Authorization: Bearer $TOKEN" $BASE/api/v1/me/snapshot
```

---

## 7. Known issue fixed in this pass

**Disclaimers endpoint returned HTTP 500.**
- **Cause:** `Disclaimer.bodyMarkdown` was annotated `@Lob`, but the DB column `body_markdown`
  is Postgres `TEXT`. On Postgres, `@Lob String` makes Hibernate use the *Large Object* (`oid`)
  API, which can't read a plain `TEXT` column → 500 on every read.
- **Fix:** removed `@Lob`, mapped the field with `@Column(columnDefinition = "text")` to match the
  migration. File: `apps/platform-config-service/.../content/Disclaimer.java`.
- **To make it live:** deploy (§8). No data migration needed.

---

## 8. How to deploy a change (the everyday loop)

1. Make your code change locally, commit, and push to a branch.
2. Open a PR to `main` and merge it (or push to `main` if you own it).
3. GitHub Actions automatically **builds and pushes** new container images to GHCR.
4. Go to **GitHub → Actions → CI → "Run workflow"** (the `workflow_dispatch` button), leave
   `tag` as `latest`, and run it. This SSHes into the VM and runs `deploy/deploy.sh`, which:
   - pulls the new images,
   - rebuilds the website,
   - restarts the stack,
   - waits until everything is healthy.
5. Verify: open https://app.terravest.app and/or re-run the test in §6.

**Manual deploy (if you ever need it), from your laptop:**
```bash
ssh -i ~/.ssh/terravest_deploy deploy@34.139.32.148
cd finance-mvp
./deploy/deploy.sh          # uses TAG from .env.prod
```

---

## 9. How to turn ON a real integration (general recipe)

Example: enabling **Stripe**. Same shape for any provider in §4.

1. Create an account with the provider, get the API key(s).
2. SSH to the VM and edit the secrets file:
   ```bash
   ssh -i ~/.ssh/terravest_deploy deploy@34.139.32.148
   cd finance-mvp
   nano .env.prod
   ```
3. Set the switch + key(s) from §4, e.g.:
   ```
   PAYMENT_PROVIDER=stripe
   STRIPE_SECRET_KEY=sk_live_xxx
   STRIPE_WEBHOOK_SECRET=whsec_xxx
   ```
4. Apply:
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.prod up -d payment-service
   ```
5. Test the feature, then check the logs for any `falling back to mock` warning (means a key is
   wrong):
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.prod logs --tail=50 payment-service
   ```

**Provider-specific notes:**
- **Plaid:** start with `PLAID_ENV=sandbox` and Plaid *sandbox* keys; switch to `production` keys
  + `PLAID_ENV=production` only after you're approved for production access.
- **QuickBooks:** you must register the **redirect URI** (`QBO_REDIRECT_URI`) in the Intuit
  developer portal exactly as set here; users connect via an OAuth "Connect" button.
- **SendGrid:** `SENDGRID_FROM` must be a *verified sender* or mail won't send.
- **Google Maps (web):** `VITE_GOOGLE_MAPS_API_KEY` is **build-time** — it only takes effect when
  the web app is rebuilt (the deploy script rebuilds the web each run).

---

## 10. How to rebuild the whole thing from scratch (disaster recovery)

Everything except the secrets and the database is in git, so the server is disposable.

1. **Provision a new VM** with Terraform:
   ```bash
   cd finance-mvp/infra/gcp
   cp terraform.tfvars.example terraform.tfvars   # set project, ssh user, pubkey path
   terraform init && terraform apply              # creates VM + static IP + firewall
   ```
2. **Point DNS** `app.terravest.app` A-record at the new VM IP (Cloudflare, grey-cloud).
3. **On the VM:** install Docker (the Terraform startup script does this), check out the repo,
   create `.env.prod` from `.env.prod.example`, fill in secrets + DB URLs.
4. **Log in to GHCR** so the VM can pull private images:
   ```bash
   echo $GHCR_PAT | docker login ghcr.io -u vadlapatlasuresh --password-stdin
   ```
5. **Deploy:** `./deploy/deploy.sh`. Caddy auto-issues the HTTPS cert. Done.

The **database** is on Neon and survives VM loss. To recreate Neon from zero: create one
database per service, put their connection strings in `.env.prod`; Flyway runs the migrations
automatically on first start.

---

## 11. Gotchas burned in (don't relearn the hard way)

- **NEVER edit a Flyway migration that has already been applied.** Migrations are immutable.
  Editing an applied file changes its checksum, and on the next deploy Flyway fails validation
  and the service **crash-loops on startup** (every endpoint then 500s). To change schema later,
  always add a **new** migration (`V8__…`), never touch an old one. (This bit real-estate-service:
  `V5` was edited to rename a column `year`→`project_year` for the H2 test DB *after* prod had
  already run it; prod then had the old column name + old checksum. Recovery was a one-time DB
  correction on `real_estate_db`: `ALTER TABLE sponsor_projects RENAME COLUMN "year" TO
  project_year;` + `UPDATE flyway_schema_history SET checksum=<new> WHERE version='5';`. If you
  ever see "Migration checksum mismatch" in a service's logs, that's this.)
- **Container health = TCP check on :8080**, *not* `/actuator/health` — most services secure
  actuator and return 403, which would falsely look "unhealthy."
- **One database per service.** We tried schema-per-service; Postgres `currentSchema` was
  silently ignored and every service collided in `public`. Never go back to that.
- **`platform-config-service` runs `SPRING_JPA_HIBERNATE_DDL_AUTO=none`** — Hibernate's schema
  validation tripped on a `@Lob` vs `text` column (the §7 bug). With §7 fixed you *could* try
  re-enabling `validate`, but only after testing — leave it `none` unless you verify all entities.
- **`account-aggregation-service` requires `APP_ENCRYPTION_KEY`** or it won't start.
- **`.env.prod` never goes in git.** It's gitignored and lives only on the VM.
- **GHCR images are private.** The VM needs a classic PAT with `read:packages` to pull.
- **Caddy `handle` blocks are order-sensitive** — `/api/*` and `/actuator/*` must come *before*
  the SPA fallback, or API calls get rewritten to `index.html`.

---

## 11b. Real-user readiness — verified end-to-end (2026-06-09)

Every user journey was exercised against **live production** (real signup → JWT →
write data → read it back), plus the Playwright browser suite. Results:

**✅ Works end-to-end for real users right now (no keys needed):**
- **Onboarding**: email OTP → SMS OTP → KYC register → dashboard (browser test passes)
- **Returning login**: password → MFA challenge → verify → dashboard (browser test passes)
- **Profile** update + read-back, **account deletion**
- **Real estate**: add property → appears in list → revalue
- **Planning**: goals CRUD, debt add + payoff scenario, budgets
- **Investments**: link broker, add alternative investments
- **Deal Room**: create deal → marketplace, watch, express interest, sponsor track-record
- **Business**: manual business + accounts (create → list)
- **Notifications**: preferences update, test notification
- **AI**: chat + insights refresh (mock responses)
- **Audit**: read my activity

These cover all manual data-entry flows — a real user can sign up and use the
whole app meaningfully without any third-party keys.

**🔑 Gated on keys (expected — these need a provider account):**
- **Bank linking (Plaid)**: `POST /aggregation/link-token/create` calls the real
  Plaid API and 502s until `PLAID_CLIENT_ID`/`PLAID_SECRET` are set (even free
  *sandbox* keys work). We deliberately do NOT mock bank data. Knock-on effect:
  **bill-pay** needs a funding account, which needs a linked account — so bill-pay
  is also effectively Plaid-gated for a brand-new user.
- **Real email/SMS delivery**: OTP codes only reach users once SendGrid/Twilio keys
  are set (see the security gate below).
- **Real AI / card charges**: Anthropic / Stripe keys.

**🔴 SECURITY GATE before real users (do NOT skip):**
- OTP **dev codes are currently returned in API responses** in production
  (`otp.expose-dev-code=true`) — that's the only reason signup/MFA work without
  email/SMS keys. **Anyone can read the code and bypass MFA.** Before real users:
  set SendGrid/Twilio keys (so codes actually deliver) **and** turn off dev-code
  exposure (`otp.expose-dev-code=false`). These two go together.

**Minor robustness note (not user-facing):** `POST /planning/debt-scenarios/add`
returns 500 (DB not-null) instead of 400 if `apr` is omitted. The UI always sends
`apr`, so real users don't hit it; tighten validation when convenient.

## 12. Cost & "what's next" checklist

- **Today: ~$0.** VM is on the GCP $300 / 90-day free trial; Neon free tier; all paid APIs mocked.
- **When you onboard real users, in rough priority:**
  - [ ] **SECURITY: set SendGrid/Twilio keys + `otp.expose-dev-code=false`** (close the MFA-bypass gate — see §11b). Do this first.
  - [ ] Plaid keys (sandbox is free) — unlocks bank linking + bill-pay funding.
  - [ ] Stripe (if charging).
  - [ ] AI: `AI_PROVIDER=anthropic` + key (real insights instead of canned).
  - [ ] Decide host after the trial: keep GCP (downsize the VM) or move to Hetzner (cheapest).
- **Before taking real financial data:** review security headers/CSP in the `Caddyfile`, rotate
  all secrets, and confirm Neon backups are on.

---

*Maintained alongside the code. When you change an integration or a deploy step, update this file.*
