# My Wealth Management — Deployment Plan (Dev → QA → Prod in 1 Week)

_Last updated: 2026-06-07 • Owner: suresh_

This is the **single, start-to-finish runbook** to take the current app (React 18 + Vite web,
9 Java/Spring Boot services behind an API gateway, Postgres) from laptop to a **live, validated,
production environment** in **7 days**, using the **cheapest reliable cloud services** (free tiers
where they exist and are dependable).

It assumes the code is feature-complete (Phases 0–7 done, providers running as mocks behind flags).
We deploy what is deployable **now** (web + backend), keep mocks behind config so nothing blocks
launch, and treat real-provider keys (Plaid live, Stripe live, etc.) as a flip-the-switch step.
Mobile (Expo) is included as an **optional Day 7** track.

---

## 0. The recommended cloud stack (cheap + reliable, free where possible)

> **Hard truth first:** you have **9 JVM microservices**. Each idle Spring Boot service wants
> ~256–512 MB RAM. Running 9 of them on per-service "free web service" tiers (Render/Railway free)
> does **not** fit and will be unreliable (cold starts, spin-downs). The cheapest *reliable* way to
> run all 9 is **one box with Docker Compose**. Two great options below — pick **A** for truly free,
> **B** for rock-solid-cheap.

### Compute (backend — the 9 Java services + reverse proxy)

| Option | Cost | RAM/CPU | Why |
|---|---|---|---|
| **A. Oracle Cloud — Always Free ARM (Ampere A1)** ✅ *recommended free* | **$0 forever** | up to **4 vCPU / 24 GB** | Free tier is genuinely generous; one VM runs all 9 dockerized services + Nginx + headroom. Caveat: ARM capacity in popular regions can be hard to grab — try off-peak / less-busy region. |
| **B. Hetzner Cloud CPX31** ✅ *recommended paid* | **~€13/mo (~$14)** | 4 vCPU / **8 GB** | Most reliable cheap VPS on the market. Frictionless, instant. Use **CX22 (~€4/mo, 4 GB)** for dev/qa only. |
| C. Fly.io | pay-as-you-go, ~$5–15/mo with scale-to-zero | small machines | Good if you prefer per-service deploys + scale-to-zero; more moving parts for 9 services. |
| D. Render / Railway | free credits then $$$ | 512 MB/svc | Easiest UX, but 9 services blows past free fast and cold-starts hurt. Fine for **1–2** services only. |

**Decision: Oracle Always Free ARM VM (A) for dev/qa/prod if you can grab capacity; otherwise
Hetzner (B) — CX22 for dev+qa, CPX31 for prod.** Same Docker Compose works on both.

### Database (Postgres — you asked specifically)

| Option | Cost | Why |
|---|---|---|
| **Neon** ✅ *recommended* | **Free tier (0.5 GB, scale-to-zero) → ~$19/mo Launch** | Serverless Postgres. Killer feature: **branches** — one project, a branch each for `dev`, `qa`, `prod`. Instant, isolated, free on the starter. Best DX for this exact need. |
| Supabase | Free (500 MB, 2 projects) → $25/mo | Postgres + auth/storage extras you don't need yet, but solid free tier. |
| Self-host Postgres 16 in Docker on the same VM | $0 | Cheapest, but **you** own backups/HA. Fine for dev/qa; for prod use Neon/Supabase managed so backups + PITR are handled. |

**Decision: Neon** (free, branch-per-environment). Self-hosted Postgres-in-compose is the fallback
for dev if you want zero external deps. **Other DB suggestions you asked about:** stick with
**Postgres** — it's the right call here (your `pom.xml` prod profiles already target it, JSONB for
flexible config/disclaimers, mature, cheap everywhere). No reason to add Mongo/Dynamo.

### Frontend (web — static Vite build)

| Option | Cost | Why |
|---|---|---|
| **Cloudflare Pages** ✅ *recommended* | **Free (unlimited bandwidth)** | Best free tier, global CDN, free TLS, instant rollbacks, preview deploys per PR. |
| Vercel / Netlify | Free hobby tier | Also excellent; Netlify/Vercel bandwidth is metered (still generous). |

