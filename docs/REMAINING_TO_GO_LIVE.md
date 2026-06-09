# TerraVest — What's left to be fully real, end-to-end (snapshot)

Current state after wiring Plaid: the **core money pipeline is real** (linked
accounts → transactions → categories → net worth → budgets), running on
persistent Postgres with observability, tamper-evident audit, tests, and an admin
dashboard. This is the remaining work to make **every** feature real and live.

Legend: 🛠 pure code (no keys) · 🔑 needs a credential · 🏗 infra/decision

---

## A. Pure code — I can finish now (no keys) 🛠
- ⬜ **Delete‑cascade (true GDPR delete).** Today `DELETE /auth/me` removes only the
  auth row. Add `DELETE by-user` (internal-key) in account‑aggregation (items/
  accounts/transactions), financial‑core (goals/debts/budgets/snapshots),
  real‑estate (properties/deals), notification, business — orchestrated from the
  delete flow.
- ⬜ **Audit domain‑events.** Gateway captures every HTTP request already; add
  semantic events (payment.created/cancelled, goal.created, property.updated,
  account.linked/unlinked) emitted from the services for a richer trail.
- ⬜ **Structured JSON logs.** Correlation id is in logs already; switch to a JSON
  encoder so logs are queryable/aggregatable.
- ⬜ **Recurring‑bill detection.** Real "upcoming bills" from detected recurring
  transactions (now that real transactions flow), beyond scheduled intents.
- ⬜ **Categorization rules + budget mapping.** Plaid categories are real now; add
  user‑editable rules and map categories→budget lines so actuals are precise.
- ⬜ **Net‑worth daily snapshot job.** History is captured lazily on read; add a
  scheduled job so the chart has continuous history even when the user is away.
- ⬜ **Consent ledger.** Record ToS/privacy version acceptances (extend the
  disclaimer/acceptance model already present).
- ⬜ **Broaden tests + a Playwright E2E** (login→link→dashboard→pay) in CI.

## B. Provider integrations — light up the instant a key is added 🔑
Each is provider‑abstracted with a mock fallback; adding the key flips it to real
(exactly like Plaid did).
- ⬜ **AI insights & assistant** — `ANTHROPIC_API_KEY` + `AI_PROVIDER=anthropic`
  (ai‑insights‑service). Currently `MockAiProvider`.
- ⬜ **SMS OTP + SMS alerts** — Twilio (or AWS SNS). Signup OTP returns the code in
  dev today.
- ⬜ **Email notifications** — SendGrid (or AWS SES). Mock today.
- ⬜ **Push notifications** — FCM / APNs. Mock today.
- ⬜ **Payments / Bill Pay** — Stripe (or Plaid Transfer). Bill‑pay intents work but
  move no real money yet.
- ⬜ **My Business** — QuickBooks Online OAuth. `MockBusinessDataProvider` today.

## C. Infra & deploy (M8) 🏗 / 🔑
- ⬜ **Managed Postgres** (prod) + automated backups/PITR + restore drill.
- ⬜ **Domain + host + Docker** → Dev→QA→Prod (the `docker-compose.prod.yml` + Caddy
  are ready).
- ⬜ **Secrets manager** for prod (`JWT_SECRET`, `APP_ENCRYPTION_KEY`, provider keys).
- ⬜ **HTTPS everywhere**; in prod disable dev‑only cleartext (Android
  `allowMixedContent`, iOS ATS localhost exception).
- ⬜ **Sentry DSN** (error tracking) + alerting/SLOs on the Prometheus metrics.

## D. Mobile (M9) 🔑
- ⬜ Finish the **iOS** simulator build (Android verified end‑to‑end already).
- ⬜ Signing: Android keystore + Apple cert/profile → store builds; store listings.

---

## ✅ Already real & verified (for reference)
Linked accounts/transactions/categories (Plaid) · net worth from real balances ·
budgets · goals · calculators · debt lab · tamper‑evident audit + `/verify` ·
admin KPI dashboard · Prometheus + correlation IDs (gateway+logs+Feign) ·
data export + account delete · Postgres persistence · 31 web tests + backend tests.

## Recommended order
1. **AI key** (highest visible impact) → real insights/assistant.
2. **Delete‑cascade** + **audit domain‑events** (compliance, pure code).
3. **Deploy (M8)** once you pick host + Postgres + domain.
4. Remaining providers (SMS/email/push/payments/QuickBooks) as keys arrive.
