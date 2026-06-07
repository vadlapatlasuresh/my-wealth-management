# Workflows & Architecture — My Wealth Management

_Last updated: 2026-06-07_

This folder is the **single source of truth for how the system fits together** — at every level,
from the whole platform down to each individual service. Diagrams are written in
[Mermaid](https://mermaid.js.org/) so they render directly in GitHub and most IDEs.

## How to read this folder

| File | Level | What it covers |
|---|---|---|
| [01-high-level-architecture.md](01-high-level-architecture.md) | **High level** | The whole platform: clients → gateway → 10 services → databases → external providers. One picture of everything. |
| [02-web-app-workflows.md](02-web-app-workflows.md) | **Web app** | End-to-end web user journeys: boot/auth, dashboard load, Plaid link, bill pay, AI chat, remote-config + disclaimers. |
| [03-data-persistence-and-audit.md](03-data-persistence-and-audit.md) | **Cross-cutting** | **What external data we store**, where, tokens, and the **audit/compliance gap analysis**. (Answers the "are we saving member data for reference/audit?" question.) |
| [04-feature-status-and-gaps.md](04-feature-status-and-gaps.md) | **Cross-cutting** | Every feature: backend-wired vs mock vs hardcoded, and **what is pending** to be production-real. |
| [components/](components/) | **Granular** | One file per service — responsibility, endpoints, data model (ER), and sequence diagrams for each piece. |

### Component (per-service) files

| Service | File |
|---|---|
| API Gateway | [components/00-api-gateway.md](components/00-api-gateway.md) |
| Auth | [components/01-auth-service.md](components/01-auth-service.md) |
| Account Aggregation (Plaid) | [components/02-account-aggregation-service.md](components/02-account-aggregation-service.md) |
| Financial Core | [components/03-financial-core-service.md](components/03-financial-core-service.md) |
| Real Estate | [components/04-real-estate-service.md](components/04-real-estate-service.md) |
| Business Financials | [components/05-business-financials-service.md](components/05-business-financials-service.md) |
| AI Insights | [components/06-ai-insights-service.md](components/06-ai-insights-service.md) |
| Payment / Bill Pay | [components/07-payment-service.md](components/07-payment-service.md) |
| Notification | [components/08-notification-service.md](components/08-notification-service.md) |
| Platform Config / Content | [components/09-platform-config-service.md](components/09-platform-config-service.md) |
| **Audit / activity log** | [components/10-audit-service.md](components/10-audit-service.md) |
| **Customer Care / Support** | [components/11-customer-care.md](components/11-customer-care.md) |

## Legend (used across all diagrams)

- 🟢 **Real** integration (makes live external calls) — currently only **Plaid (sandbox)**.
- 🟡 **Mock** provider behind a real interface (swap via config; see each component file).
- 🗄️ **Persisted** to PostgreSQL (per-service schema).
- 🔑 **Secret/token** stored.

> Scope note: this reflects the backend as of the date above (10 Spring Boot services + React web).
> The mobile (Expo) and cross-platform packages are tracked separately in
> [docs/CROSS_PLATFORM_PROMPT.md](../CROSS_PLATFORM_PROMPT.md).