**Decision: Cloudflare Pages.** (Also use Cloudflare for DNS + free TLS + proxy in front of the API.)

### Everything else (all free tiers)

| Concern | Service | Cost |
|---|---|---|
| Container registry | **GitHub Container Registry (ghcr.io)** | Free |
| CI/CD | **GitHub Actions** | Free (2,000 min/mo private) |
| Secrets | **Doppler** (free) or GitHub Actions Secrets + `.env` on VM | Free |
| Error tracking | **Sentry** (Developer plan) | Free (5k errors/mo) |
| Uptime alerts | **UptimeRobot** | Free (50 monitors) |
| Metrics/logs | **Grafana Cloud Free** or **Better Stack Logs** free | Free |
| TLS certs | **Caddy** (auto-HTTPS) or Cloudflare origin cert | Free |
| Mobile builds | **Expo EAS** | Free tier (limited build minutes) |

### Estimated monthly cost

- **Truly free path:** Oracle Always Free VM + Neon free + Cloudflare Pages + free tooling = **$0/mo**
  (until you outgrow free DB storage / need real provider keys).
- **Reliable-cheap path:** Hetzner CPX31 (~$14) + Neon Launch ($19, when you outgrow free) +
  $0 rest = **~$14–33/mo**.

> **Reverse proxy choice:** use **Caddy** in the compose stack — it auto-provisions Let's Encrypt
> TLS with one line per domain. (Nginx works too but you manage certs.) Only the gateway/Caddy
> ports are public; the 8 downstream services stay on the internal compose network.

---

## 1. Environment model

Three environments, identical topology, different config/secrets:

| Env | Purpose | Compute | DB (Neon branch) | Web URL | API URL |
|---|---|---|---|---|---|
| **dev** | integration, fast iteration | small VM (or CX22) | `dev` branch | `dev.app.<domain>` | `dev.api.<domain>` |
| **qa** | E2E + UAT, prod-like, stable | small VM (or CX22) | `qa` branch | `qa.app.<domain>` | `qa.api.<domain>` |
| **prod** | live | CPX31 / Oracle ARM | `prod` branch | `app.<domain>` | `api.<domain>` |

> Budget-tight variant: run **dev and qa on the same VM** as two compose projects on different
> ports/domains; keep **prod on its own VM**. This is the cheapest viable split.

Buy one domain (~$10/yr at Cloudflare Registrar — at cost, no markup) and put **all** DNS in
Cloudflare.

---

## 2. Pre-flight: production-readiness gaps to close (from PROJECT_STATUS §4)

These must be handled **during** the week (woven into the days below), not after:

1. **H2 → Postgres cutover** — validate every service boots on the `prod` profile against Postgres;
   add Flyway/Liquibase migrations (auth already has `V2`); seed prod-safe baseline.
2. **Secrets out of `application.properties`** — JWT secret, Plaid/Stripe/etc. → env vars / Doppler.
   **Rotate the JWT secret** (the one in `.env.example` is public — never ship it).
3. **Retire / fence the legacy Node API** — it has mismatched user IDs and mock data. Either don't
   deploy it, or deploy read-only behind a flag. Prefer **don't deploy** to prod.
4. **Webhook signature verification** — Stripe + Plaid webhooks must verify signatures before trust.
5. **CORS for real domains** — gateway must allow only `app.<domain>` / `qa.app...` origins.
6. **Provider mocks behind flags** — keep `AI_PROVIDER=mock`, blank Stripe/Plaid live keys = mock,
   so the app launches fully functional; flip to real per provider when keys are ready.
7. **Tests + CI gates** — unit + integration + smoke E2E must run in CI before deploy.
8. **Observability** — health endpoints, structured logs, Sentry, uptime monitors.

---

## 3. The 7-day plan

Each day ends with a **GATE** — do not proceed until it's green.

---

### DAY 1 — Accounts, repo hygiene, secrets, and "boots on Postgres" locally

**Goal:** every service runs on Postgres with externalized secrets, locally, in containers.

