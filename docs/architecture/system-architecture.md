# System Architecture

## Component diagram

```mermaid
flowchart TB
  subgraph Client
    WEB["Web app (React + Vite)\nlocalhost:5173"]
    MOB["Mobile app (Expo/React Native)\n(Phase 8 scaffold)"]
  end

  GW["API Gateway (Spring Cloud Gateway)\nlocalhost:8080\n• routing by path prefix\n• single CORS authority"]

  WEB -->|"HTTPS/JSON + JWT"| GW
  MOB -->|"HTTPS/JSON + JWT"| GW

  GW -->|/api/v1/auth/**| AUTH["auth-service :8081\nregister / login / JWT"]
  GW -->|/api/v1/aggregation/**| AGG["account-aggregation-service :8082\nPlaid: link, accounts, transactions"]
  GW -->|"/api/v1/me/**, /api/v1/planning/**"| FIN["financial-core-service :8083\nsnapshot, budgets, debt"]
  GW -->|/api/v1/real-estate/**| RE["real-estate-service :8084\nproperties + valuation"]
  GW -->|/api/v1/business/**| BIZ["business-financials-service :8085\nQuickBooks (mock)"]
  GW -->|/api/v1/ai/**| AI["ai-insights-service :8086\ninsights + chat"]
  GW -->|/api/v1/payments/**| PAY["payment-service :8087\nbill pay (Stripe mock)"]
  GW -->|/api/v1/notifications/**| NOT["notification-service :8088\nprefs + log"]
  GW -->|/v1/** (legacy)| NODE["Node API :4000\nSQLite (being retired)"]

  AGG -->|REST| PLAID[("Plaid API\nsandbox")]
  AUTH --- DBA[("H2 / Postgres")]
  AGG --- DBB[("H2 / Postgres")]
  FIN --- DBC[("H2 / Postgres")]
  RE --- DBD[("H2 / Postgres")]
  BIZ --- DBE[("H2 / Postgres")]
  AI --- DBF[("H2 / Postgres")]
  PAY --- DBG[("H2 / Postgres")]
  NOT --- DBH[("H2 / Postgres")]
```

## Services & ports

| Service | Port | Path prefix(es) | DB (dev) | External |
|---|---|---|---|---|
| api-gateway | 8080 | (routes all) | — | — |
| auth-service | 8081 | `/api/v1/auth` | H2 `authdb` | — |
| account-aggregation-service | 8082 | `/api/v1/aggregation` | H2 `aggdb` | Plaid (`plaid-java 35`) |
| financial-core-service | 8083 | `/api/v1/me`, `/api/v1/planning` | H2 `financialdb` | — |
| real-estate-service | 8084 | `/api/v1/real-estate` | H2 `realestatedb` | valuation (mock) |
| business-financials-service | 8085 | `/api/v1/business` | H2 `businessdb` | QuickBooks (mock) |
| ai-insights-service | 8086 | `/api/v1/ai` | H2 `aidb` | LLM (mock) |
| payment-service | 8087 | `/api/v1/payments` | H2 `paymentdb` | Stripe (mock) |
| notification-service | 8088 | `/api/v1/notifications` | H2 `notifdb` | email/push (mock) |
| Node legacy API | 4000 | `/v1/**` | SQLite | — (retiring) |
| Web (Vite) | 5173 | — | — | — |

> **Mock providers:** Phases 3–7 integrate external systems behind a provider interface with a
> working **mock** implementation (no real keys needed). Swapping to the real provider is a
> config + one-class change — see each phase doc and `flows/`.

## Tech stack
- **Backend:** Java 17, Spring Boot 3.2.5, Spring Security, Spring Data JPA, Flyway, Spring Cloud
  Gateway (reactive), JJWT 0.11.5, Lombok. H2 (dev) / PostgreSQL (prod).
- **Frontend:** React 18, Vite 5, React Router, single CSS design system (`terravest-theme.css`).
- **Mobile:** Expo / React Native (scaffold).

## Cross-cutting concerns

### Authentication (JWT)
- `auth-service` issues an HS256 JWT with `sub = userId` on login/register.
- The web client stores it (`localStorage`) and sends `Authorization: Bearer <jwt>` on every call.
- Each service has an identical `JwtAuthFilter` + `JwtService` using the **same shared secret**
  (`jwt.secret`), so a gateway-issued token validates everywhere. The authenticated principal's
  name **is** the `userId`; services read it via
  `Long.valueOf(SecurityContextHolder.getContext().getAuthentication().getName())`.
- On `401/403` the web client clears the token and returns to the login screen.

### CORS
- Handled **only** at the gateway (`GatewayCorsConfig` reactive `CorsWebFilter`). Downstream
  services and the Node API do **not** emit CORS headers, so responses carry exactly one
  `Access-Control-Allow-Origin`.

### Data isolation
- Every domain table has a `user_id`; every query is scoped to the authenticated user.

## Deployment topology (Phase 9)
- `docker-compose.yml` provides Postgres locally; `Dockerfile.java-service` is a shared
  multi-stage image template (`--build-arg SERVICE=<name>`); `.github/workflows/ci.yml` builds
  all services + the web app on push/PR. Secrets move to env / a secret manager (`.env.example`).
