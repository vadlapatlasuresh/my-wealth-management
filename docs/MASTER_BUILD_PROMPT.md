# TerraVest — Master Build / Redesign Prompt

Use this as a single, self-contained prompt to (re)build or redesign the entire
TerraVest platform. It is feature-complete at the spec level; for exhaustive
per-screen detail it references `docs/SCREEN_FEATURE_INVENTORY.md` (the screen
source of truth) and `docs/DESIGN_SYNC.md` (how designs stay in sync).

---

## 0) One-paragraph brief
Build **TerraVest**, a cross-platform personal **+ business** wealth-management
app — "All your wealth, one place." A single React/Vite codebase ships to **Web
(installable PWA), iOS, and Android** (Capacitor). A Spring Boot microservice
backend behind an API gateway aggregates real financial data (Plaid), computes net
worth, budgets, debt-payoff, goals, real estate, business financials, and
AI insights, with bank-grade auth, tamper-evident audit, observability, and a
config-driven, fully internationalized UI. Every external integration has a
deterministic **mock fallback** so the whole system runs with zero keys.

## 1) Platforms & delivery
- **One codebase:** `finance-mvp/apps/web` (React 18 + Vite, React Router).
- **PWA:** installable + offline app-shell (vite-plugin-pwa; SW off in dev).
- **iOS/Android:** Capacitor 8 wraps the same `dist/` (SPM on iOS, Gradle/JDK 21
  on Android). API base is environment-resolved (`localhost` / `10.0.2.2` /
  `VITE_API_BASE`). Dev needs `allowMixedContent` (Android) + ATS localhost (iOS);
  production uses HTTPS so neither is needed.

## 2) Backend architecture
- **API Gateway** (Spring Cloud Gateway, reactive, :8080) — single browser-facing
  entry; routes `/api/v1/*` to services; CORS; **generates/propagates an
  `X-Request-Id` correlation id**; captures every request as an audit event.
- **Services** (Spring Boot 3.2, Java 17; each own DB, Flyway, JWT filter):
  auth :8081 · account-aggregation/Plaid :8082 · financial-core (snapshot,
  budget, debt, goals, export) :8083 · real-estate/deals :8084 ·
  business-financials :8085 · ai-insights :8086 · payment/bill-pay :8087 ·
  notification/comms :8088 · platform-config (remote config + disclaimers) :8089 ·
  audit (hash-chained activity log) :8090.
- **Auth:** JWT (JJWT), principal = userId, shared `jwt.secret`; roles claim
  (USER/CARE/ADMIN); Spring Security per service. Bootstrap promotes an admin via
  `SUPPORT_BOOTSTRAP_EMAIL`.
- **Persistence:** Postgres per service in prod (Flyway-managed, `ddl-auto=none`);
  local dev via Homebrew Postgres (`deploy/init-local-db.sh` + `start-local.sh`).
- **Config-driven app:** platform-config serves nav modules/sections/flags/theme
  and versioned disclaimers from DB; the web nav renders from it with a bundled
  fallback (`moduleRegistry` + `remoteConfig`).

## 3) Integrations (provider-abstracted; mock until keyed)
Plaid (accounts/transactions, `/transactions/sync` pull + webhook) · Anthropic
(AI insights/chat, grounded in the user's real summary) · Twilio/SNS (SMS OTP +
alerts) · SendGrid/SES (email) · FCM/APNs (push) · Stripe or Plaid Transfer
(bill pay) · QuickBooks Online (business). Each: real impl + `Mock*Provider`
fallback selected by config/key; keys via env (`.env.local` dev / secret manager
prod). Access tokens encrypted at rest (AES-256-GCM).

## 4) Cross-cutting requirements
- **i18n / auto-translate:** i18next + browser language detect; bundled chrome
  translations (en,es,fr,de,pt,zh,hi,ja,ar) + whole-page machine translation
  (MyMemory default, LibreTranslate configurable); RTL for Arabic.
