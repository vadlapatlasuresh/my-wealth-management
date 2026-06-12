# 00 — GO-LIVE TODO (the master checklist)

**This is the single, living checklist to take TerraVest from "live with mocks" to
"fully live for real users."** We work it **top to bottom, one item at a time**, and
check boxes off as we go. Deeper context per phase is in
[04-ROADMAP-TO-LIVE.md](04-ROADMAP-TO-LIVE.md) and
[06-APIS-AND-KEYS.md](06-APIS-AND-KEYS.md); the ops mechanics are in
[../finance-mvp/OPERATIONS_RUNBOOK.md](../finance-mvp/OPERATIONS_RUNBOOK.md).

**Legend:** `[ ]` todo · `[x]` done · **(You)** = needs your action (keys/accounts/VM) ·
**(Me)** = I do it (code/deploy/verify). Each item has an **acceptance** = how we know it's done.

> **Live URL:** https://app.terravest.app  ·  **Cost today:** ~$0 (GCP trial + Neon free + all providers mocked)

---

## 📍 Where we are right now (2026-06-11)
- App is **live and works end-to-end with mocks**; all manual data-entry flows verified.
- **Deploys are currently BLOCKED.** Last successful deploy was PR #17. Everything merged
  since — #18 (secrets-service), #20 (mobile designs), #21 (provider-toggle wiring),
  #22/#23 (secrets tooling) — is **on `main` but NOT live yet**, because the secrets-service
  (#18) made `SECRETS_INTERNAL_KEY` + a secrets DB **required** in `.env.prod`, which the VM
  doesn't have. **Phase 0 fixes this and ships all the accumulated work at once.**

---

## PHASE 0 — 🔴 Unblock deploys (stand up the secrets-service) — DO FIRST
*Goal: green deploy again, and everything merged since #17 goes live in one shot.*

- [ ] **(You) 0.1 — Create a Neon database `secrets_db`.** In the Neon console (same project
  as your other DBs), create a database named `secrets_db`. Reuse the same role/password as
  your other services. Note the host. *(Use a dedicated DB — NOT `currentSchema=secrets`, which
  Neon silently ignores; that was the original schema-collision bug.)*
  **Acceptance:** `secrets_db` exists and you have its host/user/password.

- [ ] **(You) 0.2 — Add the secrets config to the VM's `.env.prod`.** SSH in and run (replaces
  only the 3 Neon values; the two keys are generated for you):
  ```bash
  ssh -i ~/.ssh/terravest_deploy deploy@34.139.32.148
  cd ~/my-wealth-management/finance-mvp   # or ~/finance-mvp
  NEON_HOST="ep-xxxx.us-east-1.aws.neon.tech"; NEON_USER="your_user"; NEON_PASS="your_pass"
  cat >> .env.prod <<EOF

  # --- secrets-service (PR #18) ---
  SECRETS_PROVIDER=local
  SECRETS_INTERNAL_KEY=$(openssl rand -base64 32)
  SECRETS_MASTER_KEY=$(openssl rand -base64 32)
  SECRETS_DATABASE_URL=jdbc:postgresql://${NEON_HOST}/secrets_db?sslmode=require
  SECRETS_DATABASE_USER=${NEON_USER}
  SECRETS_DATABASE_PASSWORD=${NEON_PASS}
  EOF
  ```
  **Acceptance:** `grep SECRETS_ .env.prod` shows all six lines populated.

