# 7. Beginner's Guide (Assumes No Prior Experience)

This guide assumes you have **never** worked with this kind of project before. It explains the
ideas in plain language and gives you exact commands to copy. If a term is new, there's a
glossary at the end (§8).

---

## 1. Install the tools (one time)

You need five tools. Open the **Terminal** app (macOS) and run these. If you don't have
[Homebrew](https://brew.sh) (a macOS installer), install it first from that link.

```bash
brew install openjdk@17     # Java 17 — runs the backend services
brew install maven          # Maven — builds the Java services
brew install node           # Node.js 18+ — runs the website and build tools
brew install --cask docker  # Docker Desktop — runs the production-style containers
brew install postgresql@16  # PostgreSQL — optional, for persistent local data
```

Check each worked:
```bash
java -version    # should say 17.x
mvn -v           # should print a version
node -v          # should be v18 or higher
docker -v        # should print a version (start Docker Desktop once after installing)
```

> **What is each tool?** Java + Maven build and run the **backend** (the part that stores data
> and does the logic). Node runs the **frontend** (the website you see). Docker packages
> everything into containers (how it runs in production). Postgres is the database.

---

## 2. Run the app on your laptop (the simplest way)

This uses an **in-memory database** — no Postgres needed. Data disappears when you stop it,
which is fine for trying it out.

```bash
cd finance-mvp        # go into the app folder (from the repo root)
npm install           # download website + tooling dependencies (first time only, ~minutes)
npm run build:backend # compile the Java services (first time is slow; later runs are faster)
npm run start:backend # start the backend (many services start in the background)
npm run dev:web       # start the website
```

Now open **http://localhost:5173** in your browser.

- **To log in:** click "Create account" and register with any email + a password like
  `Password123!`, or use the pre-seeded account `test1@example.com` / `Password123!`.
- You'll land on the **Home** dashboard. Click around the sidebar — every screen works.
- Paid features (real bank linking, AI, email) show **mock data** until keys are added — that's
  expected and normal.

**To stop everything:**
```bash
pkill -f spring-boot:run   # stop the Java backend
pkill -f vite              # stop the website
```

> Want data to **persist** across restarts? Use the Postgres path in
> [05-WORKFLOWS.md](05-WORKFLOWS.md) §2 instead.

---

## 3. Understand the project in 5 minutes

Picture a **restaurant**:
- The **website/app** ([`apps/web`](../finance-mvp/apps/web/)) is the **dining room** — what the
  customer sees and touches.
- The **API gateway** (`api-gateway`, port 8080) is the **host at the front door** — every
  request goes through it; it checks your ticket (the login token) and sends you to the right
  place.
- The **services** (auth, accounts, net worth, real estate…) are **specialized cooks** — each
  one does exactly one job. They never talk to the customer directly, only through the host.
- The **database** (Neon Postgres) is the **pantry** — where everything is stored. Each cook has
  their own pantry shelf (one database per service).
- **External APIs** (Plaid, Stripe, AI…) are **outside suppliers**. By default the kitchen uses
  **stand-in ingredients (mocks)** so it can cook without paying any supplier. You "sign a
  contract" with a supplier by pasting a key into one file.

**The golden rules to remember:**
1. The website only ever talks to the **gateway** (`:8080`), never to a service directly.
2. **Every paid feature is mocked by default** — the app works for free.
3. **One file controls production config:** `finance-mvp/.env.prod` (lives only on the server).
4. **To deploy:** push to `main`, then click one button in GitHub Actions.

---

## 4. Find your way around the code

| You want to change… | Look in… |
|---|---|
| A screen / page you see | [`finance-mvp/apps/web/src/pages/`](../finance-mvp/apps/web/src/pages/) (e.g. `HomePage.jsx`) |
| How the website calls the backend | [`finance-mvp/apps/web/src/api.js`](../finance-mvp/apps/web/src/api.js) |
| Styling / colors / layout | [`finance-mvp/apps/web/src/styles/terravest-theme.css`](../finance-mvp/apps/web/src/styles/terravest-theme.css) (**not** `styles.css` — that's dead) |
| Light/Dark/Glass themes | [`finance-mvp/apps/web/src/theme.js`](../finance-mvp/apps/web/src/theme.js) |
| Backend logic for a feature | `finance-mvp/apps/<service>/src/main/java/...` |
| Database schema for a service | `finance-mvp/apps/<service>/src/main/resources/db/migration/` (Flyway `V#__*.sql`) |
| Production config / secrets | `finance-mvp/.env.prod` (server only) + [`.env.prod.example`](../finance-mvp/.env.prod.example) |
| How it deploys | [`finance-mvp/deploy/deploy.sh`](../finance-mvp/deploy/deploy.sh) + [`docker-compose.prod.yml`](../finance-mvp/docker-compose.prod.yml) |

---

## 5. Debug like a pro (even as a beginner)

**Step 1 — reproduce it.** Note exactly what you clicked and what went wrong.

**Step 2 — look at the right place:**
- *Website looks broken / a button does nothing:* open the browser's **DevTools** (right-click →
  Inspect → Console and Network tabs). Red errors in Console tell you what failed.
- *A page says you're logged out unexpectedly:* the app auto-logs-out on a `401/403` (expired or
  invalid token) — just log back in.
