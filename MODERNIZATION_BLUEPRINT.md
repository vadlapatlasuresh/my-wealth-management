# Enterprise Modernization Blueprint
## Web-to-Mobile Migration, Microservices Decoupling & GCP Cloud-Native Transformation

**Document Classification:** Confidential — Executive & Architecture Review
**Audience:** CIO, CTO, Enterprise Architects, Program Managers, Engineering Leadership
**Version:** 1.0
**Prepared by:** Enterprise / Cloud / DevOps / Mobile Architecture & Program Management

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Assessment](#2-current-state-assessment)
3. [Target Architecture](#3-target-architecture)
4. [Mobile Application Strategy](#4-mobile-application-strategy)
5. [Microservices Decoupling Plan](#5-microservices-decoupling-plan)
6. [GCP Landing Zone Design](#6-gcp-landing-zone-design)
7. [Centralized CI/CD Architecture (Jenkins)](#7-centralized-cicd-architecture)
8. [Centralized Secrets Management](#8-centralized-secrets-management)
9. [Terraform Implementation](#9-terraform-implementation)
10. [Kubernetes / Containerization Strategy](#10-kubernetes--containerization-strategy)
11. [Observability](#11-observability)
12. [Security Architecture](#12-security-architecture)
13. [Phased Implementation Roadmap](#13-phased-implementation-roadmap)
14. [Effort Estimation](#14-effort-estimation)
15. [Team Structure](#15-team-structure)
16. [Final Recommendation](#16-final-recommendation)

---

# 1. Executive Summary

## 1.1 Purpose

This document defines an end-to-end technical and delivery blueprint to modernize an existing Java-based web platform into a **secure, scalable, highly available, cost-optimized, cloud-native platform on Google Cloud Platform (GCP)** with **native mobile experiences for iOS and Android**, fully independent microservices, and **automated commit-to-production delivery** via Jenkins, Terraform, and Google Secret Manager.

## 1.2 Current State Assessment (Summary)

| Dimension | Current State |
|---|---|
| **Application tier** | Server-rendered / SPA web application(s) fronting a monolith-leaning microservices estate |
| **Services** | ~50 Java (Spring Boot / Spring Cloud) microservices with hidden runtime coupling |
| **Deployment** | VM-centric / hand-scripted deploys, shared release trains, limited automation |
| **Databases** | Shared or partially shared relational databases; cross-service joins |
| **Integrations** | Point-to-point synchronous REST calls; brittle failure propagation |
| **AuthN/Z** | Session/JWT hybrid, inconsistent enforcement across services |
| **Delivery** | Manual or semi-automated pipelines, environment drift, secrets in config files |
| **Mobile** | None — mobile users served a responsive web experience |

## 1.3 Target State Architecture (Summary)

- **Mobile:** Cross-platform apps (recommended: **Flutter**) consuming a versioned, mobile-optimized API through an **API Gateway + BFF** layer.
- **Backend:** ~50 **independently deployable microservices**, database-per-service, event-driven where coupling exists (Cloud Pub/Sub + outbox pattern).
- **Runtime:** **GKE Autopilot** for stateful/long-running & mesh-enabled services; **Cloud Run** for stateless, spiky, event-driven services.
- **Platform:** GCP enterprise **landing zone** (Org → Folders → Projects), Shared VPC, private networking, Cloud Armor/WAF, global HTTPS Load Balancer.
- **Delivery:** **Jenkins** controller + ephemeral GKE agents, shared pipeline libraries, GitOps-style promotion Dev→QA→UAT→Prod with canary/blue-green.
- **Secrets:** **Google Secret Manager** with environment segregation, rotation, Workload Identity access, and full audit logging.
- **IaC:** **Terraform** with reusable modules, remote GCS state, per-environment workspaces.
- **Observability:** Google Cloud Operations Suite + Prometheus/Grafana + OpenTelemetry distributed tracing.

## 1.4 Business Benefits

| Benefit | Impact |
|---|---|
| **New mobile revenue channel** | Native iOS/Android reach; push engagement; app-store presence |
| **Faster time-to-market** | Independent deploys → weekly/daily releases vs. monthly trains |
| **Cost optimization** | Autoscaling, scale-to-zero (Cloud Run), committed-use discounts, right-sizing |
| **Resilience & uptime** | Multi-zone HA, blast-radius isolation, graceful degradation → 99.9%+ SLA |
| **Reduced operational risk** | Automated, auditable, repeatable delivery; no manual prod changes |
| **Compliance readiness** | Centralized secrets, audit trails, network isolation, least-privilege IAM |

## 1.5 Technical Benefits

- Elimination of shared-database coupling and release-train bottlenecks.
- Standardized golden-path CI/CD reducing per-team pipeline effort by ~70%.
- Infrastructure reproducibility and drift elimination via Terraform.
- Zero hard-coded secrets; automated rotation.
- End-to-end traceability (logs, metrics, traces correlated by trace ID).

## 1.6 Key Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Hidden runtime coupling surfaces during decoupling | High | High | Dependency mapping, contract tests, strangler-fig migration, feature flags |
| Data migration integrity (DB-per-service split) | Medium | High | Dual-write + CDC (Datastream), reconciliation jobs, phased cutover |
| Mobile platform choice lock-in | Medium | Medium | PoC on 2 flows before commitment; abstraction of API layer |
| Skills gap (GCP, Terraform, Flutter) | High | Medium | Enablement program, embedded SMEs, pairing, paved-road templates |
| Cost overrun during parallel-run | Medium | Medium | FinOps guardrails, budgets/alerts, decommission plan, CUDs |
| Big-bang cutover failure | Low | High | Incremental strangler migration, blue/green, automated rollback |
| Secret sprawl during transition | Medium | High | Secret Manager from Phase 1; scan repos; block plaintext in CI |

---

# 2. Current State Assessment

## 2.1 Assumptions About the Existing Web Application

> These assumptions frame estimates and design; they should be validated in Phase 1 (Discovery).

- **Frontend:** One or two web applications (e.g., an SPA in React/Angular and/or a server-rendered admin app), served behind a reverse proxy/gateway.
- **Backend:** ~50 Spring Boot microservices, some using Spring Cloud (Eureka/Config/Gateway), packaged as fat JARs, partially containerized.
- **Language/Runtime:** Java 11/17, Maven or Gradle builds.
- **Datastore:** PostgreSQL/MySQL, with several services sharing schemas; some Redis usage for caching/sessions.
- **Hosting:** Single/multi-VM (on-prem or IaaS), Caddy/NGINX front door, manual or shell-script deploys.
- **Traffic profile:** Predictable business-hours load with periodic spikes; growth expected with mobile launch.
- **Compliance:** Handling of PII/financial data → encryption, audit, and access-control requirements apply.

## 2.2 Existing Java Microservices Architecture

```
                    ┌────────────────────────┐
                    │      Web Front Door      │
                    │     (Caddy / NGINX)      │
                    └───────────┬──────────────┘
                                │
                    ┌───────────▼──────────────┐
                    │   Spring Cloud Gateway    │
                    └───────────┬──────────────┘
                                │  (synchronous REST, point-to-point)
        ┌────────────┬──────────┼───────────┬────────────┐
        ▼            ▼          ▼           ▼            ▼
   ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐
   │ Auth   │  │ Users  │  │ Orders │  │ Billing│  │  ...   │  ~50 services
   └───┬────┘  └───┬────┘  └───┬────┘  └───┬────┘  └───┬────┘
       │           │           │           │           │
       └───────────┴─────┬─────┴───────────┴───────────┘
                         ▼
              ┌──────────────────────┐
              │  Shared Database(s)   │  ← coupling hotspot
              └──────────────────────┘
```

**Characteristics / smells observed:**
- Services call each other **synchronously**, creating latency chains and cascading failures.
- **Shared database** access breaks the "database-per-service" principle → schema coupling.
- **Eureka/Config Server** single points of coordination.
- Inconsistent **API versioning**; breaking changes ripple across teams.
- **Shared release train** — all services deploy together despite "microservice" labeling ("distributed monolith").

## 2.3 Current Deployment Model

- Build: Local/CI produces fat JARs → copied to VMs.
- Release: Coordinated multi-service deploy; downtime windows or rolling restarts by script.
- Config: `.properties`/`.yml` files with embedded credentials; environment drift between Dev/QA/Prod.
- Rollback: Manual (re-deploy previous JAR); no automated verification gates.

## 2.4 Existing Databases

- Relational (PostgreSQL/MySQL) as primary store; several services **share** a database/schema.
- Redis for caching/session (optional).
- Backups via scripted dumps; limited PITR; no per-service ownership boundaries.

## 2.5 Existing Integrations

- Internal: synchronous REST between services.
- External: payment gateways, email/SMS (SendGrid/Twilio), identity providers, third-party data APIs.
- Integration failures propagate directly to user requests (no buffering/queueing).

## 2.6 Existing Authentication & Authorization

- Hybrid session + JWT; gateway performs coarse auth; downstream services re-validate inconsistently.
- Roles/permissions embedded in individual services; no central policy.
- Refresh-token handling and token lifetimes vary by service.

## 2.7 Technical Debt Analysis

| Debt Category | Description | Severity | Remediation |
|---|---|---|---|
| **Distributed monolith** | Sync coupling + shared DB | Critical | DDD boundaries, DB-per-service, events |
| **Release coupling** | All-or-nothing deploys | High | Independent pipelines, contract tests |
| **Secrets in config** | Plaintext credentials | Critical | Secret Manager + rotation |
| **Environment drift** | Manual config per env | High | Terraform + config-as-code |
| **Inconsistent auth** | Per-service policy | High | Central IdP + gateway/mesh policy |
| **Weak observability** | Logs only, no tracing | Medium | OpenTelemetry + Cloud Ops |
| **No autoscaling** | Fixed VM capacity | Medium | GKE HPA / Cloud Run |
| **Manual rollback** | No automated gates | High | Progressive delivery + auto-rollback |

---

# 3. Target Architecture

## 3.1 High-Level Target Architecture

```
 ┌───────────┐   ┌───────────┐        ┌──────────────────────────────────────────┐
 │  iOS App   │   │ Android    │        │           Web SPA (2 apps)                │
 │ (Flutter)  │   │ (Flutter)  │        │                                            │
 └─────┬──────┘   └─────┬──────┘        └────────────────────┬───────────────────────┘
       │                │                                    │
       └────────┬───────┴─────────────┬──────────────────────┘
                │  HTTPS (TLS 1.3)     │
        ┌───────▼──────────────────────▼───────┐
        │   Global HTTPS Load Balancer          │
        │   Cloud Armor (WAF/DDoS) + CDN        │
        └───────────────────┬───────────────────┘
                            │
                ┌───────────▼───────────┐
                │      API Gateway       │  (Apigee / GKE Gateway API)
                │  + BFF (mobile/web)    │
                └───────────┬───────────┘
                            │
              ┌─────────────▼──────────────┐
              │  Identity / Auth Layer      │  (Identity Platform / OAuth2/OIDC)
              └─────────────┬──────────────┘
                            │
   ┌────────────────────────▼─────────────────────────────────────────┐
   │                    Service Mesh (Istio / ASM)                      │
   │   ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐       │
   │   │Svc A   │  │Svc B   │  │Svc C   │  │Svc D   │  │ ...    │       │
   │   │(GKE)   │  │(GKE)   │  │(CloudR)│  │(CloudR)│  │        │       │
   │   └───┬────┘  └───┬────┘  └───┬────┘  └───┬────┘  └────────┘       │
   └───────┼───────────┼───────────┼───────────┼───────────────────────┘
           │           │           │           │
     ┌─────▼───┐ ┌─────▼───┐  ┌────▼─────────────▼────┐   ┌──────────────┐
     │Cloud SQL│ │AlloyDB  │  │  Cloud Pub/Sub        │   │ Memorystore  │
     │(per-svc)│ │(per-svc)│  │  (event backbone)     │   │  (Redis)     │
     └─────────┘ └─────────┘  └───────────────────────┘   └──────────────┘

  Cross-cutting:  Secret Manager │ Cloud Ops (logs/metrics/traces) │ Artifact Registry
```

## 3.2 Component Descriptions

### 3.2.1 Mobile Apps (iOS & Android)
Single Flutter codebase → compiled native binaries. Consume BFF endpoints; support offline cache, push (FCM/APNs), biometric auth, and OTA-safe feature flags.

### 3.2.2 API Gateway
Central ingress for auth verification, rate limiting, quotas, request routing, schema validation, and API-product management. **Recommendation: Apigee X** (full API management) or **GKE Gateway API** (lighter, in-cluster). A **BFF (Backend-for-Frontend)** per client type (mobile, web) tailors payloads and aggregates calls.

### 3.2.3 Authentication Layer
**Google Cloud Identity Platform** (OIDC/OAuth2, MFA, social/enterprise IdP federation) issues short-lived JWTs. Gateway validates tokens; mesh enforces mTLS + authorization policies; services trust verified identity headers.

### 3.2.4 Independent Microservices
Each service: own repo (or clear module), own pipeline, own database, own release cadence, versioned API contract. Runtime split between GKE and Cloud Run (see §6.3, §10).

### 3.2.5 Service Discovery
On GKE: native Kubernetes DNS + mesh service registry (Istio). Cloud Run: managed URLs + internal service-to-service via Serverless VPC connector. Eureka is **retired**.

### 3.2.6 Databases
**Database-per-service.** Cloud SQL (PostgreSQL) as default; AlloyDB for high-throughput/analytical-adjacent OLTP; Firestore for document/mobile-sync data; Spanner only for globally-distributed, horizontally-scaled needs.

### 3.2.7 Caching Strategy
- **Edge/CDN:** Cloud CDN for static + cacheable GET responses.
- **Application:** Memorystore (Redis) for session, hot lookups, rate-limit counters.
- **Client:** Mobile local cache (SQLite/Drift) for offline.
- Patterns: cache-aside for reads, write-through for critical lookups, TTL + explicit invalidation on writes.

### 3.2.8 Messaging Architecture
**Cloud Pub/Sub** as the event backbone. Transactional **outbox pattern** guarantees at-least-once publishing. Dead-letter topics + retry policies. Schema registry (Pub/Sub schemas / Avro/Protobuf) for contract governance.

### 3.2.9 Monitoring & Logging
Cloud Logging (centralized, structured JSON), Cloud Monitoring (SLO dashboards, alerting), Cloud Trace + OpenTelemetry (distributed tracing), optional Prometheus/Grafana via Google Managed Prometheus.

### 3.2.10 Security Architecture
Defense-in-depth: Cloud Armor (WAF) → TLS everywhere → mesh mTLS → least-privilege IAM + Workload Identity → Secret Manager → VPC Service Controls → binary authorization on images. (Detail in §12.)

### 3.2.11 CI/CD Architecture
Jenkins controller (HA) + ephemeral Kubernetes agents; shared library golden pipeline; artifacts to Artifact Registry; progressive delivery to Dev/QA/UAT/Prod. (Detail in §7.)

### 3.2.12 Terraform Architecture
Layered modules (networking, GKE, Cloud Run, DB, IAM, secrets, observability) with remote GCS state and per-environment segregation. (Detail in §9.)

---

# 4. Mobile Application Strategy

## 4.1 Platform Comparison

| Criterion | React Native | **Flutter** | Native iOS (Swift) | Native Android (Kotlin) |
|---|---|---|---|---|
| **Code reuse (iOS+Android)** | ~85–90% | **~95%** | 0% (per platform) | 0% (per platform) |
| **Dev effort (2 platforms)** | Low–Medium | **Low** | High (2× teams) | High (2× teams) |
| **Performance** | Good (JS bridge) | **Near-native (AOT)** | Best | Best |
| **UI consistency** | Good | **Excellent (own engine)** | Native | Native |
| **Maintainability** | Medium (dep churn) | **High** | Medium (2 codebases) | Medium (2 codebases) |
| **Talent availability** | High (JS/React) | Medium–High (growing) | Medium | Medium |
| **Cost (build + maintain)** | Medium | **Low–Medium** | High | High |
| **Access to new OS features** | Delayed | Slight delay (plugins) | Immediate | Immediate |
| **Best when** | Web/React org | **Single team, fast, consistent UI** | Heavy device/AR/ML iOS | Heavy device/hardware Android |

## 4.2 Recommendation: **Flutter**

**Rationale:**
- **~95% code reuse** → one team ships both platforms → lowest total cost of ownership.
- **AOT-compiled** to native ARM → near-native performance, smooth 60/120fps UI.
- **Pixel-consistent UI** across platforms (own rendering engine) → predictable QA.
- Strong ecosystem for the required features (offline, push, biometrics, secure storage).
- Excellent fit given a **greenfield mobile build** (no existing RN/Swift investment to protect).

> If the organization already has a strong React/JS talent pool and shared web logic, **React Native** is the runner-up. Choose **native** only for device-intensive experiences (AR, advanced camera/ML, wearables).

## 4.3 Recommended Metrics Summary

| Factor | Assessment for Flutter |
|---|---|
| Development effort | ~40–50% lower than dual-native |
| Maintainability | Single codebase, single CI, unified tests |
| Cost | Lowest 3-yr TCO among options |
| Team skills | 1 Flutter/Dart team + platform release specialists |
| Performance | Meets requirements for a data-driven business app |

## 4.4 Mobile Architecture

```
┌─────────────────────────────────────────────┐
│                Flutter App                     │
│  Presentation (Widgets / MVVM or BLoC)         │
│  ── State Mgmt (Riverpod / BLoC)               │
│  Domain (use-cases, entities)                  │
│  Data (repositories)                           │
│   ├─ Remote: Dio/Retrofit → BFF API            │
│   ├─ Local: Drift/SQLite (offline cache)       │
│   └─ Secure: flutter_secure_storage (tokens)   │
│  Cross-cutting: DI (get_it), Analytics, FF     │
└─────────────────┬───────────────────────────────┘
                  │ HTTPS + OAuth2 Bearer (short-lived JWT)
          ┌───────▼────────┐
          │  Mobile BFF     │  aggregation, payload shaping, versioned
          └────────────────┘
```

## 4.5 API Strategy
- **BFF per client** (mobile, web) to minimize round-trips and tailor payloads.
- **Contract-first** (OpenAPI 3.1) with generated Dart clients.
- **Versioning:** URI (`/api/v1`) at gateway; additive changes preferred; deprecation policy (N-2 supported).
- **Pagination, field-filtering, compression (gzip/br)** to optimize mobile bandwidth.

## 4.6 Offline Support
- Local-first cache (Drift/SQLite); read from cache, revalidate in background.
- Write queue + sync-on-reconnect; conflict resolution (last-write-wins or domain merge).
- Firestore optionally for real-time sync collections.

## 4.7 Push Notifications
- **FCM** as unified sender → routes to APNs (iOS) and FCM (Android).
- Backend `notification-service` publishes to Pub/Sub → fan-out worker → FCM.
- Device-token registration endpoint; preference/opt-in gating; topic + targeted sends.

## 4.8 Authentication Flow

```
App → Identity Platform (OAuth2/OIDC, PKCE) → ID + short-lived access JWT + refresh token
App stores tokens in secure storage (Keychain/Keystore)
App → BFF/Gateway with Bearer access token
Gateway validates JWT (JWKS) → forwards verified identity to services
Access token expiry → silent refresh via refresh token
Biometric unlock (FaceID/Fingerprint) gates local token use
```

## 4.9 App Store Deployment Process
- **iOS:** Xcode Cloud/Fastlane → TestFlight (internal→external) → App Store review → phased release.
- **Android:** Fastlane/Gradle Play Publisher → Internal → Closed → Open testing → Production (staged rollout %).
- CI builds signed artifacts; secrets (signing keys, API keys) from Secret Manager; automated changelog + versioning.

---

# 5. Microservices Decoupling Plan

## 5.1 Identifying Service Boundaries
- Run **Event Storming** workshops with domain experts to map business events, commands, aggregates.
- Identify **bounded contexts**; map current services to contexts; flag mismatches (services spanning contexts, contexts split across services).
- Produce a **service dependency graph** (static call analysis + runtime tracing) to expose hidden coupling.

## 5.2 Domain-Driven Design Approach
- Define **bounded contexts** and a **context map** (upstream/downstream, ACL, conformist relationships).
- Establish **aggregates** as consistency/ownership boundaries → each aggregate owned by exactly one service.
- Introduce **anti-corruption layers (ACL)** at boundaries with legacy/shared components.

## 5.3 Removing Service Dependencies
- **Strangler-fig pattern:** incrementally route capabilities to new/decoupled services behind the gateway.
- Break shared-DB access: introduce service-owned APIs; migrate readers off foreign schemas.
- Replace shared libraries carrying business logic with published contracts/events.

## 5.4 Replacing Synchronous Calls Where Appropriate
| Interaction Type | Keep Sync? | Pattern |
|---|---|---|
| Query needed for immediate response | Yes | REST/gRPC (with timeout, retry, circuit breaker) |
| State change others react to | **No** | Publish domain **event** to Pub/Sub |
| Cross-service read for view | No | **CQRS read model** / materialized view / cache |
| Long-running / external | No | Async command + callback/event |

## 5.5 Event-Driven Architecture
- **Cloud Pub/Sub** topics per domain event; consumers subscribe independently.
- **Transactional Outbox + CDC (Datastream)** to publish reliably from DB commits.
- **Event schemas** governed (Protobuf/Avro), versioned, backward-compatible.

## 5.6 Messaging Patterns
- **Publish/Subscribe** for domain events (fan-out).
- **Event Carried State Transfer** to reduce sync lookups.
- **Saga (choreography or orchestration)** for cross-service transactions with compensations.
- **Dead-letter topics** + exponential backoff for poison messages.

## 5.7 Data Ownership
- Each service **exclusively owns** its data; no other service reads its tables directly.
- Cross-service data via API or replicated read models built from events.

## 5.8 Database-per-Service Strategy
- Split shared DB into service-owned databases/instances.
- Migration: **dual-write → backfill → CDC sync → verify → cut reads → cut writes → decommission**.
- Reference data replicated via events; reconciliation jobs validate consistency.

## 5.9 Service Contracts
- **Contract-first (OpenAPI/Protobuf).**
- **Consumer-driven contract tests (Pact)** in CI to prevent breaking changes.
- Contracts versioned and published to an internal API catalog.

## 5.10 API Versioning
- Additive/backward-compatible by default; breaking → new major version (`/v2`).
- **N-2 deprecation policy**; sunset headers; consumer migration windows.

## 5.11 Migration Sequence
1. Instrument & map dependencies (tracing).
2. Stand up event backbone (Pub/Sub) + outbox.
3. Extract **leaf** / least-coupled services first (quick wins).
4. Break shared DB per bounded context (highest-value first).
5. Convert high-fan-out sync calls to events.
6. Extract core/high-coupling services last, behind strangler routes.
7. Decommission Eureka/Config server; retire shared DB.

## 5.12 Risks
- Data integrity during split; dual-write skew; event ordering; duplicate delivery; distributed transaction complexity.

## 5.13 Validation Checkpoints
- Contract tests green; consumer compatibility verified.
- Data reconciliation reports within tolerance before read cutover.
- SLO/error-budget stable post-extraction (canary + rollback).
- Load/chaos tests confirm resilience (circuit breakers, DLQs).

---

# 6. GCP Landing Zone Design

## 6.1 Organization Structure

```
Organization (company.com)
├── Folder: Bootstrap        → Terraform seed, org-level IAM, logging
├── Folder: Shared / Common  → Shared VPC host, DNS, Artifact Registry, CI/CD
├── Folder: Security         → SCC, KMS, org policies, audit sinks
├── Folder: Non-Prod
│   ├── Project: dev
│   ├── Project: qa
│   └── Project: uat
└── Folder: Prod
    └── Project: prod
```

- **One project per environment per major workload domain** (avoid a single mega-project).
- Separate **host project** (Shared VPC) from **service projects** (workloads).
- Central **logging/monitoring project** with aggregated sinks.

## 6.2 Networking

| Component | Design |
|---|---|
| **Shared VPC** | Host project owns network; service projects attach → central control, isolated workloads |
| **Subnets** | Per-region, per-env; separate ranges for GKE nodes, Pods (secondary), Services (secondary), Cloud Run connectors |
| **Private networking** | Private GKE nodes, Private Service Connect for Google APIs, private Cloud SQL (no public IP) |
| **Load balancers** | Global external HTTPS LB (Anycast) + Cloud CDN; internal LB for east-west |
| **Cloud DNS** | Private zones for internal svc discovery; public managed zone for app domains |
| **Egress** | Cloud NAT for controlled outbound; no public IPs on nodes |

## 6.3 Compute — Recommendation & Comparison

| Factor | **GKE (Autopilot)** | **Cloud Run** | Compute Engine |
|---|---|---|---|
| Model | Managed Kubernetes | Serverless containers | VMs |
| Scaling | HPA/VPA, cluster autoscaler | Request-based, scale-to-zero | Manual/MIG |
| Ops overhead | Medium (Autopilot lowers it) | Lowest | Highest |
| Best for | Stateful, mesh, complex networking, always-on | Stateless, spiky, event-driven | Legacy/specialized |
| Cost profile | Efficient at steady load | Efficient at bursty/low load | Fixed |

**Recommendation — hybrid:**
- **GKE Autopilot** for the bulk of always-on services needing mesh, mTLS, complex networking, and fine control.
- **Cloud Run** for stateless, spiky, or event-triggered services (Pub/Sub consumers, batch, webhooks) — scale-to-zero saves cost.
- **Compute Engine** only for niche/legacy workloads that cannot containerize.

## 6.4 Storage
- **Cloud Storage** buckets (per env, uniform bucket-level access, CMEK, lifecycle rules) for objects, artifacts, backups, static assets.
- **Persistent Disks / Filestore** for stateful GKE workloads (PVCs) where required.

## 6.5 Databases — Recommendation

| Option | Use When | Recommended For |
|---|---|---|
| **Cloud SQL (PostgreSQL)** | Standard OLTP, per-service DB | **Default** for most services |
| **AlloyDB** | High-throughput OLTP + analytical | High-load/reporting-heavy services |
| **Spanner** | Global scale, horizontal, strong consistency | Only truly global/huge-scale services |
| **Firestore** | Document, mobile real-time sync, offline | Mobile-facing sync collections |

**Recommendation:** Cloud SQL as the default database-per-service; AlloyDB selectively; Firestore for mobile sync; Spanner reserved (cost/complexity) for genuine global-scale needs.

## 6.6 Security (Landing Zone)
- **IAM:** groups + least privilege; no primitive roles in prod; custom roles for sensitive ops.
- **Service accounts:** per-workload, Workload Identity Federation (no SA keys).
- **VPC Service Controls:** perimeters around data services to prevent exfiltration.
- **Cloud Armor / WAF:** OWASP rules, geo/IP policies, rate limiting, DDoS protection at the edge.
- **Org policies:** restrict public IPs, enforce CMEK, restrict regions, require OS Login, block SA key creation.

---

# 7. Centralized CI/CD Architecture

## 7.1 Jenkins Topology

```
┌──────────────────────────────────────────────┐
│  Jenkins Controller (HA, on GKE)               │
│  - Pipeline orchestration, RBAC, credentials    │
│  - Backed by GCS/persistent disk, JCasC config  │
└───────────────┬────────────────────────────────┘
                │ Kubernetes plugin (dynamic agents)
     ┌──────────┼───────────┬───────────┐
     ▼          ▼           ▼           ▼
 ┌───────┐ ┌───────┐   ┌───────┐   ┌───────┐
 │Agent  │ │Agent  │   │Agent  │   │Agent  │   ← ephemeral pods, per-build
 │(build)│ │(test) │   │(scan) │   │(deploy)│
 └───────┘ └───────┘   └───────┘   └───────┘
```

- **Controller:** HA on GKE, config-as-code (**JCasC**), backed by persistent storage; secrets from Secret Manager (no stored plaintext).
- **Agents:** ephemeral Kubernetes pods (Kubernetes plugin) → clean, scalable, cost-efficient; specialized pod templates (Maven/Gradle, Node/Flutter, security-scan, deploy).
- **Shared libraries:** versioned Groovy shared library implementing the **golden pipeline** (build/test/scan/package/deploy) → services call standardized steps.
- **Pipeline standardization:** one `Jenkinsfile` template per stack; teams override params only.

## 7.2 CI Process

```
Commit/PR → Webhook → Jenkins
  1. Checkout + branch policy check
  2. Build (Maven/Gradle | Flutter)
  3. Unit tests + coverage gate (e.g., ≥80%)
  4. Static analysis / code quality (SonarQube quality gate)
  5. Security scans:
       - SAST (Semgrep/SonarQube)
       - Dependency/SCA (Trivy/Grype, OSV)
       - Secret scan (Gitleaks)
       - Container image scan (Artifact Registry scanning)
  6. Contract tests (Pact)
  7. Build & sign container image (SLSA provenance)
  8. Push to Artifact Registry (immutable, digest-pinned)
```

## 7.3 CD Process (Progressive Promotion)

```
Artifact (immutable digest)
   │
   ├─► Dev   : auto-deploy on merge to main; smoke tests
   ├─► QA    : auto after Dev green; integration + regression suites
   ├─► UAT   : manual approval; business acceptance
   └─► Prod  : approval + change ticket → canary → progressive → full
```

- **GitOps** (Argo CD / Config Sync) reconciles desired state per env from Git; Jenkins updates image digests via PR.
- **Deployment strategies:**
  - **Blue/Green** for risky releases (instant switch + instant rollback).
  - **Canary** (5%→25%→50%→100%) with automated SLO analysis (error rate, latency) → auto-rollback on breach.
- **Rollback:** one-click / automated revert to previous digest; DB migrations backward-compatible (expand-contract).
- **Approval workflows:** RBAC-gated manual approvals for UAT/Prod; audit-logged; integrated with change management.

## 7.4 Environments & Guardrails
- Isolated per-env projects/clusters; no prod credentials in lower envs.
- Promotion by **immutable digest** (build once, promote same artifact).
- Policy gates (OPA/Gatekeeper) enforce image provenance (Binary Authorization).

---

# 8. Centralized Secrets Management

## 8.1 Tooling: Google Cloud Secret Manager

## 8.2 Secret Hierarchy & Naming

```
<env>-<service>-<secret-name>
e.g.
  prod-billing-db-password
  prod-billing-stripe-api-key
  qa-auth-jwt-signing-key
  dev-notification-sendgrid-key
```

- Labels: `env`, `service`, `owner`, `rotation` for governance and cost/attribution.

## 8.3 Environment Segregation
- Secrets live in the **same project as their environment** (dev/qa/uat/prod).
- No cross-env access; prod secrets accessible only by prod workloads/SA + break-glass.

## 8.4 Secret Rotation
- Automated rotation via Cloud Scheduler + Cloud Function/Run rotator per secret type (DB passwords, API keys, signing keys).
- New **version** created; apps read `latest` (or pinned) → zero-downtime rotation.
- Rotation cadence policy (e.g., 90 days) enforced and reported.

## 8.5 Access Controls
- **Least privilege:** `roles/secretmanager.secretAccessor` granted per-secret to the specific workload **service account** (Workload Identity), never broad.
- No human standing access to prod secrets; **break-glass** with approval + alerting.

## 8.6 Audit Logging
- Cloud Audit Logs capture every access (who/what/when) → exported to central logging + SIEM; alert on anomalous access.

## 8.7 Integration with Jenkins
- Jenkins fetches build/deploy secrets at runtime via Workload Identity — **no secrets stored in Jenkins**.
- Secret access scoped to the deploy SA per environment; audit-logged.

## 8.8 Integration with Applications
- **GKE:** Secret Manager CSI driver or External Secrets Operator mounts secrets as files/env at runtime via Workload Identity.
- **Cloud Run:** native Secret Manager integration → secrets as env vars/mounted volumes.

## 8.9 Encryption Strategy
- Secrets encrypted at rest (Google-managed or **CMEK** via Cloud KMS for regulated data).
- TLS in transit; envelope encryption; key rotation in KMS.

## 8.10 Sample Secret Access Flow

```
1. Pod starts with Kubernetes SA → mapped to GCP SA (Workload Identity)
2. External Secrets Operator / CSI requests `prod-billing-db-password`
3. IAM check: does the SA have secretAccessor on that secret? → yes
4. Secret Manager returns the latest version (decrypted via KMS)
5. Value mounted as file/env; app reads at startup (or hot-reload)
6. Access event written to Cloud Audit Logs → SIEM
```

---

# 9. Terraform Implementation

## 9.1 Repository & Folder Structure

```
terraform/
├── modules/                      # Reusable, versioned modules
│   ├── networking/               # VPC, subnets, NAT, DNS, firewall
│   ├── gke/                      # Autopilot/Standard cluster + node pools
│   ├── cloud-run/                # Cloud Run service + IAM + connector
│   ├── cloudsql/                 # DB instance, DBs, users, private IP
│   ├── alloydb/
│   ├── iam/                      # SAs, roles, workload identity bindings
│   ├── secret-manager/           # Secrets, versions, IAM
│   ├── artifact-registry/
│   ├── monitoring/               # Dashboards, alert policies, SLOs
│   ├── logging/                  # Sinks, buckets, exports
│   └── load-balancer/            # Global HTTPS LB, Cloud Armor, CDN
│
├── bootstrap/                    # Seed project, TF state bucket, org IAM
│
├── environments/
│   ├── dev/
│   │   ├── main.tf               # Composes modules
│   │   ├── variables.tf
│   │   ├── terraform.tfvars
│   │   └── backend.tf            # Remote GCS state (per env)
│   ├── qa/
│   ├── uat/
│   └── prod/
│
└── global/                       # Org policies, folders, shared VPC host
```

## 9.2 State Management
- **Remote state in GCS** (versioned bucket, object versioning on), one **state prefix per environment** → isolation and reduced blast radius.
- **State locking** via GCS (native) to prevent concurrent applies.
- Least-privilege SA for Terraform; state bucket CMEK-encrypted; no state in Git.

## 9.3 Environment Strategy
- Separate backend + tfvars per env; identical module versions promoted across envs.
- CI runs `fmt`, `validate`, `plan` (PR) → manual approval → `apply` (per env).
- Module versions pinned (Git tags / registry) for reproducibility.

## 9.4 Sample: Remote Backend

```hcl
# environments/prod/backend.tf
terraform {
  backend "gcs" {
    bucket = "acme-tfstate-prod"
    prefix = "platform/prod"
  }
  required_version = ">= 1.6.0"
  required_providers {
    google = { source = "hashicorp/google", version = "~> 5.0" }
  }
}
```

## 9.5 Sample: Networking Module (excerpt)

```hcl
# modules/networking/main.tf
resource "google_compute_network" "vpc" {
  name                    = "${var.env}-shared-vpc"
  auto_create_subnetworks = false
  project                 = var.host_project_id
}

resource "google_compute_subnetwork" "gke" {
  name          = "${var.env}-gke-subnet"
  ip_cidr_range = var.gke_primary_cidr
  region        = var.region
  network       = google_compute_network.vpc.id
  project       = var.host_project_id
  private_ip_google_access = true

  secondary_ip_range {
    range_name    = "pods"
    ip_cidr_range = var.pods_cidr
  }
  secondary_ip_range {
    range_name    = "services"
    ip_cidr_range = var.services_cidr
  }
}

resource "google_compute_router_nat" "nat" {
  name   = "${var.env}-nat"
  router = google_compute_router.router.name
  region = var.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"
}
```

## 9.6 Sample: GKE Autopilot Module (excerpt)

```hcl
# modules/gke/main.tf
resource "google_container_cluster" "autopilot" {
  name             = "${var.env}-gke"
  location         = var.region
  enable_autopilot = true
  network          = var.network
  subnetwork       = var.subnetwork
  project          = var.project_id

  ip_allocation_policy {
    cluster_secondary_range_name  = "pods"
    services_secondary_range_name = "services"
  }
  private_cluster_config {
    enable_private_nodes    = true
    enable_private_endpoint = false
    master_ipv4_cidr_block  = var.master_cidr
  }
  workload_identity_config { workload_pool = "${var.project_id}.svc.id.goog" }
  release_channel { channel = "REGULAR" }
}
```

## 9.7 Sample: Secret + IAM Binding (excerpt)

```hcl
# modules/secret-manager/main.tf
resource "google_secret_manager_secret" "this" {
  for_each  = var.secrets
  secret_id = "${var.env}-${each.value.service}-${each.key}"
  project   = var.project_id
  replication { auto {} }
  labels = { env = var.env, service = each.value.service }
}

resource "google_secret_manager_secret_iam_member" "accessor" {
  for_each  = var.secrets
  secret_id = google_secret_manager_secret.this[each.key].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${each.value.accessor_sa}"
}
```

## 9.8 Sample: Cloud Run Service (excerpt)

```hcl
# modules/cloud-run/main.tf
resource "google_cloud_run_v2_service" "svc" {
  name     = "${var.env}-${var.service_name}"
  location = var.region
  project  = var.project_id
  template {
    service_account = var.service_account
    scaling { min_instance_count = var.min_instances, max_instance_count = var.max_instances }
    vpc_access { connector = var.vpc_connector, egress = "PRIVATE_RANGES_ONLY" }
    containers {
      image = var.image
      resources { limits = { cpu = "1", memory = "512Mi" } }
      dynamic "env" {
        for_each = var.secret_env
        content {
          name = env.key
          value_source { secret_key_ref { secret = env.value, version = "latest" } }
        }
      }
    }
  }
}
```

---

# 10. Kubernetes / Containerization Strategy

## 10.1 Dockerization Approach
- **Multi-stage builds**; distroless/minimal base images; non-root user; read-only root FS.
- One process per container; 12-factor config (env/secrets injected).
- Image tags = immutable digests; provenance/SBOM generated; scanned in CI + Artifact Registry.

## 10.2 Helm Charts
- **One base "service" Helm chart** (library chart) with values overrides per service and per env.
- Standardizes Deployment, Service, HPA, PDB, NetworkPolicy, ServiceAccount, probes.
- Rendered/applied via GitOps (Argo CD) — Jenkins bumps image digest via PR.

## 10.3 Kubernetes Deployment Patterns
- **Rolling updates** default; **blue/green** and **canary** via Argo Rollouts + mesh traffic splitting.
- **Readiness/liveness/startup probes**, graceful shutdown (preStop), **PodDisruptionBudgets** for HA.
- **Topology spread** across zones; anti-affinity for critical services.

## 10.4 Horizontal Pod Autoscaling
- **HPA** on CPU/memory + custom metrics (RPS, queue depth via Managed Prometheus adapter).
- **VPA** (recommendation mode) for right-sizing; Cluster autoscaler / Autopilot for node capacity.

## 10.5 Resource Management
- Requests/limits set per service (from load tests); **ResourceQuotas** + **LimitRanges** per namespace.
- Namespaces per domain/team; **NetworkPolicies** default-deny east-west.

## 10.6 Service Mesh Recommendation — Istio / Anthos Service Mesh
**Recommend adopting a mesh (managed ASM)** given ~50 services:
- **mTLS everywhere** (zero-trust east-west), automatic.
- **Traffic management** (canary, mirroring, retries, timeouts, circuit breaking).
- **Observability** (golden signals, service graph) out-of-the-box.
- **Authorization policies** at L7.

**Istio evaluation:** powerful but adds operational complexity and sidecar overhead. **Recommendation:** use **managed ASM** (reduces ops burden) or Istio **ambient mode** (sidecar-less) to cut overhead. Start mesh on the highest-value namespaces; expand gradually. If service count/complexity is low early on, defer mesh and rely on gateway + app-level resilience libraries.

---

# 11. Observability

## 11.1 Design Overview

```
Services (OpenTelemetry SDK/auto-instrumentation)
   │  logs (structured JSON)   metrics   traces
   ▼
OpenTelemetry Collector (per cluster)
   ├─► Cloud Logging      (centralized logs, log-based metrics)
   ├─► Cloud Monitoring / Managed Prometheus (metrics)
   └─► Cloud Trace        (distributed traces)
        │
   Grafana / Cloud Dashboards ── Alerting (SLO burn) ── PagerDuty/Slack
```

## 11.2 Centralized Logging
- Structured JSON logs → Cloud Logging; **log sinks** to BigQuery (analytics) + GCS (archive) + SIEM.
- Correlation via **trace_id/span_id** injected into every log line.
- Retention/PII redaction policies; log-based metrics for key events.

## 11.3 Monitoring
- **Google Managed Prometheus** for metrics collection at scale; Cloud Monitoring for GCP resource metrics.
- **SLOs** (availability, latency) per service with **error-budget** policies.

## 11.4 Dashboards
- Grafana (or Cloud dashboards) per service + platform-wide golden-signals view; mesh service graph.

## 11.5 Alerting
- Alert on **SLO burn rate**, error rate, saturation, latency, queue depth, DLQ growth.
- Multi-window multi-burn-rate alerts to reduce noise; routed to on-call (PagerDuty/Opsgenie).

## 11.6 Distributed Tracing
- **OpenTelemetry** end-to-end (mobile → gateway → services → DB/Pub/Sub) → Cloud Trace.
- Tail-based sampling for cost/signal balance.

## 11.7 Recommendation
- **Baseline:** Google Cloud Operations Suite + OpenTelemetry + Managed Prometheus.
- **Add Grafana** for rich dashboards / multi-source correlation. Standardize instrumentation via OTel to avoid vendor lock-in.

---

# 12. Security Architecture

## 12.1 OWASP Controls
- Address OWASP Top 10 (API + web): input validation, output encoding, authz checks, SSRF/deserialization protections; automated SAST/DAST in CI.

## 12.2 API Security
- OAuth2/OIDC + short-lived JWT; scope/claim-based authorization at gateway + service.
- Rate limiting, quotas, schema validation, mTLS internally; API keys for partner access via Apigee.

## 12.3 Mobile Security
- Secure token storage (Keychain/Keystore), biometric gating, certificate pinning, jailbreak/root detection, no secrets in binaries, obfuscation (R8/ProGuard), Play Integrity / App Attest.

## 12.4 Infrastructure Security
- Private clusters, no public node IPs, Cloud NAT egress, org policies (no public IP, CMEK, region locks), OS Login.

## 12.5 Container Security
- Distroless non-root images, image scanning, **Binary Authorization** (only signed, attested images run), runtime policy (Gatekeeper/OPA), read-only FS, dropped capabilities.

## 12.6 Secrets Management
- Google Secret Manager, Workload Identity, rotation, audit, CMEK — no plaintext anywhere (see §8).

## 12.7 Network Security
- Shared VPC, default-deny NetworkPolicies, mesh mTLS, **VPC Service Controls** perimeters, Private Service Connect, Cloud Armor WAF/DDoS at edge.

## 12.8 IAM Controls
- Least privilege via groups + custom roles; no primitive roles in prod; no SA keys (Workload Identity Federation); periodic access reviews; SoD for deploy/approve.

## 12.9 Compliance Considerations
- Audit logging → SIEM; data residency via region controls; encryption at rest/in transit; **Security Command Center** for posture/threat detection; DLP scanning for PII; mapping to SOC 2 / ISO 27001 / PCI-DSS / GDPR as applicable.

---

# 13. Phased Implementation Roadmap

> Phases overlap where dependencies allow. Each phase lists **Activities · Deliverables · Dependencies · Team · Risks**.

### Phase 1 — Assessment & Discovery
- **Activities:** Inventory services/DBs/integrations; dependency & trace mapping; event storming; validate assumptions; TCO baseline.
- **Deliverables:** Current-state report, dependency graph, risk register, migration backlog.
- **Dependencies:** Access to source, envs, SMEs.
- **Team:** Enterprise Architect, Cloud Architect, key domain SMEs, PM.
- **Risks:** Incomplete knowledge → mitigate with tracing + workshops.

### Phase 2 — Target Architecture Design
- **Activities:** Finalize target arch, service boundaries, tech choices, standards (API, security, observability).
- **Deliverables:** Architecture blueprint, ADRs, reference patterns, golden-path spec.
- **Dependencies:** Phase 1.
- **Team:** All architects, security, lead engineers.
- **Risks:** Analysis paralysis → time-box, PoCs.

### Phase 3 — Terraform Foundation
- **Activities:** Build module library, state backend, CI for Terraform, bootstrap project.
- **Deliverables:** Reusable modules, remote state, TF pipeline.
- **Dependencies:** Phase 2, GCP org access.
- **Team:** Cloud/DevOps engineers.
- **Risks:** Module rework → design for reuse, version early.

### Phase 4 — GCP Landing Zone
- **Activities:** Org/folders/projects, Shared VPC, IAM, org policies, DNS, Artifact Registry, logging/monitoring baseline.
- **Deliverables:** Production-ready landing zone.
- **Dependencies:** Phase 3.
- **Team:** Cloud Architect, DevOps, Security.
- **Risks:** Misconfig → policy-as-code, peer review.

### Phase 5 — Jenkins CI/CD Setup
- **Activities:** HA Jenkins on GKE (JCasC), ephemeral agents, shared library, golden pipeline, scans, Artifact Registry, GitOps (Argo CD).
- **Deliverables:** Reusable CI/CD pipeline + progressive delivery.
- **Dependencies:** Phase 4.
- **Team:** DevOps/SRE.
- **Risks:** Pipeline sprawl → standardize via shared lib.

### Phase 6 — Secrets Management
- **Activities:** Secret Manager hierarchy, rotation, Workload Identity, ESO/CSI, audit, KMS/CMEK; repo secret scanning.
- **Deliverables:** Centralized secrets, zero plaintext.
- **Dependencies:** Phase 4–5.
- **Team:** Security, DevOps.
- **Risks:** Rotation breakage → test in lower envs.

### Phase 7 — Microservices Decoupling
- **Activities:** Pub/Sub backbone + outbox; strangler extraction; DB-per-service split via Datastream; contract tests; retire Eureka/Config.
- **Deliverables:** Independently deployable services, event-driven flows.
- **Dependencies:** Phases 2–6.
- **Team:** Backend engineers, architects, DBAs.
- **Risks:** Data integrity → dual-write + reconciliation + phased cutover.

### Phase 8 — Containerization
- **Activities:** Dockerize services, Helm base chart, HPA/PDB/NetworkPolicy, resource tuning, Binary Authorization, mesh onboarding.
- **Deliverables:** Container images + K8s manifests per service.
- **Dependencies:** Phase 5–7.
- **Team:** Backend, DevOps.
- **Risks:** Perf regressions → load test, right-size.

### Phase 9 — GCP Migration
- **Activities:** Deploy services to GKE/Cloud Run; migrate data (CDC + cutover); wire LB/gateway/DNS; parallel-run; cost tuning.
- **Deliverables:** Workloads live on GCP; legacy decommission plan.
- **Dependencies:** Phases 3–8.
- **Team:** Cloud, DevOps, Backend, DBA, SRE.
- **Risks:** Cutover failure → blue/green, rollback, reconciliation.

### Phase 10 — Mobile App Development
- **Activities:** Flutter app (arch, auth, offline, push, features), BFF, contract-first APIs, store setup.
- **Deliverables:** iOS + Android apps in TestFlight/Play testing.
- **Dependencies:** Stable APIs (Phase 7–9), auth layer.
- **Team:** Mobile devs, BFF backend, QA, designer.
- **Risks:** API churn → contract-first + versioning.

### Phase 11 — Testing & Hardening
- **Activities:** E2E, performance/load, chaos, security (pentest/DAST), DR drills, SLO validation.
- **Deliverables:** Test reports, hardened platform, runbooks.
- **Dependencies:** Phases 9–10.
- **Team:** QA, Security, SRE.
- **Risks:** Late-found defects → shift-left testing.

### Phase 12 — Production Rollout
- **Activities:** Canary/staged rollout, app-store release, hypercare, legacy decommission, FinOps review.
- **Deliverables:** GA on GCP + mobile apps live; decommissioned legacy.
- **Dependencies:** Phase 11.
- **Team:** All + PM, on-call SRE.
- **Risks:** Rollout issues → canary + auto-rollback + hypercare.

---

# 14. Effort Estimation

**Scope basis:** 50 Java microservices · 2 web apps · iOS + Android (Flutter) · Jenkins · Terraform · GCP migration.

> Estimates are planning-grade ranges; refine after Phase 1 discovery. "PM" = person-months.

## 14.1 Effort by Workstream (baseline person-months)

| Workstream | Effort (PM) |
|---|---|
| Discovery & architecture | 6–10 |
| Terraform + Landing Zone | 8–14 |
| Jenkins CI/CD + secrets | 6–10 |
| Microservices decoupling (50 svc) | 60–100 |
| Containerization + mesh | 20–35 |
| Data migration (DB-per-service) | 15–30 |
| GCP migration & cutover | 15–25 |
| Mobile (Flutter iOS+Android + BFF) | 24–40 |
| Testing, hardening, rollout | 15–25 |
| **Total** | **~170–290 PM** |

## 14.2 Team Scenarios

| Scenario | Team Size | Calendar Duration | Total Effort | Resource Mix | Indicative Cost* |
|---|---|---|---|---|---|
| **Small** | 8–10 | **18–24 months** | ~180–260 PM | 1 arch group, 4–5 backend, 2 mobile, 2 DevOps, 1–2 QA | **$2.0M–$3.5M** |
| **Medium** | 18–25 | **12–15 months** | ~200–290 PM | 2 arch, 8–10 backend, 3–4 mobile, 4 DevOps/SRE, 3 QA, 1 sec | **$3.5M–$6M** |
| **Large** | 35–50 | **8–11 months** | ~230–320 PM | Multiple squads, dedicated platform/mobile/security teams | **$6M–$10M+** |

\* Cost ranges are blended-rate, region-dependent (higher in US/EU, lower offshore/hybrid); exclude GCP run-cost. Larger teams → shorter calendar but higher coordination overhead (non-linear).

## 14.3 Ongoing GCP Run Cost (indicative)
- Non-prod + prod compute (GKE/Cloud Run), databases, networking, observability: **~$25K–$80K/month** depending on scale, HA, and traffic. Optimize via autoscaling, scale-to-zero, committed-use discounts, and right-sizing (target 20–35% savings after FinOps tuning).

## 14.4 Recommendation
**Medium team** offers the best balance of speed, cost, and risk — ~12–15 months to GA with manageable coordination overhead.

---

# 15. Team Structure

| Role | Count (Medium) | Responsibilities |
|---|---|---|
| **Enterprise Architect** | 1 | Overall target arch, standards, ADRs, stakeholder alignment |
| **Cloud Architect** | 1–2 | Landing zone, networking, GCP services, cost/HA design |
| **DevOps Engineers** | 3–4 | Jenkins, Terraform, GitOps, pipelines, secrets |
| **SRE Engineers** | 2 | SLOs, observability, on-call, reliability, DR |
| **Backend Developers** | 8–10 | Service decoupling, events, APIs, data migration |
| **Mobile Developers** | 3–4 | Flutter apps, BFF integration, offline/push/auth |
| **QA Engineers** | 3 | Automation, E2E, performance, contract tests |
| **Security Engineers** | 1–2 | IAM, secrets, WAF, compliance, pentest, container security |
| **Project / Program Manager** | 1 | Planning, dependencies, risk, delivery governance |
| **(Optional) UX/UI Designer** | 1 | Mobile experience, design system |

**Operating model:** cross-functional **squads** per domain (backend + QA + DevOps) plus a central **platform team** (landing zone, CI/CD, secrets, observability) providing the paved road, and a dedicated **mobile squad**.

---

# 16. Final Recommendation

## 16.1 Recommended Target Architecture
Cloud-native platform on GCP: **Flutter** mobile apps → global HTTPS LB + Cloud Armor → **API Gateway + BFF** → **Identity Platform** auth → **~50 independent microservices** on **GKE Autopilot (core) + Cloud Run (stateless/spiky)** within a **service mesh (managed ASM)** → **database-per-service** (Cloud SQL default, AlloyDB/Firestore selectively) → **Cloud Pub/Sub** event backbone with outbox pattern → **Secret Manager, Terraform, Jenkins, OpenTelemetry/Cloud Ops** as cross-cutting foundations.

## 16.2 Recommended Technology Stack

| Layer | Choice |
|---|---|
| Mobile | **Flutter** (Dart), FCM push, Drift offline |
| API mgmt | Apigee X or GKE Gateway API + BFF |
| Auth | Cloud Identity Platform (OIDC/OAuth2) |
| Compute | GKE Autopilot + Cloud Run |
| Mesh | Anthos Service Mesh (Istio) |
| Messaging | Cloud Pub/Sub (+ Datastream CDC) |
| Databases | Cloud SQL (PostgreSQL), AlloyDB, Firestore, Spanner (selective) |
| Cache | Memorystore (Redis) + Cloud CDN |
| CI/CD | Jenkins (JCasC, K8s agents) + Argo CD (GitOps) |
| Secrets | Google Secret Manager + KMS/CMEK |
| IaC | Terraform (GCS remote state) |
| Observability | Cloud Ops + Managed Prometheus + Grafana + OpenTelemetry |
| Security | Cloud Armor, VPC-SC, Binary Authorization, SCC, Workload Identity |

## 16.3 Recommended Implementation Approach
- **Incremental, strangler-fig** migration — no big-bang.
- **Paved-road first:** landing zone, Terraform modules, golden CI/CD, secrets before mass migration.
- **Contract-first + event-driven** decoupling; DB-per-service via CDC with phased cutover.
- **Progressive delivery** (canary/blue-green) with automated rollback.
- **Parallel mobile track** once stable BFF/APIs exist.

## 16.4 Estimated Timeline
- **Medium team: ~12–15 months to GA** (recommended). Small: 18–24 months. Large: 8–11 months.

## 16.5 Critical Success Factors
- Executive sponsorship + stable funding.
- Accurate dependency mapping before decoupling.
- Disciplined **paved-road** adoption (no snowflake pipelines/infra).
- Data-migration rigor (reconciliation, phased cutover).
- Skills enablement (GCP, Terraform, Flutter, mesh).
- FinOps guardrails from day one.
- Strong contract governance to prevent breaking changes.

## 16.6 Executive Recommendation
**Proceed** with the phased program using a **medium-sized cross-functional team**, targeting **~12–15 months to GA**. Prioritize the **platform foundation (Terraform, landing zone, Jenkins CI/CD, Secret Manager)** in the first ~4 months, then execute **strangler-fig microservices decoupling** and **GCP migration** in parallel with **Flutter mobile development** once stable APIs exist. This sequencing de-risks delivery, unlocks incremental value, and yields a secure, scalable, highly available, cost-optimized cloud-native platform with a first-class mobile presence.

---

*End of document.*