- [ ] **(Me) 0.3 — Deploy and verify all 12 services come up healthy.** I run the deploy
  workflow; it now passes config validation, secrets-service boots (Flyway creates tables in
  `secrets_db`), Caddy serves the site, health-gate goes green.
  **Acceptance:** deploy job = success; `https://app.terravest.app` 200; `/actuator/health` 200;
  a fresh register→dashboard works; real-estate/deal-room 200 (i.e. all the post-#17 work is live).

- [ ] **(Me) 0.4 — Re-run the end-to-end flow test** (write→read-back across every feature) to
  confirm nothing regressed in the big batch of merged changes.
  **Acceptance:** the flow suite passes (same 21/21 non-key flows as before).

---

## PHASE 1 — 🔴 Close the security gate (before ANY real user)
*Goal: real OTP delivery + stop leaking codes. These two go together — you can't hide the code
until real delivery works.*

- [ ] **(You) 1.1 — SendGrid account.** Sign up, verify a sender (an email you control, ideally
  on your domain), create an API key. → `SENDGRID_API_KEY`, `SENDGRID_FROM`.
- [ ] **(You) 1.2 — Twilio account.** Sign up, buy/verify a sending number. →
  `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`.
- [ ] **(You) 1.3 — Set toggles + keys in `.env.prod`:**
  ```
  COMMS_PROVIDER_EMAIL=sendgrid
  SENDGRID_API_KEY=...
  SENDGRID_FROM=you@yourdomain.com
  COMMS_PROVIDER_SMS=twilio
  TWILIO_ACCOUNT_SID=...
  TWILIO_AUTH_TOKEN=...
  TWILIO_FROM=+1...
  OTP_EXPOSE_DEV_CODE=false
  ```
- [ ] **(Me) 1.4 — Deploy auth + notification services and verify.**
  **Acceptance:** a brand-new email/phone receives a **real** OTP; API responses contain **no**
  `devCode`; signup and returning-login (MFA) still complete end-to-end.
- [ ] **(You, deliverability) 1.5 — Domain email auth:** add SendGrid's SPF/DKIM CNAME records
  so OTP/notification email doesn't land in spam.
  **Acceptance:** SendGrid shows the sender domain "verified"; a test email lands in inbox.

---

## PHASE 2 — Core integrations (highest user value)
*Goal: real bank data + real AI. Plaid also unlocks bill-pay funding.*

- [ ] **(You) 2.1 — Plaid sandbox keys.** Sign up at Plaid; grab the free **sandbox**
  `PLAID_CLIENT_ID`/`PLAID_SECRET`. Set them + `PLAID_ENV=sandbox` in `.env.prod`.
- [ ] **(Me) 2.2 — Deploy account-aggregation + verify with Plaid's sandbox bank.**
  **Acceptance:** linking with Plaid sandbox creds (`user_good`/`pass_good`) populates real
  accounts + transactions → net worth/budgets update; bill-pay can pick a funding account.
- [ ] **(You) 2.3 — Plaid production access** (when ready for real banks): request production in
  the Plaid dashboard, set production keys + `PLAID_ENV=production`.
  **Acceptance:** a real bank links and syncs.
- [ ] **(You) 2.4 — AI key.** Get `ANTHROPIC_API_KEY` (or `GEMINI_API_KEY`). Set
  `AI_PROVIDER=anthropic` (or `gemini`) + model in `.env.prod`.
- [ ] **(Me) 2.5 — Deploy ai-insights + verify.**
  **Acceptance:** insights + chat return real, grounded responses (no "mock" fallback in logs).

---

## PHASE 3 — Remaining providers (turn on as the feature is needed)
*Each is one toggle + key + redeploy. See [06-APIS-AND-KEYS.md](06-APIS-AND-KEYS.md).*

- [ ] **(You/Me) 3.1 — Stripe** (real bill-pay/billing): `PAYMENT_PROVIDER=stripe`,
  `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (+ register the webhook URL). Deploy payment-service.
- [ ] **(You/Me) 3.2 — RentCast** (real property valuations): `REALESTATE_PROVIDER=rentcast`,
  `REALESTATE_PROVIDER_API_KEY`. Deploy real-estate-service.
- [ ] **(You/Me) 3.3 — QuickBooks Online** (business): `BUSINESS_PROVIDER=quickbooks`,
  `QBO_CLIENT_ID/SECRET`, register `QBO_REDIRECT_URI`, set `APP_WEB_URL`. Deploy business-financials.
- [ ] **(You/Me) 3.4 — FCM push** (`COMMS_PROVIDER_PUSH=fcm` + `FCM_SERVER_KEY`) and
  **Google Maps** address autocomplete (`VITE_GOOGLE_MAPS_API_KEY`, build-time).
  **Acceptance (each):** the feature works against the real provider; logs show no mock fallback.

---

## PHASE 4 — Production hardening
*Goal: safe to hold real financial data.*

- [ ] **(You/Me) 4.1 — Backups + restore drill.** Confirm Neon automated backups/PITR; do a
  test restore and document it. **Acceptance:** a restore drill succeeds and is written down.
- [ ] **(Me, then You) 4.2 — Migrate secrets INTO the store.** Now that secrets-service is up
  (Phase 0), run `deploy/seed-secrets.sh` on the VM to load `.env.prod` keys into the encrypted
  store, roll the per-service `secrets-client` shim out beyond ai-insights, and trim `.env.prod`
  to non-secrets. **Acceptance:** services read keys from the store; `.env.prod` holds only
  non-secret config + the KMS/identity bits.
- [ ] **(You) 4.3 — Move KEK to GCP KMS** (prod-grade): `terraform apply` in `infra/gcp` for the
  KMS key + VM service account; set `SECRETS_PROVIDER=kms` + `SECRETS_KMS_KEY_NAME`, blank
  `SECRETS_MASTER_KEY`. **Acceptance:** secrets-service unwraps via KMS; no master key on disk.
- [ ] **(You/Me) 4.4 — Rotate every secret that ever touched git or chat** (JWT_SECRET,
  APP_ENCRYPTION_KEY, all provider keys, DB passwords). **Acceptance:** old values invalid.
- [ ] **(You/Me) 4.5 — Error tracking + alerting:** add a Sentry DSN; wire alerts/SLOs on the
  Prometheus metrics. **Acceptance:** a forced error appears in Sentry.
- [ ] **(Me) 4.6 — Tighten security headers / CSP** in the
  [Caddyfile](../finance-mvp/Caddyfile). **Acceptance:** CSP set; site still works; headers graded.
- [ ] **(Me) 4.7 — CI E2E:** add the Playwright happy-path (signup → link → dashboard → pay) to
  CI. **Acceptance:** CI runs the E2E test on every push.
- [ ] **(You) 4.8 — Host decision** after the GCP trial: downsize the VM or move to Hetzner.
  **Acceptance:** running on the chosen long-term host.

---

## PHASE 5 — Compliance & data lifecycle (mostly code, no keys)
- [ ] **(Me) 5.1 — Delete-cascade:** internal `DELETE by-user` in every data-owning service,
  orchestrated from account-delete (true GDPR delete). **Acceptance:** deleting an account wipes
  the user's data across all services.
- [ ] **(Me) 5.2 — Consent ledger:** persist ToS/privacy acceptances with timestamps/version.
- [ ] **(Me) 5.3 — Audit domain events:** emit semantic events; net-worth daily snapshot job.
- [ ] **(You) 5.4 — Legal:** Terms of Service, Privacy Policy, and financial disclaimers
  reviewed by counsel before public launch. **Acceptance:** linked + accepted at signup.

---

## PHASE 6 — Mobile to the stores
- [ ] **(You/Me) 6.1 — Finish iOS simulator build** (Android verified). See
  [../docs/phases/PHASE_8_MOBILE.md](../docs/phases/PHASE_8_MOBILE.md).
- [ ] **(You) 6.2 — Signing:** Android keystore; Apple cert + provisioning profile.
- [ ] **(You/Me) 6.3 — Build store binaries, prepare listings, submit.**
  **Acceptance:** signed iOS + Android builds run against prod; store listings live.

---

## The very next action
**Phase 0.1 + 0.2 are yours** (create `secrets_db`, append the `SECRETS_*` block to `.env.prod`).
The moment you say **"done"**, I run **0.3** (deploy) and **0.4** (verify) — which also makes all
the merged-but-unshipped work (#18–#23) live. Then we roll straight into Phase 1.

*Keep this file updated: check the box and add a date when each item lands.*
