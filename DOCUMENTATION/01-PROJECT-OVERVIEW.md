# 1. Project Overview

## 1.1 What TerraVest is

**TerraVest** (the code lives in [`finance-mvp/`](../finance-mvp/)) is a **personal +
business wealth-management platform**. Its tagline is *"All your wealth, one place."*

A user can:
- Sign up and log in securely (with multi-factor authentication).
- Link their real bank and investment accounts (via Plaid) and see balances + transactions.
- See a consolidated **net worth** number and how it changes over time.
- Set **budgets**, track **debts** and run payoff scenarios, and set **financial goals**.
- Track **real estate** properties and valuations, and browse a **Deal Room** (a marketplace
  of real-estate sponsor deals).
- Connect **business financials** (QuickBooks-style P&L, invoices, expenses).
- Get **AI insights** and chat with an AI assistant grounded in their real numbers.
- Pay bills, receive notifications, and manage their profile/security.

It ships to **three platforms from one codebase**: an installable **web app (PWA)**, **iOS**,
and **Android** (the phone apps are the web app wrapped with Capacitor).

## 1.2 The strategy (why it exists, where it's going)

> A "net-worth dashboard for everyone" is a crowded, commoditized market (Mint, Monarch,
> Copilot, Empower). TerraVest's **defensible wedge is an underserved niche the codebase
> already targets: self-employed people / business owners with real estate.** That's why
> there are dedicated **business-financials** and **real-estate** services.

The intended path to a venture-scale business:
1. **Trusted dashboard** (where we are now) → real data, no fake numbers in a finance app.
2. **Advice** → AI + planning tools tuned to the self-employed/real-estate niche.
3. **A financial product** → lending, cash management, or advisory/AUM.

Funding follows **traction in the niche** (≈50–100 weekly users), not the idea. So new work
should favor the wedge (self-employed + real estate) and trust/credibility over breadth.

## 1.3 Architecture at a glance

```
                          ┌─────────────────────────────────────────┐
   Browser / Phone  ──►   │  Caddy (web server + HTTPS + reverse     │
   (the React app)        │  proxy on the GCP VM)                    │
                          │   • serves the website at  /             │
                          │   • forwards  /api/*  to the gateway     │
                          └───────────────┬─────────────────────────┘
                                          │
                                  ┌───────▼────────┐
                                  │  API Gateway   │  :8080  (single front door)
                                  │  routing, CORS,│
                                  │  auth, audit   │
                                  └───────┬────────┘
        ┌──────────────┬─────────────┬────┴────────┬──────────────┬───────────────┐
        ▼              ▼             ▼             ▼              ▼               ▼
   auth-service   account-agg   financial-core  real-estate   business-fin   ai-insights
     :8081          :8082          :8083          :8084          :8085          :8086
        │              │             │             │              │               │
        ▼              ▼             ▼             ▼              ▼               ▼
   payment-svc    notification   platform-config  audit-service   (+ legacy Node API :4000,
     :8087          :8088          :8089           :8090            being retired)

   Each service → its own Neon Postgres database (one DB per service).
```

**Frontend:** [`finance-mvp/apps/web`](../finance-mvp/apps/web/) — React 18 + Vite + React
Router. Single design system in [`src/styles/terravest-theme.css`](../finance-mvp/apps/web/src/styles/terravest-theme.css).
It talks **only** to the API gateway.

> ⚠️ **Gotcha:** [`apps/web/src/styles.css`](../finance-mvp/apps/web/src/styles.css) is **dead
> code** — it is not imported anywhere. All styling lives in
> [`terravest-theme.css`](../finance-mvp/apps/web/src/styles/terravest-theme.css). The
> light/dark/glass theme system is in [`src/theme.js`](../finance-mvp/apps/web/src/theme.js).

**Backend:** Java 17 / Spring Boot 3.2 microservices. Each has its own database, its own
Flyway migrations, and a JWT filter. The **JWT secret is shared across all services**, so a
token issued by auth-service is trusted everywhere.

