# Architecture & Flow Documentation

Complete, detailed documentation of the My Wealth Management platform — system architecture,
every API, and end-to-end flow diagrams (UI → API Gateway → service → endpoint → database).

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

## The universal request pattern

Every authenticated call follows the same path:

```
React page (apps/web/src/pages/*.jsx)
   → api.js helper (adds Authorization: Bearer <JWT>)
      → fetch http://localhost:8080  (API GATEWAY, :8080)
         → routed by path prefix to the owning service (:808x)
            → JwtAuthFilter validates the token (shared secret) → sets userId
               → Controller (@RequestMapping /api/v1/...)
                  → Service (userId = SecurityContext principal name)
                     → JPA Repository → H2 (dev) / Postgres (prod)
            ← JSON response (single Access-Control-Allow-Origin header added by the gateway)
```

See [system-architecture.md](system-architecture.md) for the component diagram and
[api-reference.md](api-reference.md) for the full endpoint catalog.