1. **Create accounts** (15 min each): Cloudflare, Neon, Oracle Cloud *or* Hetzner, GitHub (you have),
   Sentry, UptimeRobot, Doppler, Expo (if doing mobile). Buy the domain in Cloudflare.
2. **Neon:** create project `wealth`, create branches `dev`, `qa`, `prod`. Copy each branch's
   connection string (you'll store as secrets).
3. **Secrets hygiene:**
   - Generate a **new** strong `JWT_SECRET` (`openssl rand -base64 48`).
   - Create a Doppler project `wealth` with configs `dev`/`qa`/`prod`. Put `JWT_SECRET`,
     `POSTGRES_*` (from Neon), and all provider keys (blank/mock for now) in each.
   - Confirm `.env`, `*.env`, and any `application-*.properties` with secrets are **git-ignored**.
4. **Postgres profile validation (the big one):** for **each** of the 9 services, run locally
   against a Postgres (Neon `dev` branch or `docker compose up -d postgres`) with
   `SPRING_PROFILES_ACTIVE=prod`. Fix every service that doesn't boot/migrate. Add Flyway migrations
   where schema is auto-generated today (set `ddl-auto=validate` for prod, not `update`).
5. **Containerize all 9** using the existing `Dockerfile.java-service`:
   ```bash
   cd finance-mvp
   for s in api-gateway auth-service account-aggregation-service financial-core-service \
            real-estate-service business-financials-service ai-insights-service \
            payment-service notification-service; do
     docker build -f Dockerfile.java-service --build-arg SERVICE=$s -t wealth/$s:dev .
   done
   ```
6. **Author the full prod compose** (`docker-compose.prod.yml`): all 9 services on an internal
   network, env from Doppler/`.env`, only **Caddy + gateway** exposed; healthchecks on each;
   `restart: unless-stopped`. (See §4 template.)

**GATE 1:** `docker compose -f docker-compose.prod.yml up` brings up all 9 services + Caddy locally,
all `/actuator/health` (or equivalent) return UP against Postgres, web hits the gateway and you can
register/login/see dashboard. No secrets in the repo.

---

### DAY 2 — Stand up the DEV environment in the cloud

**Goal:** dev is live on a real VM + Neon, reachable over HTTPS.

1. **Provision the VM** (Oracle ARM Always Free, or Hetzner CX22). Harden: non-root user, SSH keys
   only, `ufw` allow 22/80/443, enable automatic security updates, install Docker + compose plugin.
2. **DNS:** in Cloudflare add `dev.api.<domain>` and `dev.app.<domain>` → VM IP (proxied).
3. **Add `actuator` health + Spring Boot health** to each service if missing (`spring-boot-starter-actuator`,
   expose `/actuator/health`). Caddy/compose healthchecks use these.
4. **Deploy:** copy compose + Caddyfile to the VM, inject dev secrets (Doppler CLI or `.env`), 
   `docker compose -f docker-compose.prod.yml up -d`. Caddy auto-issues TLS for `dev.api.<domain>`.
5. **Web (dev):** Cloudflare Pages project from the repo, build `npm run build -w apps/web`, output
   `apps/web/dist`, env `VITE_API_BASE=https://dev.api.<domain>`. Map `dev.app.<domain>`.
6. **CORS:** set gateway allowed origins to `https://dev.app.<domain>`.

**GATE 2:** open `https://dev.app.<domain>` → register, login, click through **every** feature
(Home, Accounts, Transactions, Budgets, Pay Bills, Debt Lab, Investments, My Business, AI Assistant,
Properties, Deal Room, Fractional LLC, Security, Messages, Settings, Profile, Learn). All load,
no CORS errors, data persists across a service restart (proves Postgres, not H2).

---

### DAY 3 — QA environment + automated E2E test suite

**Goal:** a prod-like QA env and a repeatable E2E suite that gates every future deploy.

1. **Provision QA** identically (or second compose project on the dev VM if budget-tight) →
   `qa.api.<domain>` / `qa.app.<domain>`, Neon `qa` branch, qa Doppler config.
2. **Write E2E tests with Playwright** (cheap, free, runs in CI) covering the critical journeys:
   - auth: register → logout → login → token refresh / 401 self-heal
   - accounts: Plaid sandbox link (`user_good`/`pass_good`, OTP `123456`) → accounts + transactions
   - financial-core: net-worth snapshot, set a budget (PUT), debt scenario
   - real-estate: add property → valuation; business: dashboard/P&L; AI: insight + chat reply
   - payments: create a bill-pay intent (mock); notifications: toggle prefs persist; messages inbox
   - smoke: every nav route renders without console errors
   Put them in `finance-mvp/apps/web/e2e/` (or a `packages/e2e`).
3. **Backend integration tests:** at minimum auth + financial-core happy paths with Testcontainers
   Postgres (so CI tests the real DB engine, not H2).
4. **Wire CI gates** — extend `.github/workflows/ci.yml`:
   - existing: build 9 Java services + web ✅
   - add: run unit + integration tests (fail the build on red)
   - add: build & push Docker images to **ghcr.io** tagged with the commit SHA
   - add: a `deploy-qa` job (on push to `main`, after tests pass) that SSHes to the QA VM,
     pulls the new images, `docker compose up -d`, then runs the Playwright suite against QA.

**GATE 3:** the full Playwright suite is **green against QA**, CI runs it automatically on every
push to `main`, and a red test blocks the QA deploy.

---

### DAY 4 — Production hardening

**Goal:** close the security/reliability gaps before prod exists.

1. **Secrets & rotation:** confirm prod uses the rotated `JWT_SECRET`; no secrets in images or repo;
   Doppler `prod` config locked down.
2. **Webhook signature verification:** implement and test Stripe (`Stripe-Signature` + webhook
   secret) and Plaid webhook verification. Reject unsigned/invalid.
3. **CORS + headers:** gateway allows only `https://app.<domain>`. Add security headers via Caddy
   (HSTS, X-Content-Type-Options, Referrer-Policy, CSP starter). Disable downstream CORS (gateway-only).
4. **Rate limiting** at the gateway (per-IP, login endpoint stricter) and request size limits.
5. **DB safety:** Neon prod branch → enable PITR/backups; set `ddl-auto=validate`; run migrations
   as an explicit step, never auto on boot in prod.
6. **Observability:**
   - Sentry SDK in web + Java services (DSN from secrets, env-tagged).
   - UptimeRobot monitors on `https://api.<domain>/actuator/health` (gateway) + `app` URL.
   - Ship container logs to Grafana Cloud / Better Stack (free).
   - Confirm each service exposes `/actuator/health` (liveness) for compose + LB checks.
7. **Resource limits & restart policy:** set `mem_limit`/`cpus` per service in compose so one
   service can't starve the box; `restart: unless-stopped`; JVM `-XX:MaxRAMPercentage=75`.
8. **Legacy Node API:** confirm it is **not** in the prod compose (or fenced behind a disabled flag).
9. **Backups:** Neon handles DB; add a nightly `cron` on the VM to back up Caddy/Doppler config and
   any volumes to object storage (Cloudflare R2 free tier).

**GATE 4:** a security checklist (below §6) is fully ticked; webhook verification has a passing test;
Sentry receives a test error from web + one service; uptime monitors are live.

---

### DAY 5 — Provision PRODUCTION and deploy

**Goal:** prod is live, identical to QA, on its own box.

1. **Provision prod VM** (Hetzner CPX31 or Oracle ARM), hardened identically. Separate from dev/qa.
2. **DNS:** `api.<domain>` + `app.<domain>` → prod VM (Cloudflare proxied, TLS on).
3. **Deploy backend:** pull the **exact image SHAs that passed QA** from ghcr.io (no rebuild —
   promote the tested artifact). Inject prod secrets. `docker compose up -d`. Run DB migrations
   explicitly against Neon `prod`.
4. **Deploy web:** Cloudflare Pages production deployment of the same commit, `VITE_API_BASE=https://api.<domain>`,
   mapped to `app.<domain>`.
5. **Promotion in CI:** add a **manual-approval** `deploy-prod` job (GitHub Environments → required
   reviewer = you) that promotes the QA-tested SHA to prod. Manual gate = no accidental prod deploys.

**GATE 5:** `https://app.<domain>` loads over HTTPS; register a real test account; the smoke subset
of Playwright passes **against prod**; logs/metrics/Sentry/uptime all reporting from prod.

---

### DAY 6 — Production validation & resilience drills

**Goal:** prove prod is correct, observable, and recoverable.

1. **Full E2E against prod** (use a dedicated QA test account; flagged test data). Walk every feature.
2. **Provider decision:** for each of Plaid/Stripe/QBO/AI/email-push decide **mock vs live for
   launch**. If going live, add real keys to Doppler `prod`, flip the flag, re-test that one flow.
   Anything not ready **stays on mock** — documented, not blocking.
3. **Load smoke:** `k6`/`autocannon` a modest load (e.g. 50 VUs) at gateway → confirm p95 latency,
   no OOM, services stay UP, resource limits hold.
4. **Failure drills:**
   - kill a downstream service container → gateway degrades gracefully, restarts, recovers.
   - restart the VM → compose `restart: unless-stopped` brings everything back.
   - **Rollback drill:** redeploy the previous image SHA and confirm it's a clean, fast revert.
   - DB connection blip (Neon scale-to-zero cold start) → app retries/handles it.
5. **Data:** confirm backups exist and a **restore** actually works (test-restore Neon branch).
6. **Cost check:** confirm you're within free/cheap tiers; set Neon + cloud billing alerts.

**GATE 6:** every feature verified on prod; rollback proven; backup restore proven; monitors/alerts
firing correctly; no errors in Sentry from the validation run.

---

### DAY 7 — Go-live, docs, and (optional) mobile

**Goal:** flip to live, document operations, optionally ship mobile to internal testers.

1. **Go-live checklist** (§7) signed off.
2. **Operational docs:** write `RUNBOOK.md` (how to deploy, roll back, read logs, rotate secrets,
   restore DB, on-call steps) and update `PROJECT_STATUS.md` (Phase 9 → done).
3. **Announce / open access.** Keep the QA env as the permanent staging gate for all future changes.
4. **(Optional) Mobile track — Expo EAS:**
   - point `mobile/` at `https://api.<domain>`, set up `eas.json` with `dev`/`qa`/`prod` channels.
   - `eas build` for iOS + Android (free tier), distribute to internal testers via EAS / TestFlight /
     Play internal testing. `eas update` for OTA JS/config pushes (no store review).
   - Full store submission (App Store / Play) is a follow-up — review takes days, won't fit in week 1.

**GATE 7 (DONE):** web + backend live and validated on prod; CI promotes tested artifacts with a
manual prod gate; monitoring, backups, rollback all proven; runbook written.

---

## 4. Reference: prod compose + Caddy skeleton

`docker-compose.prod.yml` (shape — fill all 9 services):
```yaml
services:
  caddy:
    image: caddy:2-alpine
    ports: ["80:80", "443:443"]
    volumes: [./Caddyfile:/etc/caddy/Caddyfile, caddy_data:/data]
    depends_on: [api-gateway]
    restart: unless-stopped
  api-gateway:
    image: ghcr.io/<you>/wealth-api-gateway:${TAG}
    environment:
      SPRING_PROFILES_ACTIVE: prod
      JWT_SECRET: ${JWT_SECRET}
      # downstream service URLs use compose DNS, e.g. http://auth-service:8081
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8080/actuator/health"]
      interval: 15s
      timeout: 5s
      retries: 5
    mem_limit: 512m
    restart: unless-stopped
  auth-service:
    image: ghcr.io/<you>/wealth-auth-service:${TAG}
    environment:
      SPRING_PROFILES_ACTIVE: prod
      JWT_SECRET: ${JWT_SECRET}
      SPRING_DATASOURCE_URL: ${NEON_AUTH_URL}   # or shared DB, separate schemas
      SPRING_DATASOURCE_USERNAME: ${POSTGRES_USER}
      SPRING_DATASOURCE_PASSWORD: ${POSTGRES_PASSWORD}
    mem_limit: 512m
    restart: unless-stopped
  # ... account-aggregation, financial-core, real-estate, business-financials,
  #     ai-insights, payment, notification — same pattern, NOT publicly exposed.
volumes:
  caddy_data:
```

`Caddyfile`:
```
api.example.com {
    reverse_proxy api-gateway:8080
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options nosniff
        Referrer-Policy strict-origin-when-cross-origin
    }
}
```

> **DB topology note:** decide **one Neon database with a schema per service** (cheapest, fewest
> connections — good for Neon free) vs a DB per service. Start with **schema-per-service** in one
> Neon branch per environment.

---

## 5. CI/CD pipeline (target shape)

```
push → main
  ├─ build: 9 Java services + web            (exists)
  ├─ test:  unit + integration (Testcontainers PG) + lint
  ├─ package: build & push Docker images → ghcr.io:<sha>
  ├─ deploy-qa: ssh QA VM → pull <sha> → compose up → migrate
  ├─ e2e: Playwright against QA              ← BLOCKS promotion if red
  └─ deploy-prod: MANUAL APPROVAL (GitHub Environment) → promote same <sha> → prod
```
Key rule: **build once, promote the same artifact** dev→qa→prod. Never rebuild for prod.

---

## 6. Security checklist (tick before Day 5 deploy)

- [ ] New `JWT_SECRET` generated; old public one purged everywhere.
- [ ] No secrets in repo, images, or `application*.properties` (all from env/Doppler).
- [ ] `ddl-auto=validate` in prod; migrations run explicitly; no `update`/`create` in prod.
- [ ] CORS allow-list = prod web origin only; downstream CORS disabled (gateway-only).
- [ ] Stripe + Plaid webhook signatures verified; unsigned rejected (tested).
- [ ] Gateway rate limiting + request size limits; login endpoint throttled.
- [ ] TLS on all public hostnames; HSTS + security headers via Caddy.
- [ ] Only 22/80/443 open on the VM; SSH key-only; non-root; auto security updates.
- [ ] Sentry capturing web + backend; PII scrubbed.
- [ ] DB backups/PITR on (Neon prod); restore tested.
- [ ] Legacy Node API not deployed to prod (or hard-disabled).
- [ ] Per-service mem/cpu limits + `restart: unless-stopped`.

---

## 7. Go-live checklist (Day 7)

- [ ] All 18 features verified on prod (the full nav list).
- [ ] Data persists across service + VM restart (Postgres, not H2).
- [ ] Full Playwright E2E green on QA; smoke green on prod.
- [ ] CI promotes tested SHA with manual prod approval.
- [ ] Uptime monitors + Sentry + log shipping live and alerting to you.
- [ ] Rollback drill passed; backup restore drill passed; load smoke passed.
- [ ] Provider mock-vs-live decision documented per provider; mocks behind flags.
- [ ] `RUNBOOK.md` written; `PROJECT_STATUS.md` updated (Phase 9 done).
- [ ] Billing alerts set; confirmed within free/cheap tiers.

---

## 8. TL;DR — what to buy/sign up for

| Need | Pick | Cost |
|---|---|---|
| Backend compute | Oracle Always Free ARM **or** Hetzner CPX31 | $0 / ~$14 mo |
| Postgres | **Neon** (branch per env) | $0 → $19 mo |
| Web hosting | **Cloudflare Pages** | $0 |
| DNS + TLS + domain | **Cloudflare** | ~$10/yr domain |
| Registry / CI | **ghcr.io + GitHub Actions** | $0 |
| Secrets | **Doppler** | $0 |
| Errors / uptime / logs | **Sentry + UptimeRobot + Grafana Cloud** | $0 |
| Reverse proxy / auto-TLS | **Caddy** (in compose) | $0 |
| Mobile (optional) | **Expo EAS** | $0 tier |

**Bottom line:** Postgres is the right database — keep it (use **Neon**). The only real spend to
run all 9 services reliably is **one small VM** (free on Oracle, ~$14/mo on Hetzner). Everything
else fits comfortably in free tiers for launch.
