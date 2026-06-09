# Architecture & Flow Documentation

Complete, detailed documentation of the My Wealth Management platform — system architecture,
every API, and end-to-end flow diagrams (UI → API Gateway → service → endpoint → database).

> _Refreshed 2026-06-07 against the live code: **11 services** behind the gateway (audit-service
> added), MFA login, roles, and the Goals / Deal Room / Audit / Customer Care features._ For an
> alternate, leveled view of the same system see [docs/workflows/](../workflows/README.md).

## Contents

| Doc | What it covers |
|---|---|
| [system-architecture.md](system-architecture.md) | Components, ports, tech stack, deployment topology, cross-cutting concerns (auth, CORS) |
| [api-reference.md](api-reference.md) | Every endpoint: UI method → gateway route → service → controller → DB table |
| [flows/](flows/) | Per-feature sequence diagrams and request tracing |

## Flows

| # | Flow | Service(s) |
|---|---|---|
| 01 | [Authentication](flows/01-auth-flow.md) | auth-service |
| 02 | [Account linking (Plaid)](flows/02-account-linking-plaid-flow.md) | account-aggregation-service |
| 03 | [Transactions](flows/03-transactions-flow.md) | account-aggregation-service |
| 04 | [Net-worth snapshot](flows/04-net-worth-snapshot-flow.md) | financial-core-service |
| 05 | [Budgets & debt](flows/05-budget-debt-flow.md) | financial-core-service |
| 06 | [Real estate](flows/06-real-estate-flow.md) | real-estate-service |
| 07 | [Business financials](flows/07-business-financials-flow.md) | business-financials-service |
| 08 | [AI insights & chat](flows/08-ai-insights-flow.md) | ai-insights-service |
| 09 | [Bill pay (payments)](flows/09-payments-billpay-flow.md) | payment-service |
| 10 | [Notifications](flows/10-notifications-flow.md) | notification-service |
| 11 | [Goals](flows/11-goals-flow.md) | financial-core-service |
| 12 | [Deal Room (deals & sponsor)](flows/12-deal-room-flow.md) | real-estate-service |
| 13 | [Audit & Customer Care](flows/13-audit-and-customer-care-flow.md) | audit-service · auth-service |

## The universal request pattern

Every authenticated call follows the same path:

```
React page (apps/web/src/pages/*.jsx)
   → api.js helper (adds Authorization: Bearer <JWT>)
      → fetch http://localhost:8080  (API GATEWAY, :8080)
         → routed by path prefix to the owning service (:808x)
            → JwtAuthFilter validates the token (shared secret) → sets userId + roles (ROLE_*)
               → Controller (@RequestMapping /api/v1/...)
                  → Service (userId = SecurityContext principal name)
                     → JPA Repository → H2 (dev) / Postgres (prod)
            ← JSON response (single Access-Control-Allow-Origin header added by the gateway)
   (in parallel) the gateway's audit filter fire-and-forgets the request to audit-service :8090
```

> **Co-hosted feature areas:** some path prefixes share a service — `/support` runs in auth-service,
> `/deals` + `/sponsor` in real-estate-service, and `/planning/goals` in financial-core-service.

See [system-architecture.md](system-architecture.md) for the component diagram and
[api-reference.md](api-reference.md) for the full endpoint catalog.
