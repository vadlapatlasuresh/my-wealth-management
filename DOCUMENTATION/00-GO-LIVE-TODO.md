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

## 📍 Current state (2026-06-16)
- App is **live end-to-end** at https://app.terravest.app; deploys **unblocked** (Phase 0 done).
- **Secrets fully centralized** ✅ — every provider key lives only in the KMS-encrypted store;
  `.env.prod` holds only bootstrap config (5.5 + 5.6 done).
- **Real providers live:** ✅ Plaid (sandbox), ✅ SendGrid email OTP (dev code hidden), ✅ Gemini AI.
- **Security hardening shipped:** CSP/headers (1.7), rate-limiting (4.2), fail-fast encryption-key
  guard (1.5), CORS allow-list (1.6) — all merged (PRs #30, #32), **deploy to activate**.
- **Ops:** images auto-build+push via `ci.yml` on merge; `deploy/build-all.sh` is the VM fallback.
  secrets-service uses its own `secrets_db`; all Neon DBs share one `neondb_owner` password.
- Everything still "mock" is by design; flipping each is a toggle + key.

### How "mock → real" works
Each integration is a Spring bean gated by `@ConditionalOnProperty`. Set the **toggle** + **key**
in the VM's `.env.prod` and redeploy the one service. If a key is missing/invalid it logs
`falling back to mock` — so you always know. (Toggles were wired through compose in PR #21.)

---

# PHASE 0 — 🔴 Unblock deploys (FINISH FIRST)
*Goal: a green one-click deploy that ships everything merged since #17.*

- [x] 0.1 (You) Create Neon `secrets_db`; add `SECRETS_*` to `.env.prod`.
- [x] 0.2 (Me) Add `secrets-service` to the CI build matrix so its image publishes (PR #27).
- [x] **0.3/0.4 Fixed the unhealthy boot (done 2026-06-16).** Root cause: a stale `neondb_owner`
  password in `.env.prod` (all DBs share one) + secrets-service pointed at the wrong DB. Recovered
  the working password, gave secrets-service its own `secrets_db`, repaired auth's Flyway baseline.
  All 12 services healthy; site 200.
- [x] **0.5 Verified key flows (done 2026-06-16):** signup→dashboard, Plaid link, email OTP.

---

# PHASE 1 — 🔴 Security gate (before ANY real user)
*Goal: stop leaking OTP codes, deliver them for real, and refuse weak secrets at boot.*

- [x] **1.1 (You) SendGrid email live (done 2026-06-16).** Verified sender + key; email OTP delivers.
  *(TODO: SPF/DKIM domain auth for deliverability — currently a Gmail single-sender.)*
- [ ] **1.2 (You) Twilio** — account + sending number → `TWILIO_ACCOUNT_SID`,
  `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`. **S** *(SMS optional; email works.)*
- [x] **1.3/1.4 Email toggle + dev-code hidden + verified (done 2026-06-16).** `COMMS_PROVIDER_EMAIL=sendgrid`,
  `OTP_EXPOSE_DEV_CODE=false`; fixed the `NOTIFICATION_URI` wiring bug (PR #26). Real OTP delivered; no `devCode`.
- [x] **1.5 (Me) Fail-fast secret guards (done 2026-06-16, PR #32).** `JWT_SECRET` (`JwtSecretGuard`)
  + `APP_ENCRYPTION_KEY` (auth + account-aggregation) refuse to boot in prod if blank/demo/weak.
  *(TODO: extend to `AUDIT_INGEST_KEY`.)*
- [x] **1.6 (Me) Harden CORS (done 2026-06-16, PR #32).** Gateway uses an explicit header allow-list
  (dropped `*`) and fails fast on a `*` origin with credentials.
- [x] **1.7 (Me) CSP/security headers (done 2026-06-16, PR #30).** Content-Security-Policy (allow-listing
  the SPA's real origins) + Permissions-Policy in the [Caddyfile](../finance-mvp/Caddyfile). *(Verify Plaid/maps/fonts post-deploy.)*
- [ ] **1.8 (Me) Move web JWT off `localStorage`** → httpOnly cookie or in-memory + refresh
  (XSS hardening). **Acceptance:** token not readable from `localStorage`. **M**

---

# PHASE 2 — Core real data (highest user value)
*Goal: real bank data + real AI.*

- [x] **2.1/2.2 Plaid sandbox live (done 2026-06-16).** Keys set (now in the store), `PLAID_ENV=sandbox`;
  account-aggregation links banks + populates accounts/transactions. *(Production = 2.4.)*
- [ ] **2.3 (Me) Harden the Plaid webhook** — implement the TODO in `PlaidWebhookVerifier`
  (fetch ES256 key, verify JWT signature + body hash); set `PLAID_WEBHOOK_VERIFY=true`.
  **Acceptance:** forged webhook → 401; real webhook → processed. **M**
- [ ] **2.4 (You) Plaid production access** (when launching to real banks) → production keys +
  `PLAID_ENV=production`. **Acceptance:** a real bank links + syncs. **S** *(gated on Plaid review)*
- [x] **2.5/2.6 AI live (Gemini, done 2026-06-16).** `AI_PROVIDER=gemini` + key (in the store);
  ai-insights returns real, grounded responses. *(Swap to Anthropic anytime via the store.)*

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
- [x] **4.2 (Me) Rate limiting (done 2026-06-16, PR #32).** Per-IP fixed-window limiter on the auth/OTP
  endpoints → `429`, configurable via `auth.ratelimit.*`. *(TODO: extend to write endpoints; Redis for multi-instance.)*
- [ ] **4.3 (Me) Retries + circuit breakers** for outbound calls (Plaid, Stripe, RentCast,
  SendGrid, Twilio, QBO) via Resilience4j. **Acceptance:** a provider outage degrades gracefully,
  doesn't hang requests. **M**
- [ ] **4.4 (Me) Persistent idempotency** — move the in-memory notification/payment idempotency
  cache to the DB (survives restarts + multi-instance). **Acceptance:** replaying a key after a
  restart is still de-duped. **M**
- [ ] **4.5 (Me) Pagination + size caps** on list endpoints (notifications, transactions,
  accounts, deals). **Acceptance:** large lists paginate; no unbounded fetch. **M**
- [x] **4.6 (Me) DB indexes (done 2026-06-16, PR #34).** Added the missing `user_id`/FK indexes on
  account-aggregation (plaid_items/accounts/transactions) + notification (notifications); other
  services already index their hot paths. Applied by Flyway on next deploy.
- [x] **4.7 (Me) Graceful shutdown (done 2026-06-16, PR #34).** `SERVER_SHUTDOWN=graceful` + 20s drain
  + `stop_grace_period=30s` for all services — rolling deploys drain in-flight requests.
  *(TODO: richer readiness/liveness probe groups.)*

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
- [x] **5.5 Secrets migrated INTO the store (done 2026-06-16).** All 11 services load scoped secrets
  at boot via `secrets-client`; provider keys are blank in `.env.prod`.
- [x] **5.6 KEK in GCP KMS (done 2026-06-16).** `SECRETS_PROVIDER=kms` + `SECRETS_KMS_KEY_NAME`;
  `SECRETS_MASTER_KEY` blank. secrets-service unwraps via the VM's KMS identity; no master key on disk.
- [ ] **5.7 (You/Me) Rotate every secret that ever touched git/chat** (JWT_SECRET,
  APP_ENCRYPTION_KEY, all provider keys, DB passwords). **Acceptance:** old values invalid. **S**

---

# PHASE 6 — Compliance, legal & data lifecycle
*Goal: lawful to hold real financial PII; honor user data rights.*

- [x] **6.1 (Me) Delete-cascade hardening (done 2026-06-16, PR #36).** Durable, persisted
  `user_deletion_task` per (user, target) with a scheduled retry (cap 10) — a transient outage no
  longer orphans data. **Also fixed a real prod bug:** `PURGE_TARGETS` was unset, so prod deletes
  were silently purging nothing. *(Verify after deploy.)*
- [~] **6.2 (Me) Consent ledger — largely exists.** platform-config has a versioned `disclaimer` +
  per-user `disclaimer_acceptance` (version + timestamp) ledger (entity/repo/controller). *(Remaining:
  enforce acceptance at signup + capture Deal Room data-sharing consent.)*
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
