# 9. Ready-to-Use Prompt to Run & Operate the App

This page gives you **copy-paste prompts** you can hand to an AI assistant (Claude Code, etc.)
to run, operate, debug, or rebuild TerraVest — plus the exact setup each one assumes. Pick the
one that matches what you want to do.

> There is also a full-fidelity **build/redesign** prompt at
> [`docs/MASTER_BUILD_PROMPT.md`](../docs/MASTER_BUILD_PROMPT.md) (rebuild the whole platform
> from spec) and a cross-platform variant at
> [`docs/CROSS_PLATFORM_PROMPT.md`](../docs/CROSS_PLATFORM_PROMPT.md). Use those when you want to
> regenerate the app; use the prompts below when you want to **run/operate** the existing one.

---

## 9.1 Prompt A — "Run the existing app locally"

```
You are working in the TerraVest repo (root: my-wealth-management/, app code in finance-mvp/).
Goal: get the full app running locally so I can use it in a browser.

Context you can rely on:
- Backend = 11 Java/Spring Boot microservices behind an API gateway on :8080.
- Frontend = React + Vite in finance-mvp/apps/web (talks only to the gateway).
- Every external integration (Plaid, Stripe, AI, email, SMS) defaults to a working MOCK,
  so NO keys are needed to run.
- Default local DB is in-memory H2 (data resets on restart). That's fine for a trial run.

Do this:
1. cd finance-mvp
2. npm install
3. npm run build:backend
4. npm run start:backend    (starts gateway + services + legacy node api in the background)
5. npm run dev:web          (Vite on http://localhost:5173)
6. Verify: open http://localhost:5173, register a test account (or use
   test1@example.com / Password123!), and confirm the Home dashboard loads.
7. Smoke-test the API: register via POST :8080/api/v1/auth/register and call
   GET :8080/api/v1/me/snapshot with the returned `token`.

Report which services started, the login you used, and any errors with the failing
service's log. To stop: pkill -f spring-boot:run ; pkill -f vite.

Gotchas to respect:
- The web app's ONLY stylesheet is apps/web/src/styles/terravest-theme.css
  (apps/web/src/styles.css is dead code — do not edit it).
- POST /auth/login requires MFA and returns no token directly; use /auth/register for a token.
```

**Setup it assumes:** Java 17, Maven, Node 18+ installed (see
[07-BEGINNER-GUIDE.md](07-BEGINNER-GUIDE.md) §1). No keys, no Docker, no Postgres.

---

## 9.2 Prompt B — "Run it with persistent data (local Postgres)"

```
Goal: run the TerraVest backend on persistent local Postgres (data survives restarts) so I can
test real end-to-end flows.

Steps:
1. Ensure PostgreSQL is running locally (brew services start postgresql@16).
2. bash finance-mvp/deploy/init-local-db.sh         (creates the per-service databases)
3. bash finance-mvp/deploy/start-local.sh           (use REBUILD=1 to mvn package first)
   - Services boot with profile=dev but datasource overridden to Postgres.
   - Gateway :8080, services :8081–:8090, logs in /tmp/svc-<name>.log.
4. Start the web app: from finance-mvp, npm run dev:web.
5. Verify with deploy/smoke-test.sh or a register→snapshot curl.

Report the gateway health and any service that failed to boot (tail its /tmp log).
```

**Setup it assumes:** the tools from Prompt A **plus** PostgreSQL installed locally.

---

## 9.3 Prompt C — "Deploy my change to the live site"

```
Goal: ship my committed change to production (https://app.terravest.app).

Facts:
- Push to `main` → GitHub Actions CI builds+pushes multi-arch images to GHCR.
- Deploy = GitHub → Actions → CI → "Run workflow" (workflow_dispatch), tag=latest. It SSHes to
  the GCP VM and runs deploy/deploy.sh (pull images → rebuild web in place → restart → health-wait).
- Manual fallback: ssh -i ~/.ssh/terravest_deploy deploy@34.139.32.148 ; cd finance-mvp ;
  ./deploy/deploy.sh

Do this:
1. Confirm my change is committed and pushed; open/merge the PR to main (or push to main).
2. Confirm CI built images successfully.
3. Trigger the deploy workflow (tag=latest).
4. Verify: GET https://app.terravest.app returns 200 and re-run the smoke test (register→snapshot).

Respect the deploy gotchas: never rm -rf web-dist (Caddy bind-mounts it); never edit an applied
Flyway migration; container health is a TCP check on :8080, not /actuator/health.
```

