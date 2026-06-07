# TerraVest — Production Readiness Master Plan

The single source of truth for taking **every feature** from "works in dev with
mocks" to "production-ready". It sequences and references the two existing plans
rather than repeating them:
- Infra / deploy: [DEPLOYMENT_PLAN.md](./DEPLOYMENT_PLAN.md) (Dev→QA→Prod)
- Removing mocks: [REAL_DATA_PLAN.md](./REAL_DATA_PLAN.md) (18 data items)

Legend: 🛠 I can do now (pure code) · 🔑 needs a credential/decision from you ·
✅ done · ⏳ in progress · ⬜ todo · **Gate** = acceptance criteria to pass before moving on.

---

## 0. Inputs I need from you (unblocks 🔑 items)
Drop these in `apps/web/.env` and per-service env / `.env.prod` (templates exist:
`.env.prod.example`, `.env.cross-platform.example`). Mocks stay active until set.

| # | Decision / key | Used by | Note |
|---|---|---|---|
| 0.1 | **Plaid** client id + secret (sandbox first) | accounts, transactions | free sandbox; feeds net worth |
| 0.2 | **Anthropic** API key | AI insights + assistant | else mock insights |
| 0.3 | **Twilio** (or AWS SNS) | SMS OTP + SMS notifications | signup OTP today returns code in dev |
| 0.4 | **SendGrid** (or SES) | email notifications | |
| 0.5 | **FCM/APNs** keys | push notifications + mobile | |
| 0.6 | **Stripe** (or Plaid Transfer) | payments / bill pay | |
| 0.7 | **QuickBooks Online** OAuth app | My Business | else mock business data |
| 0.8 | Hosting choice + domain | deploy | see DEPLOYMENT_PLAN §0 |
| 0.9 | Postgres instance (managed) | all services in prod | DEPLOYMENT_PLAN §0 |

> You don't need all at once. **Plaid + Postgres + a domain** unblock the core;
> the rest can light up feature-by-feature.

---

## Milestone M1 — Real data backbone 🛠 (no keys; biggest visible win)
From REAL_DATA_PLAN Phase 1. Everything downstream renders from these.
- ⬜ M1.1 Net-worth components computed from real accounts/real-estate (kill the
  hardcoded `15732/2320/…` and the `BigDecimal.ZERO` placeholders).
- ⬜ M1.2 `net_worth_snapshot` table + daily scheduled job; chart series &
  `change30d` served from real history (honest "building history" until enough).
- ⬜ M1.3 Budget alerts computed from real lines vs spend.
- ⬜ M1.4 Upcoming bills from real scheduled intents + recurring-txn detection.
- ⬜ M1.5 Investment holdings from real linked accounts (empty state if none).
- **Gate:** Home, Budget, Investments show only real/derived values or honest
  empty states; no constant appears in any response. Verified on web + Android.

## Milestone M2 — Per-feature completion to "real + complete + tested"
Each feature: real data path, full happy + error paths, validation, and a test.
- ⬜ M2.1 **Accounts/Transactions** (Plaid 🔑) — link → sync → display; manual-add
  fallback works without Plaid. Webhook verification ON in prod.
- ⬜ M2.2 **Budget** 🛠 — periods (month/YTD/12mo), custom rules persist, alerts.
- ⬜ M2.3 **Pay Bills** (Stripe/Plaid Transfer 🔑) — schedule, idempotency, cancel,
  confirmation, status webhooks; real funding/payee validation.
- ⬜ M2.4 **Debt Lab** 🛠 — strategies from real debts/balances; persist scenarios.
- ⬜ M2.5 **Investments** 🛠/🔑 — stocks from linked brokers; alternatives from a
  real endpoint (M3.1).
- ⬜ M2.6 **Real Estate** 🛠 — manual + auto-estimate; persist; equity from real
  mortgage. (Valuation provider optional 🔑.)
- ⬜ M2.7 **My Business** (QuickBooks 🔑) — connect → real P&L/cash flow; manual
  fallback.
- ⬜ M2.8 **AI Assistant** (Anthropic 🔑) — real insights/chat over the user's real
  portfolio; mock fallback stays.
- ⬜ M2.9 **Notifications** (Twilio/SendGrid/FCM 🔑) — real delivery; prefs; quiet
  hours; templates from DB.
- **Gate:** each feature has: real source wired, error states, input validation,
  and ≥1 integration test green in CI.

## Milestone M3 — Retire remaining hardcoded UI 🛠
- ⬜ M3.1 Investments→Alternatives endpoint (replace `MOCK_OFFERINGS`).
- ⬜ M3.2 Deal Room real endpoint or honest empty state.
- ⬜ M3.3 Fractional LLC real endpoint or empty state.
- ⬜ M3.4 Security page: real events from **audit-service**; real 2FA or hide.
- ⬜ M3.5 Delete dead `MOCK`/`USE_MOCK` in `api.js`; remove legacy integrator route.
- **Gate:** grep for `mock|MOCK|hardcoded|MOCK_OFFERINGS` in `apps/web/src` returns
  only comments, not data.

