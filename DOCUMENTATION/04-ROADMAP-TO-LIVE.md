# 4. Roadmap — Next Phases to Make It Fully Live

The app is **already deployed** at https://app.terravest.app and works end-to-end with mocks.
"Live for real users" means: real notifications/security closed, real bank data, backups, and
mobile in the stores. Below is the path, grouped into phases with concrete acceptance criteria.

> Deeper per-phase plans (history + remaining) live in [`docs/phases/`](../docs/phases/) —
> notably [`PHASE_8_MOBILE.md`](../docs/phases/PHASE_8_MOBILE.md) and
> [`PHASE_9_HARDENING.md`](../docs/phases/PHASE_9_HARDENING.md).

---

## Phase A — 🔴 Close the security gate (DO FIRST)

**Why first:** OTP dev codes are exposed in production responses, so MFA can be bypassed.

**Steps**
1. Create a **SendGrid** account; verify a sender; get `SENDGRID_API_KEY` + `SENDGRID_FROM`.
2. Create a **Twilio** account; get `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`.
3. On the VM, edit `.env.prod`:
   ```
   COMMS_PROVIDER_EMAIL=sendgrid
   SENDGRID_API_KEY=...
   SENDGRID_FROM=you@yourdomain.com
   COMMS_PROVIDER_SMS=twilio
   TWILIO_ACCOUNT_SID=...
   TWILIO_AUTH_TOKEN=...
   TWILIO_FROM=+1...
   ```
4. Turn off dev-code exposure: set `otp.expose-dev-code=false` (auth-service config).
5. Redeploy notification-service + auth-service.

**Acceptance:** a brand-new email/phone receives a real OTP; API responses no longer contain a
`devCode`; login/MFA still completes.

---

## Phase B — Real bank data + AI (highest user value)

**Steps**
1. **Plaid:** sign up at Plaid; use free **sandbox** keys first. Set `PLAID_CLIENT_ID`,
   `PLAID_SECRET`, `PLAID_ENV=sandbox`. Redeploy account-aggregation-service.
2. **AI:** get an `ANTHROPIC_API_KEY` (or `GEMINI_API_KEY`). Set `AI_PROVIDER=anthropic` (or
   `gemini`) + the model. Redeploy ai-insights-service.

**Acceptance:** linking a Plaid sandbox bank (`user_good` / `pass_good`) populates real accounts
+ transactions → net worth/budgets update; AI insights return real, grounded responses.

---

## Phase C — Compliance & data-lifecycle (pure code, no keys)

**Steps**
1. **Delete-cascade:** add internal-key `DELETE by-user` to every data-owning service and
   orchestrate from the account-delete flow (true GDPR delete).
2. **Audit domain-events:** emit semantic events from services.
3. **Consent ledger:** persist ToS/privacy acceptances.
4. **Net-worth daily snapshot job** + **recurring-bill detection** + **categorization rules**.

**Acceptance:** deleting an account removes all of the user's data across services; the audit
log shows semantic events; the net-worth chart has continuous history.

---

## Phase D — Production hardening

**Steps**
1. **Backups:** confirm Neon automated backups/PITR; run a **restore drill** and document it.
2. **Secrets manager:** move secrets from plain `.env.prod` into the KMS-backed secrets-service
   (or Doppler); rotate `JWT_SECRET`, `APP_ENCRYPTION_KEY`, all provider keys.
3. **Error tracking:** add a **Sentry DSN**; wire alerting/SLOs on the Prometheus metrics.
4. **Security headers / CSP:** review and tighten the [`Caddyfile`](../finance-mvp/Caddyfile).
5. **Tests:** broaden unit coverage + add the Playwright happy-path (login → link → dashboard →
   pay) to CI.
6. **Host decision:** after the GCP free trial, downsize the VM or migrate to a cheaper host.

**Acceptance:** a restore drill succeeds; secrets are rotated and out of plaintext; errors hit
Sentry; CI runs the E2E test.

---

## Phase E — Remaining providers (as needed)

Turn on when the feature is needed: **Stripe** (real bill pay / billing), **FCM/APNs** (push),
**QuickBooks Online** (business), **RentCast** (real property valuations), **Google Maps**
(address autocomplete). Each is one toggle + key + redeploy — see
[06-APIS-AND-KEYS.md](06-APIS-AND-KEYS.md).

---

## Phase F — Mobile to the stores

**Steps**
1. Finish the **iOS** simulator build (Android already verified).
2. **Signing:** create an Android keystore; Apple cert + provisioning profile.
3. Build store binaries (`npx cap build`/Xcode/Gradle); prepare store listings; submit.

**Acceptance:** signed iOS + Android builds install and run against production; listings live.

---

## "What's the very next thing?" — the short answer

1. **Phase A** (security gate) — SendGrid + Twilio + `otp.expose-dev-code=false`.
2. **Phase B** (Plaid sandbox + AI key).
3. Then **C → D** in parallel as time allows, **E/F** as needed.

Today's running cost is ~**$0** (GCP free trial + Neon free tier + all paid APIs mocked).
Costs begin only as you turn on providers and onboard users.