- **Themes:** Light / Dark / Glass (CSS variables on `html[data-theme]`).
- **Audit:** every state change recorded; **tamper-evident SHA-256 hash chain**
  with `GET /audit/verify`; user-facing `/audit/me`; admin analytics from the stream.
- **Observability:** Micrometer→Prometheus `/actuator/prometheus` on every service;
  correlation id in gateway, service logs (MDC), and across Feign hops; health probes.
- **Security/compliance:** SSN/EIN last-4 only; data **export** (`/me/export`) +
  account **delete**; disclaimers ("not financial advice"); `/error` permitAll so
  500s aren't masked as 403.

## 5) Design system
- Brand: forest `#1A4D3B` + gold `#C9973A`; sage accents; semantic
  positive/negative/warning. Fonts: **Fraunces / DM Serif Display** (display) +
  **DM Sans** (body); tabular numerics. Tabler icons.
- Components: cards, kpi-grid/kpi-card, stat-tile, list-item, segmented controls,
  badges, progress bars, forms, empty-states, the interactive **NetWorthChart**
  (Area/Line/Bars + gradient + hover + danger palette on >15% drop).
- Layout: forest sidebar (collapsible + mobile drawer) + topbar; responsive
  (≤900px drawer, ≤600px single-column). Single design system file
  `terravest-theme.css`.
- **Design mockups** must mirror the app at full depth in all three files
  (web/iOS/Android) per `DESIGN_SYNC.md`.

## 6) Features — build every screen to the depth in SCREEN_FEATURE_INVENTORY.md
Screens (each with the full sections/tabs/controls/data/states from the inventory):
**Home** (net-worth chart w/ range + Area/Line/Bars + downfall alert + "what moved
it" contributors, KPI cards, upcoming bills, AI insight) · **Accounts** (grouped,
Plaid link) · **Transactions** (filters: date/amount/category/sort; categories) ·
**Budget** (50/30/20 presets + period + Needs/Wants/Savings + alerts) · **Pay
Bills** (multi-step: payee→amount→funding→schedule→confirm, idempotent, cancel) ·
**Debt Lab** (debts table, extra payment, Avalanche/Snowball/Hybrid explainers,
recommended plan, cross-strategy comparison w/ Cheapest/Fastest + cost bars) ·
**Investments** (Holdings, Brokers connect, Alternatives, Marketplace) ·
**My Business** (multi-business, P&L, cash flow, invoices, QuickBooks) ·
**AI Assistant** (scope, response styles, prompt library, voice, disclaimer) ·
**Calculators** (mortgage payoff/extra-payment, compound, simple) · **Goals**
(targets, progress, required-monthly) · **Properties** (auto-estimate, equity,
rental cap-rate) · **Deal Room** (deals, marketplace, leads, docs, track record) ·
**Fractional LLC** · **Security** (2FA, sessions, login history from audit) ·
**Messages** · **Settings** (notifications, appearance, regional, data&privacy) ·
**Profile** · **Admin · Analytics** (role-gated KPIs) · **Customer Care** (member
360) · **Auth** (sign in / sign up: first/last/email/phone, Individual/Business,
SSN/EIN, SMS OTP).

## 7) Non-functional & acceptance
- **Tests:** Vitest (web pure logic — net worth, calculators, formats) + JUnit/
  Mockito (services) + a Playwright happy-path; run in CI (`mvn verify` + web test).
- **CI/CD:** GitHub Actions builds/tests every service + web, builds multi-arch
  images to GHCR; `docker-compose.prod.yml` + Caddy for Dev→QA→Prod.
- **Acceptance:** a real user can sign up → link a bank (Plaid) → see real net
  worth/transactions/budgets → set goals → run debt/calculator scenarios → on
  web, iOS, and Android; admins see analytics; all activity is hash-chain audited;
  no mock data on any wired path; designs match the app.

## 8) Build order
Auth+gateway+config → Plaid aggregation → financial-core (snapshot/budget/debt/
goals) → real-estate/business → AI/notifications/payments → audit+observability →
i18n/themes → PWA+Capacitor → tests/CI → deploy. Keep mock fallbacks throughout so
it runs keyless at every step.