## Milestone M4 — Security hardening 🛠/🔑 (see PHASE_9_HARDENING)
- ⬜ M4.1 `/error` permitAll + a `@RestControllerAdvice` on **every** service (the
  recurring 500→403 masking bug — auth fixed; replicate everywhere).
- ⬜ M4.2 Secrets out of code → env/secret manager; rotate `JWT_SECRET`,
  `APP_ENCRYPTION_KEY`; same across services.
- ⬜ M4.3 Encrypt Plaid/provider tokens at rest (`APP_ENCRYPTION_KEY`).
- ⬜ M4.4 Gateway: rate limiting, CORS allowlist, security headers, request-size limits.
- ⬜ M4.5 Input validation (`@Valid`) on all request DTOs; consistent error JSON.
- ⬜ M4.6 SSN/EIN: confirm only last-4 stored; PII review.
- ⬜ M4.7 HTTPS everywhere (Caddy/TLS); disable cleartext + mixed-content in prod
  builds (Android `allowMixedContent:false`, drop iOS ATS local exception).
- **Gate:** `security-review` / `/security-review` passes; no plaintext secrets; all
  services return proper status codes (no masked 403s).

## Milestone M5 — Persistence & data integrity 🔑(db)
- ✅ M5.1 All services on **Postgres** for local dev (Postgres 16 via Homebrew,
  one DB per service, Flyway applied). Scripts: `deploy/init-local-db.sh` (one-time)
  + `deploy/start-local.sh` (runs the stack on Postgres, caps Hikari pools so 10
  services fit the 100-connection limit). **Verified: data survives restarts.**
- ✅ M5.2 Flyway owns schema (`ddl-auto=none`); migrations apply cleanly on Postgres.
- ⬜ M5.3 Managed Postgres in prod + backups/PITR; restore drill. 🔑(db host)
- **Gate (dev):** full stack boots on Postgres; data survives restarts ✅.
  Prod gate (managed instance + restore) pending a DB host choice.

## Milestone M6 — Quality gates 🛠
- ⬜ M6.1 Unit + integration tests per service (CI already runs `mvn verify`).
- ⬜ M6.2 Web unit tests (Vitest) + a Playwright E2E happy-path (login→dashboard→pay).
- ⬜ M6.3 Coverage threshold in CI; flaky-test triage.
- **Gate:** CI green with tests RUN (not skipped); E2E passes on every PR.

## Milestone M7 — Observability 🛠
- ⬜ M7.1 Structured JSON logs + correlation/request id through the gateway.
- ⬜ M7.2 Actuator health/readiness wired to the orchestrator; `/metrics` (Prometheus).
- ⬜ M7.3 Error tracking (Sentry/equiv) web + services; uptime + alert on 5xx/SLO.
- **Gate:** a synthetic failure pages an alert; dashboards show per-service health.

## Milestone M8 — Deploy Dev→QA→Prod 🔑(infra)
Follow [DEPLOYMENT_PLAN.md](./DEPLOYMENT_PLAN.md) §3 (it's already a 7-day plan).
- ⬜ M8.1 DEV env in cloud (compose + Caddy), images from GHCR by SHA.
- ⬜ M8.2 QA env + E2E gate.
- ⬜ M8.3 PROD env, manual-approval promotion of the same SHA, HTTPS, domain.
- **Gate:** one-command promote of a tested SHA; rollback drill passes.

## Milestone M9 — Mobile store readiness 🔑
- ⏳ M9.1 Finish the **iOS** simulator run (build was mid-compile; resume).
- ⬜ M9.2 App icons/splash, status bar, push (FCM/APNs), deep links.
- ⬜ M9.3 Signing: Android keystore + Apple cert/profile as CI secrets; enable the
  gated mobile CI job → produce `.aab`/`.ipa`.
- ⬜ M9.4 Store listings (screenshots from `assets/mobile/`, privacy, descriptions).
- **Gate:** signed builds install on a real device; TestFlight/Internal track live.

## Milestone M10 — Go-live & post-launch 🔑
- ⬜ M10.1 Go-live checklist (DEPLOYMENT_PLAN §7), data-privacy/compliance review.
- ⬜ M10.2 Runbooks, on-call, incident process; status page.
- ⬜ M10.3 Post-launch: monitor SLOs, backlog the optional 🔑 providers not yet lit.
- **Gate:** real user can sign up → link/enter accounts → use every feature in prod.

---

## Suggested order (what I'd execute, top to bottom)
1. **M1** (real data, no keys) → 2. **M4.1/M4.5** (error handling + validation
everywhere) → 3. **M3** (kill hardcoded UI) → 4. **M2** feature-by-feature as keys
arrive (Plaid first) → 5. **M5** Postgres verify → 6. **M6** tests → 7. **M7** obs
→ 8. **M8** deploy → 9. **M9** mobile → 10. **M10** go-live.

I can start **M1.1 now** (real net-worth components — pure code, no keys).
```
Status: M1 ⬜  M2 ⬜  M3 ⬜  M4 ⬜  M5 ⬜  M6 ⬜  M7 ⬜  M8 ⬜  M9 ⏳  M10 ⬜
```
