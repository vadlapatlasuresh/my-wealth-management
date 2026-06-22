# TerraVest — Project Documentation (Start Here)

> **What this folder is:** the single, beginner-friendly handbook for the TerraVest
> wealth-management platform. If you have **never seen this project before**, read this
> page top to bottom, then follow the links. Everything you need to understand, build,
> debug, run, and ship the app is reachable from here.

**Live app:** https://app.terravest.app
**Code root:** [`finance-mvp/`](../finance-mvp/)
**Last updated:** 2026-06-11

---

## The 60-second mental model

- **TerraVest is a wealth-management app** for self-employed people and real-estate owners.
  It links your bank accounts, shows your net worth, budgets, debts, properties, business
  finances, and AI insights — all in one place.
- **One website + one phone app** come from a **single React codebase** ([`apps/web`](../finance-mvp/apps/web/));
  the phone app is the same web app wrapped with Capacitor (iOS + Android).
- **The backend is 11 small Java services** (Spring Boot) sitting behind **one front door**
  (the "API gateway"). Each service owns one job (auth, accounts, net worth, etc.).
- **One GCP virtual machine** runs all of it as Docker containers. **Caddy** (a web server)
  serves the website and forwards `/api` calls to the backend, and auto-issues the HTTPS cert.
- **The database is Neon** (cloud Postgres) — one database per service.
- **Every paid integration (Plaid, Stripe, AI, email, SMS…) is OFF by default and uses a
  built-in mock.** The whole app works for free. You turn each one on by pasting a key into
  one file (`.env.prod`) and redeploying. No code changes.
- **To deploy:** push to `main` → GitHub builds container images → you click one button
  ("Run workflow") → the VM pulls the images and restarts.

If you remember only that, you can navigate this project.

---

## How to read this documentation

Read in order if you're new; jump directly if you know what you need.

| # | Document | Read it when you want to… |
|---|---|---|
| — | **[README.md](README.md)** (this file) | Get oriented and find everything |
| 1 | **[01-PROJECT-OVERVIEW.md](01-PROJECT-OVERVIEW.md)** | Understand what the app is, the strategy, and the architecture |
| 2 | **[02-COMPLETED.md](02-COMPLETED.md)** | See exactly what is built and working today |
| 3 | **[03-PENDING-TASKS.md](03-PENDING-TASKS.md)** | See the full list of what's left to do |
| 4 | **[04-ROADMAP-TO-LIVE.md](04-ROADMAP-TO-LIVE.md)** | Know the next phases to make it production-real for users |
| 5 | **[05-WORKFLOWS.md](05-WORKFLOWS.md)** | Do something: build, run locally, deploy, enable a provider, debug |
| 6 | **[06-APIS-AND-KEYS.md](06-APIS-AND-KEYS.md)** | Look up every API (internal + external) and every key |
| 7 | **[07-BEGINNER-GUIDE.md](07-BEGINNER-GUIDE.md)** | Build/run/debug with **zero prior experience** (assumes nothing) |
| 8 | **[08-DESIGN-AND-FEATURES.md](08-DESIGN-AND-FEATURES.md)** | Read the design system and per-feature descriptions |
| 9 | **[09-RUN-PROMPT.md](09-RUN-PROMPT.md)** | Copy a ready-to-use prompt to run/operate/rebuild the app |

---

## The most important existing documents (deep dives)

This handbook summarizes and points to the detailed docs already in the repo. The canonical
deep references are:

- **Operations runbook** — [`finance-mvp/OPERATIONS_RUNBOOK.md`](../finance-mvp/OPERATIONS_RUNBOOK.md)
  (what's live, every external API + its toggle, the deploy loop, disaster recovery).
- **Full API reference** — [`docs/architecture/api-reference.md`](../docs/architecture/api-reference.md)
  (every endpoint: UI method → gateway route → service → storage).
- **System architecture** — [`docs/architecture/system-architecture.md`](../docs/architecture/system-architecture.md).
- **Per-feature flow diagrams** — [`docs/architecture/flows/`](../docs/architecture/flows/).
- **Per-service workflows** — [`docs/workflows/components/`](../docs/workflows/components/).
- **Phase plans (history + remaining)** — [`docs/phases/`](../docs/phases/).
- **Screen & feature inventory (source of truth for screens)** — [`docs/SCREEN_FEATURE_INVENTORY.md`](../docs/SCREEN_FEATURE_INVENTORY.md).
- **Master status doc** — [`PROJECT_STATUS.md`](../PROJECT_STATUS.md).

---

## Quick links by task

- **"I just want to run it on my laptop"** → [07-BEGINNER-GUIDE.md](07-BEGINNER-GUIDE.md) §2,
  or the fast path in [05-WORKFLOWS.md](05-WORKFLOWS.md) §1.
- **"I want to deploy a change to the live site"** → [05-WORKFLOWS.md](05-WORKFLOWS.md) §4.
- **"I want to turn on real bank linking / AI / email"** → [05-WORKFLOWS.md](05-WORKFLOWS.md) §5
  and [06-APIS-AND-KEYS.md](06-APIS-AND-KEYS.md).
- **"Something is broken, how do I debug?"** → [05-WORKFLOWS.md](05-WORKFLOWS.md) §7 and
  [07-BEGINNER-GUIDE.md](07-BEGINNER-GUIDE.md) §5.
- **"What's the absolute next thing to do?"** → [04-ROADMAP-TO-LIVE.md](04-ROADMAP-TO-LIVE.md) §1.
