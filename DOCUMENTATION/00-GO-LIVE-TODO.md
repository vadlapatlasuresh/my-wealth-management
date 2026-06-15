# 00 — GO-LIVE PLAN (the master production-readiness checklist)

**The single, exhaustive checklist to take TerraVest from "live with mocks" to "production-ready
for real users with real money."** We work it **top to bottom, one item at a time**, checking
boxes off as we go. Every item has an **owner** and an **acceptance test**.

Companion docs: [04-ROADMAP-TO-LIVE.md](04-ROADMAP-TO-LIVE.md) ·
[06-APIS-AND-KEYS.md](06-APIS-AND-KEYS.md) ·
[../finance-mvp/OPERATIONS_RUNBOOK.md](../finance-mvp/OPERATIONS_RUNBOOK.md)

**Legend:** `[ ]` todo · `[x]` done · **(You)** = your action (accounts/keys/VM/legal) ·
**(Me)** = I do it (code/deploy/verify) · **Effort:** S/M/L.

> **Live URL:** https://app.terravest.app · **Cost today:** ~$0 (GCP trial + Neon free + all providers mocked)

---

## 📍 Current state (2026-06-15)
- App is **live and works end-to-end with mocks**; all manual data-entry flows verified.
- **Deploys are currently BLOCKED at Phase 0.** The secrets-service (#18) was stood up, but
  `auth-service` comes up **unhealthy** on deploy (needs its crash log to pinpoint). Until 0.x is
  green, nothing merged since PR #17 is live.
- Everything below "real provider" is **mock** by design; flipping each is a toggle + key.

### How "mock → real" works
Each integration is a Spring bean gated by `@ConditionalOnProperty`. Set the **toggle** + **key**
in the VM's `.env.prod` and redeploy the one service. If a key is missing/invalid it logs
`falling back to mock` — so you always know. (Toggles were wired through compose in PR #21.)

---

# PHASE 0 — 🔴 Unblock deploys (FINISH FIRST)
*Goal: a green one-click deploy that ships everything merged since #17.*

- [x] 0.1 (You) Create Neon `secrets_db`; add `SECRETS_*` to `.env.prod`.
- [x] 0.2 (Me) Add `secrets-service` to the CI build matrix so its image publishes (PR #27).
- [ ] **0.3 (You) Pull the `auth-service` crash log** so I can fix the unhealthy boot:
  ```bash
  ssh -i ~/.ssh/terravest_deploy deploy@34.139.32.148 \
    'cd ~/my-wealth-management/finance-mvp && docker compose -f docker-compose.prod.yml \
     --env-file .env.prod logs --tail=80 auth-service' | grep -iE "error|exception|caused by|fatal|jwt|secret|started|failed" | tail -30
  ```
- [ ] **0.4 (Me) Fix the auth-service boot failure** (likely `JwtSecretGuard` rejecting the
  secret, or a missing OTP→notification config) and redeploy. **Acceptance:** deploy job =
  success; all 12 services healthy; `https://app.terravest.app` 200.
- [ ] **0.5 (Me) Re-run the end-to-end flow test** (write→read-back across every feature) to
  confirm the big merged batch didn't regress anything. **Acceptance:** flow suite green.

---

# PHASE 1 — 🔴 Security gate (before ANY real user)
*Goal: stop leaking OTP codes, deliver them for real, and refuse weak secrets at boot.*

- [ ] **1.1 (You) SendGrid** — account, **verified sender**, API key → `SENDGRID_API_KEY`,
  `SENDGRID_FROM`. Add SendGrid **SPF/DKIM** DNS records (deliverability). **S**
- [ ] **1.2 (You) Twilio** — account + sending number → `TWILIO_ACCOUNT_SID`,
  `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`. **S**
- [ ] **1.3 (You) Set toggles + `OTP_EXPOSE_DEV_CODE=false` in `.env.prod`:** `COMMS_PROVIDER_EMAIL=sendgrid`,
  `COMMS_PROVIDER_SMS=twilio`, plus the keys above. **S**
- [ ] **1.4 (Me) Deploy auth + notification; verify.** **Acceptance:** a brand-new email/phone
  receives a **real** OTP; API responses contain **no** `devCode`; signup + MFA login still work. **S**
- [ ] **1.5 (Me) Fail-fast secret guards** — refuse to boot in prod if `JWT_SECRET`,
  `APP_ENCRYPTION_KEY`, or `AUDIT_INGEST_KEY` are blank/demo/weak (auth has `JwtSecretGuard`;
  extend the pattern to the others). **Acceptance:** a blank key stops that service with a clear
  fatal log. **M**
- [ ] **1.6 (Me) Harden CORS** — whitelist specific headers/methods (drop `*`); confirm
  `WEB_ORIGINS` has no wildcard in prod. **S**
- [ ] **1.7 (Me) Tighten CSP/security headers** in the [Caddyfile](../finance-mvp/Caddyfile).
  **Acceptance:** CSP present; site still works; headers grade A. **M**
- [ ] **1.8 (Me) Move web JWT off `localStorage`** → httpOnly cookie or in-memory + refresh
  (XSS hardening). **Acceptance:** token not readable from `localStorage`. **M**

---

# PHASE 2 — Core real data (highest user value)
*Goal: real bank data + real AI.*

- [ ] **2.1 (You) Plaid sandbox** keys → `PLAID_CLIENT_ID/SECRET`, `PLAID_ENV=sandbox`. **S**
- [ ] **2.2 (Me) Deploy account-aggregation; verify with Plaid sandbox** (`user_good`/`pass_good`).
  **Acceptance:** linking populates real accounts + transactions → net worth/budgets update;
  bill-pay can pick a funding account. **S**
- [ ] **2.3 (Me) Harden the Plaid webhook** — implement the TODO in `PlaidWebhookVerifier`
  (fetch ES256 key, verify JWT signature + body hash); set `PLAID_WEBHOOK_VERIFY=true`.
  **Acceptance:** forged webhook → 401; real webhook → processed. **M**
- [ ] **2.4 (You) Plaid production access** (when launching to real banks) → production keys +
  `PLAID_ENV=production`. **Acceptance:** a real bank links + syncs. **S** *(gated on Plaid review)*
- [ ] **2.5 (You) AI key** → `ANTHROPIC_API_KEY` (or `GEMINI_API_KEY`); set `AI_PROVIDER` + model. **S**
- [ ] **2.6 (Me) Deploy ai-insights; verify.** **Acceptance:** insights + chat are real and
  grounded in the user's numbers; no mock fallback in logs. **S**

---

# PHASE 3 — Remaining integrations (turn on per feature)
*Each is a toggle + key + redeploy; see [06-APIS-AND-KEYS.md](06-APIS-AND-KEYS.md).*

- [ ] **3.1 (You/Me) Stripe** — `PAYMENT_PROVIDER=stripe`, `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`; register the webhook URL; finish **webhook signature verification**
  (`StripeWebhookVerifier`). **Acceptance:** a real PaymentIntent is created; signed webhook
  updates status; forged webhook rejected. **M**
- [ ] **3.2 (You/Me) RentCast** — `REALESTATE_PROVIDER=rentcast`, `REALESTATE_PROVIDER_API_KEY`.
  **Acceptance:** property lookup returns real AVM/rent data (no mock fallback). **S**
- [ ] **3.3 (You/Me) QuickBooks Online** — `BUSINESS_PROVIDER=quickbooks`, `QBO_CLIENT_ID/SECRET`,
  register `QBO_REDIRECT_URI`, set `APP_WEB_URL`; verify OAuth connect + token refresh.
  **Acceptance:** connecting a QBO sandbox company shows real P&L/invoices/expenses. **M**
- [ ] **3.4 (You/Me) FCM push** — `COMMS_PROVIDER_PUSH=fcm` + service-account creds (migrate off
  the legacy server-key API to FCM HTTP v1). **Acceptance:** a device receives a push. **M**
- [ ] **3.5 (You/Me) Google Maps** address autocomplete — `VITE_GOOGLE_MAPS_API_KEY` (build-time;
  the deploy rebuilds web). **Acceptance:** address fields autocomplete. **S**

---

# PHASE 4 — Production robustness (safe under load & failure)
*Goal: the app behaves correctly with bad input, traffic spikes, and flaky dependencies.*

- [ ] **4.1 (Me) Input validation** — add `@Valid` + constraints to every write DTO; reject raw
  `Map<String,Object>` bodies (property/deal/bill-pay/support). **Acceptance:** bad payloads →
  400 with field errors, not 500. **M**
- [ ] **4.2 (Me) Rate limiting** — gateway-level (per-IP + per-user) on auth/OTP and write
  endpoints (bucket4j/Resilience4j). **Acceptance:** OTP/login throttles after N attempts. **M**
- [ ] **4.3 (Me) Retries + circuit breakers** for outbound calls (Plaid, Stripe, RentCast,
  SendGrid, Twilio, QBO) via Resilience4j. **Acceptance:** a provider outage degrades gracefully,
  doesn't hang requests. **M**
- [ ] **4.4 (Me) Persistent idempotency** — move the in-memory notification/payment idempotency
  cache to the DB (survives restarts + multi-instance). **Acceptance:** replaying a key after a
  restart is still de-duped. **M**
- [ ] **4.5 (Me) Pagination + size caps** on list endpoints (notifications, transactions,
  accounts, deals). **Acceptance:** large lists paginate; no unbounded fetch. **M**
- [ ] **4.6 (Me) DB indexes** on hot paths (`user_id` and FK columns) via new Flyway migrations.
  **Acceptance:** explain-plan uses indexes on the common queries. **S**
- [ ] **4.7 (Me) Health probes + graceful shutdown** — real readiness/liveness indicators;
  drain in-flight requests on SIGTERM. **Acceptance:** a rolling deploy drops zero requests. **M**

---

# PHASE 5 — Observability, backups & secret management
*Goal: we can see problems, recover data, and keep secrets safe.*

- [ ] **5.1 (Me) Structured (JSON) logging** (correlation IDs already in the log pattern); ship
  logs somewhere queryable. **Acceptance:** logs searchable by `requestId`/`userId`. **M**
- [ ] **5.2 (You/Me) Error tracking (Sentry)** — add DSN to all services + web; alert on new
  errors. **Acceptance:** a forced exception appears in Sentry with stack + request id. **S**
- [ ] **5.3 (You/Me) Metrics & alerts** — scrape `/actuator/prometheus`; dashboards + alerts on
  error rate, latency, healthy-instance count. **Acceptance:** an SLO alert fires in a drill. **M**
- [ ] **5.4 (You/Me) Backups + restore drill** — confirm Neon PITR/automated backups; perform a
  **test restore** and document it. **Acceptance:** a restore drill succeeds, written up. **M**
- [ ] **5.5 (You/Me) Migrate secrets INTO the store** — run `deploy/seed-secrets.sh` to load
  `.env.prod` keys into the secrets-service; trim `.env.prod` to non-secrets. **Acceptance:**
  services read keys from the store; `.env.prod` holds only config. **M**
- [ ] **5.6 (You) KEK in GCP KMS** — `terraform apply` (infra/gcp) for the KMS key + VM service
  account; set `SECRETS_PROVIDER=kms` + `SECRETS_KMS_KEY_NAME`; blank `SECRETS_MASTER_KEY`.
  **Acceptance:** secrets unwrap via KMS; no master key on disk. **M**
- [ ] **5.7 (You/Me) Rotate every secret that ever touched git/chat** (JWT_SECRET,
  APP_ENCRYPTION_KEY, all provider keys, DB passwords). **Acceptance:** old values invalid. **S**

---

# PHASE 6 — Compliance, legal & data lifecycle
*Goal: lawful to hold real financial PII; honor user data rights.*

- [ ] **6.1 (Me) Delete-cascade hardening** — make `DELETE /me` reliably purge across every
  data-owning service (durable retries, not best-effort). **Acceptance:** deleting an account
  removes all user data across services; verified by query. **M**
- [ ] **6.2 (Me) Consent ledger** — persist ToS/privacy acceptance (version + timestamp) at
  signup and for data-sharing (Deal Room). **Acceptance:** acceptances are queryable per user. **M**
- [ ] **6.3 (Me) GDPR/CCPA data export** — `GET /api/v1/me/export` returning all user data.
  **Acceptance:** a user can download their data. **M**
- [ ] **6.4 (Me) Broaden audit coverage** — emit semantic events for payments, deals, budgets,
  account links (today: auth events only). **Acceptance:** sensitive actions appear in the audit
  chain. **M**
- [ ] **6.5 (Me) Data-retention policy + purge jobs** — define retention; scheduled cleanup.
  **Acceptance:** policy documented; job runs. **S**
- [ ] **6.6 (You) Legal** — Terms of Service, Privacy Policy, financial disclaimers, and a list
  of third-party data processors (Plaid/Stripe/etc.) reviewed by counsel. **Acceptance:** linked
  + accepted at signup; privacy policy published. **L (external)**

---

# PHASE 7 — Web app hardening (UX & accessibility)
- [ ] **7.1 (Me) Form validation** (length/format) before submit across auth/property/deal forms. **S**
- [ ] **7.2 (Me) Loading / empty / error states** for every page + a top-level error boundary. **M**
- [ ] **7.3 (Me) Accessibility** — semantic HTML, ARIA labels, keyboard nav, contrast. **M**
- [ ] **7.4 (Me) Disabled-button reasons / inline help** so users aren't stuck. **S**
- [ ] **7.5 (Me, optional) Dark mode + finish i18n** (already scaffolded). **M**

---

# PHASE 8 — Testing & CI quality gates
- [ ] **8.1 (Me) Unit/integration tests for untested services** — notification, payment, business,
  api-gateway, audit, real-estate core, platform-config (today: sparse). **Acceptance:** each
  critical flow has a test. **L**
- [ ] **8.2 (Me) Expand Playwright E2E** — link account → dashboard → add property → goal →
  bill-pay → settings → delete account. **Acceptance:** suite runs green in CI. **M**
- [ ] **8.3 (Me) Wire E2E + coverage gates into CI** on every PR. **Acceptance:** PRs blocked on
  red tests. **S**
- [ ] **8.4 (Me) Contract tests for provider seams** (mock vs real parity) so toggles can't
  silently break. **M**

---

# PHASE 9 — Mobile to the stores
- [ ] **9.1 (You/Me) Finish iOS build** (Android verified). See
  [../docs/phases/PHASE_8_MOBILE.md](../docs/phases/PHASE_8_MOBILE.md). **M**
- [ ] **9.2 (Me) Disable mixed-content / enforce HTTPS** in `capacitor.config.ts` for prod. **S**
- [ ] **9.3 (You) Signing** — Android keystore; Apple cert + provisioning profile. **M**
- [ ] **9.4 (You/Me) Native Plaid Link + push + biometric unlock** in the app. **L**
- [ ] **9.5 (You/Me) Build store binaries, listings, submit** to App Store + Play Store. **L**

---

# PHASE 10 — Launch readiness
- [ ] **10.1 (You/Me) Load test** the critical paths (signup, link, dashboard) at expected peak. **M**
- [ ] **10.2 (Me) Security review / pen-test pass** (`/security-review` + external if budget). **M**
- [ ] **10.3 (You) Host decision** post-GCP-trial — downsize VM or move to Hetzner; confirm
  long-term cost. **S**
- [ ] **10.4 (You/Me) Incident runbook + on-call** — who gets paged, how to roll back. **S**
- [ ] **10.5 (You/Me) Final go/no-go** — all 🔴 phases (0,1) + Plaid + backups + legal complete →
  **launch**. **Acceptance:** a real user signs up, links a real bank, sees real data, with MFA
  delivered by email/SMS and no dev-code in responses. 🚀

---

## Critical path (minimum to onboard the first real user safely)
**0 → 1 → 2.1/2.2 (Plaid) → 2.5/2.6 (AI) → 4.1 (validation) → 4.2 (rate limit) → 5.2 (Sentry) →
5.4 (backups) → 6.1/6.2/6.6 (delete + consent + legal).** Phases 3, 7, 8, 9, 10 raise quality
and reach but aren't all blockers for a careful beta.

## Sequencing notes
- **🔴 = hard blockers** (Phases 0 and 1). Do not expose to any real user until both are done.
- Phases **4, 5, 7, 8** are mostly **(Me)** code — they can proceed in parallel with you
  obtaining keys for Phases 1–3.
- **Cost** stays ~$0 until you turn on providers/onboard users; Plaid sandbox + Sentry/SendGrid
  free tiers cover early testing.

*Keep this file the source of truth: check the box and add a date as each item lands.*
