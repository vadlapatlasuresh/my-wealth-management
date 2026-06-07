# TerraVest — Zero-to-Live Setup (Oracle Always Free, $0/month)

The whole platform runs for **$0/month**:

| Piece | Where it runs | Cost |
| --- | --- | --- |
| API (11 Spring services + Caddy auto-HTTPS) | Oracle Cloud Always Free VM (ARM, 4 cores / 24GB) | $0 |
| Database (Postgres) | Neon serverless free tier | $0 |
| Web app (Vite/React build) | Cloudflare Pages | $0 |

After a one-time setup (~20 min), every future deploy is **one click** in the GitHub
Actions tab. This guide is the one-time setup.

---

## Test the whole stack locally first (no cloud, no Docker) ✅ verified

Before paying for / setting up any cloud, run the entire platform on your Mac against a
real local Postgres. This is the fast test loop.

```bash
# one-time
brew install openjdk@17 postgresql@16 && brew services start postgresql@16
cd finance-mvp
bash deploy/init-local-db.sh        # creates the `wealth` role + one DB per service

# build + run the backend (11 services on Postgres, dev profile, mock providers)
REBUILD=1 bash deploy/start-local.sh   # omit REBUILD next time if jars exist
#   builds per-service: mvn -f apps/<svc>/pom.xml clean package -DskipTests

# run the web app (new terminal)
npm install && npm run dev -w apps/web   # http://localhost:5173
```

