# 01 · High-Level Architecture

The whole platform in one view: clients talk **only** to the API Gateway; the gateway routes to
10 Spring Boot services; each stateful service owns its data in PostgreSQL (schema-per-service);
external providers sit behind provider interfaces (only Plaid is live today).

## System container diagram

```mermaid
flowchart TB
    subgraph Clients
        WEB["Web app<br/>React 18 + Vite"]
        MOB["Mobile (Expo)<br/>scaffold"]
    end

    GW["API Gateway :8080<br/>Spring Cloud Gateway<br/>routing • CORS"]

    subgraph Services["Spring Boot services (JWT-secured)"]
        AUTH["auth :8081 🗄️"]
        AGG["account-aggregation :8082 🗄️🔑"]
        CORE["financial-core :8083 🗄️"]
        RE["real-estate :8084 🗄️"]
        BIZ["business-financials :8085 🗄️"]
        AI["ai-insights :8086 🗄️"]
        PAY["payment :8087 🗄️"]
        NOTIF["notification :8088 🗄️"]
        CFG["platform-config :8089 🗄️"]
    end

    subgraph Data["PostgreSQL (schema per service)"]
        DB[("Neon / Postgres")]
    end

    subgraph External["External providers"]
        PLAID["Plaid 🟢 (sandbox)"]
        STRIPE["Stripe 🟡 mock"]
        QBO["QuickBooks 🟡 mock"]
        LLM["LLM (Claude/OpenAI) 🟡 mock"]
        REVAL["RE valuation 🟡 mock"]
        COMMS["Email/SMS/Push 🟡 mock"]
    end

    WEB --> GW
    MOB --> GW
    GW --> AUTH & AGG & CORE & RE & BIZ & AI & PAY & NOTIF & CFG

    CORE -. "Feign (via gateway)" .-> AGG

    AUTH & AGG & CORE & RE & BIZ & AI & PAY & NOTIF & CFG --> DB

    AGG --> PLAID
    PAY --> STRIPE
    BIZ --> QBO
    AI --> LLM
    RE --> REVAL
    NOTIF --> COMMS
```

## Gateway routing (path → service)

```mermaid
flowchart LR
    C["client"] --> GW["API Gateway :8080"]
    GW -->|"/api/v1/auth/**"| AUTH[auth :8081]
    GW -->|"/api/v1/aggregation/**"| AGG[aggregation :8082]
    GW -->|"/api/v1/me/**<br/>/api/v1/planning/**"| CORE[financial-core :8083]
    GW -->|"/api/v1/real-estate/**"| RE[real-estate :8084]
    GW -->|"/api/v1/business/**"| BIZ[business :8085]
    GW -->|"/api/v1/ai/**"| AI[ai-insights :8086]
    GW -->|"/api/v1/payments/**"| PAY[payment :8087]
    GW -->|"/api/v1/notifications/**"| NOTIF[notification :8088]
    GW -->|"/api/v1/config/**<br/>/api/v1/content/**"| CFG[platform-config :8089]
    GW -->|"/v1/** (legacy)"| NODE["Node API (not deployed to prod)"]
```

## Authentication model

```mermaid
flowchart LR
    U["User"] -->|"login"| AUTH["auth-service"]
    AUTH -->|"issues JWT (shared secret)"| U
    U -->|"Bearer JWT on every call"| GW["gateway"]
    GW --> S["any service"]
    S -->|"JwtAuthFilter validates<br/>same shared secret"| S
```

- A single **shared `JWT_SECRET`** lets a gateway-issued token validate at every service.
- Each service runs its own `JwtAuthFilter`; there is **no central session store**.

## Key facts

- **10 services** + gateway. Only the gateway is public.
- **Schema-per-service** persistence; services do **not** share tables (they call each other via the gateway).
- The only **cross-service call** is financial-core → account-aggregation (Feign) to build the net-worth snapshot.
- **Only Plaid is a live integration** (sandbox). Stripe, QuickBooks, the LLM, real-estate valuation, and email/SMS/push are **mock implementations behind real interfaces** — swappable by config (see each [component file](components/)).

Continue to: [02 · Web app workflows](02-web-app-workflows.md) ·
[03 · Persistence & audit](03-data-persistence-and-audit.md) ·
[04 · Feature status & gaps](04-feature-status-and-gaps.md)