**Setup it assumes:** repo access, GitHub Actions access, and (for manual fallback) the
`~/.ssh/terravest_deploy` key.

---

## 9.4 Prompt D — "Turn on a real integration"

```
Goal: switch the <PROVIDER> integration from mock to real in production.

How the system works: each provider is a Spring bean gated by a *_PROVIDER flag (or a key);
blank/unset = deterministic mock. To go live, set the toggle + key(s) in .env.prod ON THE VM and
restart that one service. If a key is wrong, the service logs "falling back to mock".

Do this for <PROVIDER> (look up its exact vars in DOCUMENTATION/06-APIS-AND-KEYS.md §6.2):
1. ssh -i ~/.ssh/terravest_deploy deploy@34.139.32.148 ; cd finance-mvp ; nano .env.prod
2. Set the provider toggle + key(s).  [e.g. AI: AI_PROVIDER=anthropic + ANTHROPIC_API_KEY + AI_MODEL]
3. docker compose -f docker-compose.prod.yml --env-file .env.prod up -d <service>
4. Tail logs and confirm NO "falling back to mock" warning; test the feature in the app.

CRITICAL SECURITY GATE: before real users, set SendGrid + Twilio keys AND set
otp.expose-dev-code=false (today OTP dev codes are exposed in prod responses = MFA bypass).
```

**Setup it assumes:** the provider account + key(s), and SSH access to the VM. Per-provider
notes (Plaid sandbox-first, QuickBooks redirect URI, SendGrid verified sender, Google Maps is
build-time) are in [06-APIS-AND-KEYS.md](06-APIS-AND-KEYS.md) and
[05-WORKFLOWS.md](05-WORKFLOWS.md) §5.

---

## 9.5 Prompt E — "Diagnose and fix a production issue"

```
Goal: a feature is failing in production. Find and fix the root cause.

Toolbox:
- SSH: ssh -i ~/.ssh/terravest_deploy deploy@34.139.32.148 ; cd finance-mvp
- Health: docker compose -f docker-compose.prod.yml --env-file .env.prod ps
- Logs:   docker compose -f docker-compose.prod.yml --env-file .env.prod logs --tail=200 <service>
- Every request has an X-Request-Id you can grep across services.

Known signatures (DOCUMENTATION/05-WORKFLOWS.md §7):
- "Migration checksum mismatch" → an applied Flyway migration was edited. NEVER edit applied
  migrations; add a new one. (Recovery for the historical real-estate V5 case is in
  finance-mvp/OPERATIONS_RUNBOOK.md §11.)
- "falling back to mock" → missing/wrong provider key.
- account-aggregation won't start → APP_ENCRYPTION_KEY missing.
- 403 on /actuator/health → expected; most services secure actuator (health uses a TCP check).

Report: the failing service, the exact log line, the root cause, and the minimal fix. If the fix
is code, follow the deploy loop (Prompt C). If it's config, edit .env.prod + restart that service.
```

---

## 9.6 Configuration cheat-sheet (what every run needs)

| Run mode | DB | Keys needed | Config file | Entry point |
|---|---|---|---|---|
| Local fast (Prompt A) | H2 in-memory | none | none | http://localhost:5173 |
| Local persistent (Prompt B) | local Postgres | none | dev profile | http://localhost:5173 + :8080 |
| Local prod-style | local Postgres | generate JWT/enc keys | `finance-mvp/.env.prod` | Caddy/compose |
| Production (live) | Neon Postgres | provider keys optional | `finance-mvp/.env.prod` on VM | https://app.terravest.app |

**Generate the required internal secrets** (for any non-mock / prod-style run):
```bash
openssl rand -base64 48   # JWT_SECRET (same value for every service)
openssl rand -base64 32   # APP_ENCRYPTION_KEY, AUDIT_INGEST_KEY, NOTIFICATIONS_INTERNAL_KEY, SECRETS_*
```

Copy [`finance-mvp/.env.prod.example`](../finance-mvp/.env.prod.example) → `.env.prod` and fill
values. Full variable reference: [06-APIS-AND-KEYS.md](06-APIS-AND-KEYS.md).