Services may take ~60–70s to finish booting (the script's 45s wait is conservative).
Verify everything is wired:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/actuator/health   # 200
# register → returns a JWT; that token then authorizes /api/v1/me/snapshot (200)
```
Open http://localhost:5173 → register → link a Plaid sandbox account
(`user_good` / `pass_good`). All major routes (accounts, real-estate, AI, notifications,
business, planning) answer 200 through the gateway on :8080.

> This native path is the dev/test loop. The cloud steps below are for a real, always-on
> deployment. Both run the *same* code; only the DB/host/provider keys differ.

---

## 0. Prerequisites
- A GitHub account with this repo (CI builds the images to GHCR on every push to `main`).
- An Oracle Cloud account (free signup; needs a card for identity, **not charged** on Always Free).
- A Neon account (free) for Postgres.
- A Cloudflare account (free) for the web app.
- A domain you control (for `api.yourdomain.com`). A cheap domain is fine; Cloudflare can manage DNS.

---

## 1. Database — Neon (5 min)
1. Create a Neon project. You get one Postgres instance.
2. Create the databases/roles each service needs (or one DB with a schema per service).
   See `MIGRATION.md` for the schema-per-service layout.
3. Copy the connection string(s). For each service you'll set its `*_DATABASE_URL` /
   `*_DATABASE_USER` / `*_DATABASE_PASSWORD` in `.env.prod` (next step).
   Neon URLs look like `jdbc:postgresql://<host>/<db>?sslmode=require`.

> Tip: start with **one** Neon database and point every `*_DATABASE_URL` at it; split later if needed.

---

## 2. The VM — Oracle Always Free (10 min)
1. In Oracle Cloud → **Compute → Instances → Create instance**.
2. **Image:** Ubuntu 22.04 or 24.04. **Shape:** `VM.Standard.A1.Flex` (Ampere/ARM).
   Set **4 OCPUs + 24 GB RAM** (all within Always Free).
3. Add your **SSH public key** (the one paired with the private key you'll give GitHub later).
4. Create. Note the **public IP**.
5. **Open the firewall** in Oracle's VCN Security List: allow inbound **80** and **443** (TCP).
   (SSH/22 is open by default.)

> If you get an "out of capacity" error on the free A1 shape, retry in a few hours or pick a
> different availability domain/region — free ARM capacity is shared and comes and goes.
> Switching the account to "Pay As You Go" keeps Always Free resources free but improves access.

### Harden + install Docker (run once)
SSH in as the default `ubuntu` user, become root, and run the bootstrap script:
```bash
# from your laptop:
scp deploy/bootstrap-vm.sh ubuntu@<VM_IP>:/tmp/
ssh ubuntu@<VM_IP>
sudo bash /tmp/bootstrap-vm.sh deploy     # creates hardened 'deploy' user + Docker
```
This installs Docker, a firewall, fail2ban, auto-updates, and a `deploy` user. From now on
log in as `deploy@<VM_IP>`.

### Put the repo + secrets on the VM
```bash
ssh deploy@<VM_IP>
git clone https://github.com/<your-org>/my-wealth-management.git ~/my-wealth-management
cd ~/my-wealth-management/finance-mvp
cp .env.prod.example .env.prod
nano .env.prod        # fill every value (see checklist below)
```
If your GHCR images are **private**, log Docker in once so the VM can pull them:
```bash
echo <GHCR_PAT> | docker login ghcr.io -u <github-username> --password-stdin
```

**`.env.prod` must-fill checklist:**
- `GHCR_OWNER` — your GitHub org/user (lowercase), e.g. `suresh`
- `API_DOMAIN` — `api.yourdomain.com` (points at the VM IP — see DNS below)
- `ACME_EMAIL` — your email (Let's Encrypt)
- `WEB_ORIGINS` — your web URL(s), e.g. `https://app.yourdomain.com` (comma-separated, no wildcard)
- `JWT_SECRET`, `APP_ENCRYPTION_KEY`, `AUDIT_INGEST_KEY` — strong random values
  (e.g. `openssl rand -base64 48`)
- All `*_DATABASE_URL` / `*_DATABASE_USER` / `*_DATABASE_PASSWORD` — from Neon (step 1)
- Provider keys (Plaid, Stripe, AI, etc.) — leave blank to keep mocks; fill to go real

### DNS for the API
Point an **A record** `api.yourdomain.com → <VM_IP>`. Caddy will auto-issue HTTPS on first boot.

### First boot (manually, once)
```bash
cd ~/my-wealth-management/finance-mvp
TAG=latest ./deploy/deploy.sh
```
Wait for "all services healthy ✓". Verify: `https://api.yourdomain.com/actuator/health`.

---

## 3. Wire up one-click deploy from GitHub (3 min)
In GitHub → **Settings → Secrets and variables → Actions → New repository secret**, add:

| Secret | Value |
| --- | --- |
| `DEPLOY_HOST` | the VM public IP (or `api.yourdomain.com`) |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_SSH_KEY` | the **private** SSH key whose public half is on the VM |
| `DEPLOY_PATH` | (optional) `/home/deploy/my-wealth-management` — defaults to `~/my-wealth-management` |

**(Optional) approval gate:** Settings → Environments → `production` → add yourself as a
required reviewer. Then each deploy waits for your click.

### From now on — the one click
1. Push to `main` → CI builds + pushes multi-arch images to GHCR (tagged with the commit SHA).
2. GitHub → **Actions → CI → Run workflow** → enter the SHA (or `latest`) → **Run**.
3. It SSHes to the VM, pulls those images, restarts the stack, waits for healthy. Done.

---

## 4. The web app — Cloudflare Pages (5 min, then automatic)
1. Cloudflare → **Workers & Pages → Create → Pages → Connect to Git** → pick this repo.
2. Build settings:
   - **Root directory:** `finance-mvp`
   - **Build command:** `npm install && npm run build -w apps/web`
   - **Build output directory:** `apps/web/dist`
3. **Environment variable:** `VITE_API_BASE = https://api.yourdomain.com`
4. (Optional) Custom domain `app.yourdomain.com` in the Pages project.
5. Deploy. Every future push to `main` auto-rebuilds the web app — no action needed.

> Make sure `WEB_ORIGINS` in `.env.prod` includes the exact Pages URL, or the browser will
> get CORS-blocked by the gateway.

---

## 5. Sanity check the whole thing
- `https://api.yourdomain.com/actuator/health` → `{"status":"UP"}`
- Open the web app → register → link a Plaid sandbox account (`user_good`/`pass_good`).
- On the VM: `cd finance-mvp && docker compose -f docker-compose.prod.yml --env-file .env.prod ps`
  → all services `healthy`.

---

## Cost & scaling notes
- **Biggest cost lever isn't the host — it's the 11 JVMs.** They fit free on Oracle's 24GB
  ARM box, but if you ever consolidate to a modular monolith (1–2 JVMs) the whole API fits a
  2GB box and runs free *anywhere*. Worth doing once you have users, not before.
- Keep Postgres on **Neon** (off the VM) so the VM only runs JVMs — that's why 24GB is plenty.
- If Oracle free capacity becomes a headache, the same kit runs on **Hetzner CAX21** (~€6.5/mo)
  with zero changes — it's ARM too, so the multi-arch images already work.
