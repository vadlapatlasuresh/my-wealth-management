# Deploy kit — Day 2 (stand up an environment)

Runbook + scripts to bring up **dev** (then reuse for **qa**/**prod**) on a single VM +
Neon Postgres + Cloudflare Pages. Companion to [`docs/DEPLOYMENT_PLAN.md`](../../docs/DEPLOYMENT_PLAN.md).

```
deploy/
  bootstrap-vm.sh   # one-time: harden a fresh Ubuntu VM + install Docker
  deploy.sh         # pull images + compose up + health-gate
  db-init.sql       # create per-service schemas in the Neon branch (run once)
README ↑ this file
../docker-compose.prod.yml   ../Caddyfile   ../.env.prod.example
```

---

## Prerequisites (done in Day 1 / accounts)

- A VM (Oracle Always Free ARM **or** Hetzner CX22) with a public IP and your SSH key.
- A Neon project with a branch per env (`dev`, `qa`, `prod`).
- A domain in Cloudflare. Decide hostnames, e.g. dev: `dev.api.<domain>` + `dev.app.<domain>`.
- Images pushed to GHCR by CI (the `images` job) — or build on the VM (see bottom).

---

## Step 1 — Harden the VM + install Docker

```bash
# from your laptop
scp finance-mvp/deploy/bootstrap-vm.sh root@<vm-ip>:/root/
ssh root@<vm-ip> 'bash /root/bootstrap-vm.sh deploy'
# now log in as the deploy user (root login is disabled afterwards)
ssh deploy@<vm-ip> 'docker --version && docker compose version'
```

## Step 2 — DNS (Cloudflare)

Add A records → VM IP (proxy **on**/orange is fine; Caddy still terminates origin TLS):
- `dev.api.<domain>` → `<vm-ip>`
- (web is on Pages, mapped in Step 6)

> Cloudflare SSL/TLS mode: set **Full (strict)** so the proxy trusts Caddy's real cert.

## Step 3 — Get the repo + config onto the VM

```bash
ssh deploy@<vm-ip>
git clone <your-repo-url> wealth && cd wealth/finance-mvp
cp .env.prod.example .env.prod
nano .env.prod   # fill: GHCR_OWNER, API_DOMAIN=dev.api.<domain>, ACME_EMAIL,
                 #       WEB_ORIGINS=https://dev.app.<domain>, JWT_SECRET (openssl rand -base64 48),
                 #       and each *_DATABASE_URL/USER/PASSWORD from the Neon DEV branch.
```

If the GHCR images are private, log in once:
```bash
echo "$GHCR_PAT" | docker login ghcr.io -u <github-user> --password-stdin   # PAT: read:packages
```

## Step 4 — Create the DB schemas (once per Neon branch)

```bash
# from the VM (or anywhere with psql + the Neon connection string)
psql "postgresql://<user>:<pass>@<neon-host>/wealth?sslmode=require" -f deploy/db-init.sql
# or paste deploy/db-init.sql into the Neon branch SQL editor.
```

## Step 5 — Deploy the backend

```bash
TAG=$(git rev-parse --short HEAD) ./deploy/deploy.sh
# Health-gates all 10 services, then prints status. Caddy serves https://dev.api.<domain>.
```

Smoke the API:
```bash
curl -s https://dev.api.<domain>/actuator/health        # {"status":"UP"}
curl -s -X POST https://dev.api.<domain>/api/v1/auth/register \
  -H 'content-type: application/json' \
  -d '{"name":"Dev","email":"dev1@example.com","password":"Password123!"}'
```

## Step 6 — Deploy the web app (Cloudflare Pages)

1. Cloudflare → Pages → connect the repo.
2. Build settings:
   - **Root directory:** `finance-mvp`
   - **Build command:** `npm install && npm run build -w apps/web`
   - **Output directory:** `apps/web/dist`
   - **Env var:** `VITE_API_BASE=https://dev.api.<domain>`
3. Add custom domain `dev.app.<domain>`.

## Step 7 — GATE 2 (Day 2 done)

Open `https://dev.app.<domain>` and verify:
- [ ] register → login → dashboard (no CORS errors in console)
- [ ] click through every feature page; all load
- [ ] **data persists across a restart** (proves Postgres, not H2):
  ```bash
  ssh deploy@<vm-ip> 'cd wealth/finance-mvp && docker compose -f docker-compose.prod.yml --env-file .env.prod restart financial-core-service'
  # re-open the app; your budget/snapshot data is still there
  ```

---

## Operating cheatsheet

```bash
C="docker compose -f docker-compose.prod.yml --env-file .env.prod"
$C ps                        # status + health
$C logs -f --tail=100 api-gateway
$C restart <service>
TAG=<sha> ./deploy/deploy.sh # redeploy / roll forward
TAG=<old-sha> ./deploy/deploy.sh   # ROLLBACK (re-pull a previous SHA)
$C down                      # stop everything
```

## Reusing for QA / PROD

Same scripts, different box + `.env.prod` values:
- **qa:** new VM (or second compose project on the dev VM), `API_DOMAIN=qa.api.<domain>`,
  `WEB_ORIGINS=https://qa.app.<domain>`, Neon `qa` branch URLs. (Day 3)
- **prod:** own VM, prod hostnames, Neon `prod` branch, **promote the QA-tested SHA** — do not
  rebuild. (Day 5)

## Building images on the VM (instead of GHCR)

If you skip CI image publishing, build locally on the VM:
```bash
for s in api-gateway auth-service account-aggregation-service financial-core-service \
         real-estate-service business-financials-service ai-insights-service \
         payment-service notification-service platform-config-service; do
  docker build -f Dockerfile.java-service --build-arg SERVICE=$s -t ghcr.io/$GHCR_OWNER/wealth-$s:local .
done
TAG=local ./deploy/deploy.sh
```
(ARM note: building on an Oracle ARM VM produces arm64 images, which is correct for that VM.)
