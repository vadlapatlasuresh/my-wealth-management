# 3. Pending Tasks

This is the consolidated to-do list. The canonical, frequently-updated source is
[`docs/REMAINING_TO_GO_LIVE.md`](../docs/REMAINING_TO_GO_LIVE.md); the security gate detail is
in [`finance-mvp/OPERATIONS_RUNBOOK.md`](../finance-mvp/OPERATIONS_RUNBOOK.md) §11b.

**Legend:** 🛠 pure code (no keys needed) · 🔑 needs a credential/key · 🏗 infra/decision ·
🔴 security-critical.

---

## 3.0 🔴 Do this FIRST — the security gate (before any real user)

> **MFA bypass is currently open in production.** OTP **dev codes are returned in API
> responses** (`otp.expose-dev-code=true`) so that signup/MFA work without email/SMS keys.
> Anyone can read the code and bypass MFA. Before onboarding a single real user you must:

- [ ] 🔑🔴 Set **SendGrid** (email) and **Twilio** (SMS) keys so OTP codes actually deliver.
- [ ] 🔴 Turn off dev-code exposure: `otp.expose-dev-code=false`.

These two go together — turning off the dev code without delivery keys locks everyone out.

---

## 3.1 Pure code — can be finished now, no keys 🛠

From [`docs/REMAINING_TO_GO_LIVE.md`](../docs/REMAINING_TO_GO_LIVE.md) §A:

- [ ] **Delete-cascade (true GDPR delete).** `DELETE /auth/me` removes only the auth row today.
      Add internal-key `DELETE by-user` in account-aggregation (items/accounts/transactions),
      financial-core (goals/debts/budgets/snapshots), real-estate (properties/deals),
      notification, and business — orchestrated from the delete flow.
- [ ] **Audit domain-events.** Gateway already captures every HTTP request; add semantic events
      (`payment.created/cancelled`, `goal.created`, `property.updated`, `account.linked/unlinked`)
      emitted by the services for a richer trail.
- [ ] **Structured JSON logs.** Correlation id is already in logs; switch to a JSON encoder so
      logs are queryable/aggregatable.
- [ ] **Recurring-bill detection.** Derive real "upcoming bills" from detected recurring
      transactions (possible now that real transactions flow).
- [ ] **Categorization rules + budget mapping.** Add user-editable rules and map
      categories → budget lines so actuals are precise.
- [ ] **Net-worth daily snapshot job.** History is captured lazily on read; add a scheduled job
      so the chart has continuous history even when the user is away.
- [ ] **Consent ledger.** Record ToS/privacy version acceptances (extend the existing
      disclaimer/acceptance model).
- [ ] **Broaden tests + a Playwright E2E** (login → link → dashboard → pay) in CI.
- [ ] **Minor:** `POST /planning/debt-scenarios/add` returns 500 (DB not-null) instead of 400
      if `apr` is omitted. The UI always sends `apr`, so users don't hit it — tighten validation
      when convenient.

## 3.2 Provider integrations — light up the instant a key is added 🔑

Each is provider-abstracted with a mock fallback; adding the key flips it to real (exactly like
Plaid did). See [06-APIS-AND-KEYS.md](06-APIS-AND-KEYS.md) for the exact env vars.

- [ ] **AI insights & assistant** — `ANTHROPIC_API_KEY` + `AI_PROVIDER=anthropic` (or Gemini).
      Currently `MockAiProvider`. *(Highest visible impact.)*
- [ ] **SMS OTP + SMS alerts** — Twilio (`COMMS_PROVIDER_SMS=twilio`). *(Part of the security gate.)*
- [ ] **Email notifications** — SendGrid (`COMMS_PROVIDER_EMAIL=sendgrid`). *(Part of the security gate.)*
- [ ] **Push notifications** — FCM / APNs (`COMMS_PROVIDER_PUSH=fcm`).
- [ ] **Payments / Bill Pay** — Stripe (`PAYMENT_PROVIDER=stripe`). Intents work but move no
      real money yet.
- [ ] **Bank linking** — Plaid (`PLAID_CLIENT_ID`/`PLAID_SECRET`). Free *sandbox* keys work.
      Bank data is deliberately **not** mocked, so linking 502s until keyed. Bill-pay funding
      also depends on a linked account, so it's effectively Plaid-gated too.
- [ ] **My Business** — QuickBooks Online OAuth (`BUSINESS_PROVIDER=quickbooks`).
- [ ] **Address autocomplete (web)** — Google Maps Places (`VITE_GOOGLE_MAPS_API_KEY`,
      build-time). Manual entry works without it.

## 3.3 Infra & deploy hardening 🏗 / 🔑

- [ ] **Managed Postgres** (done via Neon) + automated **backups/PITR** + a **restore drill**.
- [ ] **Secrets manager** for prod (move `JWT_SECRET`, `APP_ENCRYPTION_KEY`, provider keys off
      the plain `.env.prod` into the secrets-service KMS path / Doppler).