- *Everything is unstyled plain text:* you edited the dead `styles.css`. Put your CSS in
  `terravest-theme.css` instead.
- *A backend feature errors:* check the service log. Locally that's `/tmp/svc-<name>.log` (or the
  terminal). In production, SSH to the VM and run
  `docker compose -f docker-compose.prod.yml --env-file .env.prod logs --tail=100 <service>`.

**Step 3 — recognize common messages** (full list in [05-WORKFLOWS.md](05-WORKFLOWS.md) §7):
- `falling back to mock` → a provider key is missing. Expected if you haven't added it.
- `Migration checksum mismatch` → someone edited an old database migration. Never do that — add
  a new one.
- `mfaRequired: true`, `token: null` → that's multi-factor auth working; verify the code.

**Step 4 — when stuck,** read the matching doc:
[`OPERATIONS_RUNBOOK.md`](../finance-mvp/OPERATIONS_RUNBOOK.md) for ops,
[`api-reference.md`](../docs/architecture/api-reference.md) for endpoints,
[`docs/architecture/flows/`](../docs/architecture/flows/) for how a feature flows end to end.

---

## 6. Make your first change (a safe practice run)

1. Run the app locally (§2).
2. Open [`apps/web/src/pages/HomePage.jsx`](../finance-mvp/apps/web/src/pages/HomePage.jsx),
   change a heading's text, save. The browser hot-reloads instantly — you'll see it.
3. Revert it (or keep it). That's the whole loop: edit → save → see it.
4. When ready to ship a real change, follow [05-WORKFLOWS.md](05-WORKFLOWS.md) §4 (commit → push
   → merge → click deploy).

---

## 7. Safety rules (don't skip)

- **Never commit secrets.** `.env.prod`, real API keys, the JWT secret — none of these go in git.
- **Never edit a database migration that already ran.** Add a new `V#__*.sql` file instead.
- **Test before you deploy:** run it locally and, if you touched a service, `mvn test` it.
- **The security gate** (OTP dev codes are exposed in prod) must be closed before real users —
  see [03-PENDING-TASKS.md](03-PENDING-TASKS.md) §3.0.

---

## 8. Glossary

- **Microservice** — a small program that does one job; many together form the backend.
- **API gateway** — the single front door all requests pass through.
- **JWT** — a signed token proving you're logged in; sent on every request.
- **MFA / OTP** — multi-factor auth; a one-time code sent by email/SMS.
- **Mock** — a stand-in for a real external service so the app runs without keys.
- **Flyway migration** — a versioned SQL file that builds/updates the database schema.
- **Caddy** — the web server that serves the site and forwards `/api` calls + handles HTTPS.
- **Neon** — the cloud PostgreSQL database provider.
- **GHCR** — GitHub Container Registry, where the built Docker images are stored.
- **Capacitor** — the tool that wraps the website into iOS/Android apps.
- **Provider toggle** — a config flag (e.g. `AI_PROVIDER=anthropic`) that switches a feature from
  mock to a real external service.
