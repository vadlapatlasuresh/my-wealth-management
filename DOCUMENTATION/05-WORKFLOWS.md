# 5. Workflows — Step by Step

Every common task, as a numbered recipe. Commands assume you start at the **repo root**
(`my-wealth-management/`). The application code lives in `finance-mvp/`.

**Prerequisites** (install once): Java 17 (`java -version`), Maven (`mvn -v`), Node 18+
(`node -v`), Docker Desktop (for prod-style runs), and optionally PostgreSQL (for persistent
local runs). Beginners: see [07-BEGINNER-GUIDE.md](07-BEGINNER-GUIDE.md) §1 for how to install
each of these.

---

## 1. Run the app locally — the FAST path (H2 in-memory, zero setup)

This boots the gateway + services on an in-memory database (data is wiped on restart) and the
web app. No Postgres, no Docker, no keys.

```bash
cd finance-mvp
npm install                 # installs web + node deps
npm run build:backend       # builds the Java services (+ prisma generate for the legacy node api)
npm run start:backend       # starts gateway + services + legacy node api (each in background)
npm run dev:web             # starts Vite dev server on http://localhost:5173
```

Then open **http://localhost:5173**.

- **Log in:** register any email, or use the seeded `test1@example.com` / `Password123!`.
- **Plaid sandbox** (only if you've added Plaid keys): institution login `user_good` /
  `pass_good`, phone `415-555-0011`, OTP `123456`.

> `npm run start:backend` launches many Java processes with `&`. To stop them all:
> `pkill -f spring-boot:run` (and `pkill -f vite` for the web server).

Individual service control (handy when debugging one service):
```bash
npm run build:auth-service     # build just auth-service
npm run start:auth-service     # run just auth-service (Maven spring-boot:run)
# ...same pattern for every service name in package.json
```

---

## 2. Run the app locally — the PERSISTENT path (local Postgres)

Use this for **real end-to-end testing** where data must survive restarts. A local Postgres
already has the per-service databases (owner `wealth`/`wealth`).

```bash
# one-time: create the local databases
bash finance-mvp/deploy/init-local-db.sh

# start the whole backend on persistent Postgres
bash finance-mvp/deploy/start-local.sh           # add REBUILD=1 to mvn package first
```

- Services boot with `--spring.profiles.active=dev` but the datasource is overridden to Postgres.
- **Gateway on `:8080`**, services on `:8081–:8090`. Logs in `/tmp/svc-<name>.log`.
- Smoke test: `curl :8080/api/v1/auth/register ...` then `/login` for a JWT (see §6).
- Start the web app separately with `npm run dev:web` (from `finance-mvp/`).

---

## 3. Run the app the PROD way locally (Docker Compose)

To reproduce production locally (containers + Caddy), use the prod compose file with a local
env file. This is the closest thing to what runs on the VM.

```bash
cd finance-mvp
cp .env.prod.example .env.prod    # fill in DB URLs + secrets (use local Postgres + generated keys)
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.prod ps   # check health
```

> The simpler [`docker-compose.yml`](../finance-mvp/docker-compose.yml) exists for lightweight
> local container runs; `docker-compose.prod.yml` is the full production topology.

---

## 4. Deploy a change to the LIVE site (the everyday loop)

This is the normal way to ship. Full detail in
[`OPERATIONS_RUNBOOK.md`](../finance-mvp/OPERATIONS_RUNBOOK.md) §8.

1. Make your change locally; commit; push to a branch.
2. Open a PR to `main` and merge it (or push to `main` if you own it).
3. GitHub Actions **automatically builds and pushes** new container images to GHCR.
4. Go to **GitHub → Actions → CI → "Run workflow"** (the `workflow_dispatch` button), leave
   `tag` = `latest`, and run it. It SSHes into the VM and runs `deploy/deploy.sh`, which:
   pulls new images → rebuilds the website → restarts the stack → waits until healthy.
5. Verify: open https://app.terravest.app, or re-run the live smoke test (§6).

**Manual deploy (rarely needed), from your laptop:**
```bash
ssh -i ~/.ssh/terravest_deploy deploy@34.139.32.148
cd finance-mvp
./deploy/deploy.sh          # uses TAG from .env.prod
```

> ⚠️ **Deploy gotchas** (already handled by the script — don't reintroduce):
> one-click deploy does `git fetch + git reset --hard origin/main` (not `git pull`, which aborts
> on dirty `target/`); `web-dist` must be rebuilt **in place** (never `rm -rf` it — Caddy
> bind-mounts it by inode); the health-wait must **ignore no-healthcheck containers** (Caddy
> has none). See [`OPERATIONS_RUNBOOK.md`](../finance-mvp/OPERATIONS_RUNBOOK.md) §11.

---

## 5. Turn ON a real integration (general recipe)

Every provider defaults to a mock. To go live, set the **toggle flag + the key(s)** in
`.env.prod` on the VM, then restart that one service. Example for **Stripe**:

```bash
ssh -i ~/.ssh/terravest_deploy deploy@34.139.32.148
cd finance-mvp
nano .env.prod
#   PAYMENT_PROVIDER=stripe
#   STRIPE_SECRET_KEY=sk_live_xxx
#   STRIPE_WEBHOOK_SECRET=whsec_xxx
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d payment-service
# verify no fallback warning:
docker compose -f docker-compose.prod.yml --env-file .env.prod logs --tail=50 payment-service
```

If a key is wrong, the service **logs `falling back to mock`** and keeps serving the mock — so
you always know. The full table of toggles + keys is in
[06-APIS-AND-KEYS.md](06-APIS-AND-KEYS.md). Provider-specific notes:
- **Plaid:** start with `PLAID_ENV=sandbox` + sandbox keys; go `production` only after approval.
- **QuickBooks:** register `QBO_REDIRECT_URI` in the Intuit developer portal exactly as set.
- **SendGrid:** `SENDGRID_FROM` must be a **verified sender**.
- **Google Maps (web):** `VITE_GOOGLE_MAPS_API_KEY` is **build-time** — only takes effect on a
  web rebuild (the deploy script rebuilds web each run).

---

## 6. Smoke-test the running app (local or live)

```bash
BASE=http://localhost:8080            # or https://app.terravest.app for live
EMAIL="me$(date +%s)@terravest.app"

# register and grab a JWT (register returns a token directly in the `token` field)
TOKEN=$(curl -s -X POST $BASE/api/v1/auth/register -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"Test1234!\",\"firstName\":\"A\",\"lastName\":\"B\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))")

# hit authenticated endpoints
curl -s -o /dev/null -w "accounts=%{http_code}\n" -H "Authorization: Bearer $TOKEN" $BASE/api/v1/aggregation/accounts
curl -s -o /dev/null -w "networth=%{http_code}\n" -H "Authorization: Bearer $TOKEN" $BASE/api/v1/me/snapshot
```

> **Login vs register for tokens:** `POST /auth/login` requires MFA (returns
> `mfaRequired:true` + sends an OTP — no token until `/auth/mfa/verify`). For scripted smoke
> tests, **register** returns a JWT directly. There is also a ready-made
> [`deploy/smoke-test.sh`](../finance-mvp/deploy/smoke-test.sh).

---

## 7. Debug a problem

**Web app (browser):** open DevTools → Console + Network. The frontend **self-heals on
401/403** (clears the stale token → bounces to login). If pages render as unstyled plaintext,
you edited the **dead** `styles.css` instead of `terravest-theme.css`
([01-PROJECT-OVERVIEW.md](01-PROJECT-OVERVIEW.md) §1.3).

**A backend service (local):** logs are at `/tmp/svc-<name>.log` (persistent run) or in the
terminal (`start:backend`). Each request carries an `X-Request-Id` you can grep across services.

**A backend service (production):**
```bash
ssh -i ~/.ssh/terravest_deploy deploy@34.139.32.148
cd finance-mvp
docker compose -f docker-compose.prod.yml --env-file .env.prod ps                 # health
docker compose -f docker-compose.prod.yml --env-file .env.prod logs --tail=100 <service>
```

**Common failure signatures:**
- `Migration checksum mismatch` in a service log → someone edited an already-applied Flyway
  migration. **Never edit applied migrations** — add a new `V#__...` file. Recovery for the one
  historical case is in [`OPERATIONS_RUNBOOK.md`](../finance-mvp/OPERATIONS_RUNBOOK.md) §11.
- `falling back to mock` warning → a provider key is missing/wrong (expected if you haven't
  added it yet).
- Service won't start, `APP_ENCRYPTION_KEY` error → account-aggregation requires that key set.
- Login returns `token=null` + `mfaRequired=true` → that's MFA working; complete `/mfa/verify`
  (dev returns `devCode`) or use register for a token.
- `value`/reserved-word migration error on H2 → H2 reserves `value`; name columns
  `market_value`/`current_value` and map with `@Column(name=...)`.

---

## 8. Run the tests

```bash
# Web (Vitest — pure logic: net worth, calculators, formats)
cd finance-mvp && npm test -w apps/web

# A single Java service (JUnit/Mockito) — boots the context + runs Flyway against H2
mvn test -f apps/auth-service/pom.xml
```

> Always `mvn test` a service after adding a Flyway migration — the `@SpringBootTest` boots the
> context and runs the migration against H2, catching SQL + schema-validation errors early.

---

## 9. Add a new Flyway migration (schema change)

1. Create a **new** file `V#__description.sql` in the service's
   `src/main/resources/db/migration/` — **never edit an existing one**.
2. Avoid H2 reserved words in column names (`value`, `month`, `year`, `type` as identifiers).
   Name e.g. `market_value` and map with `@Column(name="market_value")`.
3. `mvn test -f apps/<service>/pom.xml` to validate.
4. Commit, push, deploy (§4). Flyway applies it automatically on service start.

---

## 10. Rebuild the whole production stack from scratch (disaster recovery)

Everything except secrets + the database is in git, so the server is disposable. Full steps in
[`OPERATIONS_RUNBOOK.md`](../finance-mvp/OPERATIONS_RUNBOOK.md) §10. Summary:

1. `cd finance-mvp/infra/gcp && terraform init && terraform apply` → new VM + IP + firewall.
2. Point the `app.terravest.app` A-record at the new VM IP (Cloudflare, grey-cloud).
3. On the VM: install Docker (Terraform startup script does this), clone the repo, create
   `.env.prod` from `.env.prod.example`, fill secrets + DB URLs.
4. `echo $GHCR_PAT | docker login ghcr.io -u vadlapatlasuresh --password-stdin` (pull private images).
5. `./deploy/deploy.sh`. Caddy auto-issues the HTTPS cert.

The **Neon database survives VM loss**. To recreate it from zero: create one DB per service,
put their URLs in `.env.prod`; Flyway runs migrations on first start.

---

## 11. Build the mobile apps (Capacitor)

The phone app is the web app wrapped with Capacitor. Config:
[`apps/web/capacitor.config.ts`](../finance-mvp/apps/web/capacitor.config.ts).

```bash
cd finance-mvp/apps/web
npm run build                  # produce apps/web/dist
npx cap sync                   # copy web build + plugins into ios/ and android/
npx cap open android           # open Android Studio (build/run/sign)
npx cap open ios               # open Xcode (build/run/sign) — iOS simulator build still WIP
```

The API base is environment-resolved (`localhost` / `10.0.2.2` for Android emulator /
`VITE_API_BASE` for a real device). See [`docs/MOBILE.md`](../docs/MOBILE.md) and
[`docs/phases/PHASE_8_MOBILE.md`](../docs/phases/PHASE_8_MOBILE.md).