- [ ] **HTTPS everywhere** in prod; disable dev-only cleartext (Android `allowMixedContent`,
      iOS ATS localhost exception).
- [ ] **Sentry DSN** (error tracking) + alerting/SLOs on the Prometheus metrics.
- [ ] **Review security headers / CSP** in the [`Caddyfile`](../finance-mvp/Caddyfile), rotate
      all secrets, confirm Neon backups before taking real financial data.
- [ ] **Decide host after the GCP trial:** downsize the GCP VM or move to a cheaper host.

## 3.4 Mobile 🔑

The phone app is the web app wrapped with **Capacitor** (config at
[`apps/web/capacitor.config.ts`](../finance-mvp/apps/web/capacitor.config.ts); native projects
in `apps/web/ios` and `apps/web/android`). Note there is also an older React Native scaffold in
[`finance-mvp/mobile/`](../finance-mvp/mobile/) — Capacitor is the chosen path.

- [ ] Finish the **iOS** simulator build (Android verified end-to-end already).
- [ ] **Signing:** Android keystore + Apple cert/profile → store builds.
- [ ] **Store listings** (App Store / Play Store).

## 3.5 Retire the legacy Node API

- [ ] The legacy Node API (`apps/api`, port 4000) still serves old mock `/v1/**` routes with a
      SQLite schema whose user IDs differ from the Java services. Each Java service replaces a
      slice of it — **retire it once empty**.

---

## 3.6 Recommended order

1. **🔴 Security gate** (SendGrid + Twilio keys + `otp.expose-dev-code=false`). Non-negotiable
   before real users.
2. **AI key** (highest visible impact) → real insights/assistant.
3. **Delete-cascade** + **audit domain-events** (compliance, pure code).
4. **Plaid sandbox keys** → unlocks bank linking + bill-pay funding.
5. Remaining providers (Stripe, push, QuickBooks) as needs/keys arrive.
6. **Hardening:** backups/restore drill, secrets manager, Sentry, CSP review.
7. **Mobile** store builds.

See **[04-ROADMAP-TO-LIVE.md](04-ROADMAP-TO-LIVE.md)** for these grouped into phases.

---

## 3.7 MyBusiness — SMB financial command center 🛠

A per-business "financial operating system" layered on the existing ledger + invoices,
built in phases on the **MyBusiness** page ([`finance-mvp/apps/web/src/pages/MyBusinessPage.jsx`](../finance-mvp/apps/web/src/pages/MyBusinessPage.jsx))
and `business-financials-service`.

**Shipped (2026-07-18):**
- [x] **Phase 1 — Command Center / Overview:** business health score, 90-day cash forecast +
      shortfall detection, AR aging, rule-based smart insights (all client-computed).
- [x] **Phase 2 — Collections & customers:** bulk "remind all overdue" (real invoice-send),
      recurring/subscription detector, per-customer payment behavior.
- [x] **Phase 3 — Reports:** cash-basis P&L, Balance Sheet, Cash Flow — CSV + print-to-PDF.
- [x] **Phase 4 — Budgets & variance** (table `business_budgets`, V14).
- [x] **Phase 5 — Goals:** cash reserve + tax set-aside (table `business_goals`, V15).
- [x] **Phase 6 — Vendor/procurement management:** computed vendor spend + persisted overlay
      (status/renewal/notes), renewal alerts (table `business_vendors`, V16).

**Pending — resume here (roughly high→low leverage):**
- [ ] 🛠 **Expense receipt capture** — mobile/upload receipt scan → OCR extract (reuse
      `pdfjs-dist` + the image-OCR path already in [`TaxPage.jsx`](../finance-mvp/apps/web/src/pages/TaxPage.jsx)) →
      auto-match to a transaction; attach via documents-service.
- [ ] 🛠 **Budget/goal/renewal alerts into the notification fan-out** — surface over-budget,
      cash-shortfall, and vendor-renewal warnings as real notifications, not just on-page.
- [ ] 🛠 **Advanced invoicing** — recurring/subscription invoices, milestone billing, partial
      payments/installments, a hosted customer payment portal. (multi-currency = 🔑)
- [ ] 🔑 **More accounting/payment/payroll integrations** beyond QuickBooks — Xero, Stripe,
      Square, Gusto, etc. (each gated behind its key, like the existing provider toggles).
- [ ] 🛠 **Approval workflows + field-level RBAC** for business roles (Owner/Finance/Bookkeeper/
      Accountant) — depends on the multi-user model.
- [ ] 🔑🏗 **Sales-tax / multi-jurisdiction tax engine** (or an Avalara-style integration).
- [ ] 🏗 **Financing marketplace** — loan/credit-line/invoice-financing readiness scoring.
- [ ] 🛠 **Benchmarking & vertical modules** — industry benchmarks; job-costing (construction),
      inventory (retail), time-tracking (services).
- [ ] 🛠 **Collaboration** — accountant/investor external portals, transaction notes/tasks.

Detail + rationale for each is captured in the `mybusiness-command-center` working memory.
