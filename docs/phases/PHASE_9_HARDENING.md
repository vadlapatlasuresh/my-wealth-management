# Phase 9 — Production Hardening ⏳

**Goal:** Make the platform production-ready: real database, security, tests, observability, CI/CD.

## Data
- [ ] Switch services from H2 to **Postgres** (prod profile + `pom.xml` already include the driver).
      Provide `docker-compose.yml` for local Postgres; validate Flyway migrations on Postgres.
- [ ] Retire the legacy Node API once Phases 3–6 have replaced all `/v1/**` routes.

## Security
- [ ] Move all secrets (Plaid, JWT, provider keys) out of `application.properties` into env /
      a secret manager (Vault/AWS Secrets Manager). Rotate the demo JWT secret.
- [ ] Plaid/Stripe webhook signature verification (Phase 6 webhook is a stub).
- [ ] Rate limiting + request validation at the gateway; security headers; HTTPS/TLS termination.
- [ ] Refresh-token flow + token expiry/rotation; account lockout on auth-service.

## Quality
- [ ] Unit + integration tests per service (Testcontainers for Postgres/Plaid sandbox).
- [ ] Frontend tests (Vitest + React Testing Library) for the redesigned pages.
- [ ] Contract tests for gateway routes.

## Ops
- [ ] Dockerfiles per service + compose / k8s manifests.
- [ ] CI/CD (GitHub Actions): build, test, image push, deploy.
- [ ] Centralized logging + tracing (OpenTelemetry), health/readiness probes, metrics.
- [ ] Service discovery (Eureka dep already present) or k8s DNS instead of hardcoded localhost URLs.

## Acceptance criteria
- [ ] Full stack runs on Postgres via one command; migrations clean.
- [ ] No secrets in source; webhooks verified; CI green on PRs; images deploy to an environment.