| # | Service | Port | Responsibility | External API |
|---|---|---|---|---|
| 1 | **api-gateway** | 8080 | Single entry point: routing, CORS, auth, `X-Request-Id` correlation, audit capture | — |
| 2 | **auth-service** | 8081 | Registration, login, JWT, MFA, customer-care/support, encrypted SSN/EIN | — |
| 3 | **account-aggregation-service** | 8082 | Link accounts, balances, transactions | **Plaid** |
| 4 | **financial-core-service** | 8083 | Net-worth snapshot, budgets, debts, goals, planning, data export | — |
| 5 | **real-estate-service** | 8084 | Properties, valuations, Deal Room (sponsor marketplace) | **RentCast** |
| 6 | **business-financials-service** | 8085 | P&L, invoices, expenses | **QuickBooks Online** |
| 7 | **ai-insights-service** | 8086 | AI insights + chat | **Anthropic Claude / Google Gemini** |
| 8 | **payment-service** | 8087 | Bill-pay intents, billing | **Stripe** |
| 9 | **notification-service** | 8088 | Email / SMS / push / in-app notifications | **SendGrid / Twilio / Firebase** |
| 10 | **platform-config-service** | 8089 | Feature flags, nav config, versioned disclaimers/content | — |
| 11 | **audit-service** | 8090 | Tamper-evident (hash-chained) activity log | — |
| — | **secrets-service** | internal | Centralized encrypted secret store (KEK via Cloud KMS or local) | Cloud KMS |
| — | (legacy) **Node API** | 4000 | Old mock `/v1/**` routes — superseded, being retired | SQLite |

**Persistence:** Neon Postgres in production (one DB per service, Flyway-managed,
`ddl-auto=none`). Local dev can use **H2 in-memory** (default, zero setup) or **local
Postgres** for persistence (see [05-WORKFLOWS.md](05-WORKFLOWS.md) §2).

**Provider abstraction:** every external integration is a Spring bean gated by a `*.provider`
config flag, defaulting to a deterministic **mock**. The real implementation is annotated
`@Primary @ConditionalOnProperty` and falls back to the mock if the key is missing or the
call errors. See [06-APIS-AND-KEYS.md](06-APIS-AND-KEYS.md).

## 1.4 Cross-cutting capabilities

- **Auth:** JWT (JJWT), principal = userId, roles claim (USER / CARE / ADMIN), Spring Security
  per service. MFA via email/SMS OTP.
- **Audit:** every state change recorded in a **tamper-evident SHA-256 hash chain**
  (`GET /api/v1/audit/verify` proves it wasn't altered). User-facing `/audit/me`.
- **Observability:** Micrometer → Prometheus `/actuator/prometheus` on every service;
  `X-Request-Id` correlation id flows through the gateway, service logs (MDC), and Feign hops.
- **i18n:** i18next + browser language detection; bundled translations for en, es, fr, de, pt,
  zh, hi, ja, ar; whole-page machine translation; RTL for Arabic.
- **Themes:** Light / Dark / Glass (CSS variables on `html[data-theme]`).
- **Security/compliance:** SSN/EIN stored last-4 / encrypted; data **export** (`/me/export`)
  and account **delete**; "not financial advice" disclaimers.

## 1.5 Where things live (the map)

| Thing | Location |
|---|---|
| Live URL | https://app.terravest.app |
| Server (VM) | GCP Compute Engine `terravest-prod`, IP `34.139.32.148`, us-east1 |
| Database | Neon Postgres (cloud), one DB per service |
| Container images | GitHub Container Registry (GHCR), **private** |
| Code | GitHub repo `vadlapatlasuresh/my-wealth-management`, branch `main` |
| Infra-as-code | [`finance-mvp/infra/gcp/`](../finance-mvp/infra/gcp/) (Terraform) |
| Prod compose file | [`finance-mvp/docker-compose.prod.yml`](../finance-mvp/docker-compose.prod.yml) |
| Web/Caddy config | [`finance-mvp/Caddyfile`](../finance-mvp/Caddyfile) |
| Deploy script | [`finance-mvp/deploy/deploy.sh`](../finance-mvp/deploy/deploy.sh) (runs on the VM) |
| Secrets (the one file) | `finance-mvp/.env.prod` — **lives only on the VM**, never in git |
| DNS / domain | Cloudflare (registrar + DNS); `app` A-record → VM IP, DNS-only/grey-cloud |
| SSH key to VM | `~/.ssh/terravest_deploy` (user `deploy`) |

Continue to **[02-COMPLETED.md](02-COMPLETED.md)** for exactly what is built and working.
