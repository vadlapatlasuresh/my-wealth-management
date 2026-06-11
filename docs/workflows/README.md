# Workflows & Architecture — My Wealth Management

_Last updated: 2026-06-07 (refreshed against the live code: gateway routes, MFA login, Goals, Deal Room, audit, Customer Care)_

This folder is the **single source of truth for how the system fits together** — at every level,
from the whole platform down to each individual service. Diagrams are written in
[Mermaid](https://mermaid.js.org/) so they render directly in GitHub and most IDEs.

## How to read this folder

| File | Level | What it covers |
|---|---|---|
| [01-high-level-architecture.md](01-high-level-architecture.md) | **High level** | The whole platform: clients → gateway → **11 services** → databases → external providers. Gateway routing (16 routes), auth + roles model. One picture of everything. |
| [02-web-app-workflows.md](02-web-app-workflows.md) | **Web app** | End-to-end web user journeys (flows A–N): boot + **MFA login**, dashboard load, remote config, Plaid link, bill pay, AI chat, **goals, calculators, budget/debt, Deal Room, profile, data export/delete, security, admin & customer-care consoles**. |
| [03-data-persistence-and-audit.md](03-data-persistence-and-audit.md) | **Cross-cutting** | **What external data we store**, where, tokens, the data-export/deletion tooling, and the **audit/compliance gap analysis**. (Answers the "are we saving member data for reference/audit?" question.) |
| [04-feature-status-and-gaps.md](04-feature-status-and-gaps.md) | **Cross-cutting** | Every feature: backend-wired vs mock vs hardcoded, and **what is pending** to be production-real. |
| [05-end-to-end-process-flows.md](05-end-to-end-process-flows.md) | **Granular, step-by-step** | The full request pipeline (client → gateway → JWT → routing → secrets/config → DB → response → audit) **and** the UI workflows (interaction → trigger → response → component data flow), with sequence diagrams and a single end-to-end vertical slice. |
| [components/](components/) | **Granular** | One file per service/feature area — responsibility, endpoints, data model (ER), and sequence diagrams for each piece. |

### Component (per-service / per-feature) files

| Service / feature area | File |
|---|---|
| API Gateway (+ audit filter) | [components/00-api-gateway.md](components/00-api-gateway.md) |
| Auth (MFA login, email/SMS verify, profile, roles) | [components/01-auth-service.md](components/01-auth-service.md) |
| Account Aggregation (Plaid) | [components/02-account-aggregation-service.md](components/02-account-aggregation-service.md) |
| Financial Core (snapshot, budgets, debt, **goals**, export) | [components/03-financial-core-service.md](components/03-financial-core-service.md) |
| Real Estate (properties + valuation) | [components/04-real-estate-service.md](components/04-real-estate-service.md) |
| Business Financials (QuickBooks) | [components/05-business-financials-service.md](components/05-business-financials-service.md) |
| AI Insights (insights + chat) | [components/06-ai-insights-service.md](components/06-ai-insights-service.md) |
| Payment / Bill Pay | [components/07-payment-service.md](components/07-payment-service.md) |
| Notification (inbox, prefs, channel router) | [components/08-notification-service.md](components/08-notification-service.md) |
| Platform Config / Content (flags, disclaimers) | [components/09-platform-config-service.md](components/09-platform-config-service.md) |
| Audit / activity log | [components/10-audit-service.md](components/10-audit-service.md) |
| Customer Care / Support (roles, member 360) | [components/11-customer-care.md](components/11-customer-care.md) |
| **Deal Room: Deals & Sponsor** (in real-estate-service) | [components/12-deals-and-sponsor-service.md](components/12-deals-and-sponsor-service.md) |
| **Client-only features** (Invest, Fractional LLC, Calculators, Learn/Guide) | [components/13-client-only-features.md](components/13-client-only-features.md) |

## Legend (used across all diagrams)

- 🟢 **Real** integration (makes live external calls) — currently only **Plaid (sandbox)**.
- 🟡 **Mock** provider behind a real interface (swap via config; see each component file).
- ⬜ **Client-only** (no backend; hardcoded / localStorage).
- 🗄️ **Persisted** to PostgreSQL (per-service schema).
- 🔑 **Secret/token** stored.

> Scope note: this reflects the backend as of the date above (**11 Spring Boot services + gateway**
> + React web). The Node `api` and `integrator-java` apps are local placeholders (not routed or
> deployed). The mobile (Expo) and cross-platform packages are tracked separately in
> [docs/CROSS_PLATFORM_PROMPT.md](../CROSS_PLATFORM_PROMPT.md) and [docs/MOBILE.md](../MOBILE.md).
