# 2. What Is Completed

This is a faithful summary of what is **built and verified working**. The authoritative,
dated test record is in [`finance-mvp/OPERATIONS_RUNBOOK.md`](../finance-mvp/OPERATIONS_RUNBOOK.md)
§6 and §11b (live production test, 2026-06-09: all core flows green).

> **Headline:** TerraVest is **live in production at https://app.terravest.app**. All 11 Java
> services are deployed and healthy. Every core money/feature flow works end-to-end with **no
> third-party keys** (paid integrations run as mocks until you add a key).

---

## 2.1 Platform & infrastructure ✅

- **Deployed and live** on a single GCP VM running Docker Compose (11 services + Caddy).
- **HTTPS** auto-issued by Caddy (Let's Encrypt); same-origin (Caddy proxies `/api` → gateway,
  so no CORS issues in prod).
- **Database:** Neon Postgres, **one database per service** (persistent — survives VM loss).
- **CI/CD:** GitHub Actions builds + tests every service and the web app, builds multi-arch
  Docker images, and pushes them to GHCR. One-click deploy workflow SSHes to the VM and runs
  `deploy/deploy.sh` (pull images → rebuild web → restart → health-wait).
- **Infra-as-code:** Terraform in [`finance-mvp/infra/gcp/`](../finance-mvp/infra/gcp/)
  recreates the VM, static IP, firewall, and Cloud KMS key from scratch.
- **Centralized encrypted secret store** (`secrets-service`) rolled out to all services, with
  KEK in Cloud KMS (or a local master key).
- **Observability:** Prometheus metrics + correlation IDs across gateway, logs, and Feign hops.
- **Tamper-evident audit** log with a `/verify` hash-chain check.

## 2.2 Features completed (end-to-end)

Per the phase plan (`docs/phases/`) and the master status doc
([`PROJECT_STATUS.md`](../PROJECT_STATUS.md)), Phases 0–7 are done:

| Phase | Theme | Status |
|---|---|---|
| 0 | Foundation & run-fixes (build, boot, CORS, budget fixes, 401/403 self-heal) | ✅ Done |
| 1 | Core accounts & money (auth, Plaid linking, net worth, budgets, debt) | ✅ Done |
| 2 | UI redesign to the TerraVest design system (every screen) | ✅ Done |
| 2.1 | Auth redesign, real account profile (name capture), real screens for Settings/Security/Messages/Fractional-LLC, topbar wiring | ✅ Done |
| 3 | Real Estate service (CRUD + valuation, mock provider) | ✅ Done |
| 4 | Business Financials service (dashboard/P&L/invoices/expenses, mock) | ✅ Done |
| 5 | AI Insights service (insights + chat, mock LLM) | ✅ Done |
| 6 | Payment service (bill-pay intents, mock Stripe) | ✅ Done |
| 7 | Notification service (notifications + preferences, mock email/push) | ✅ Done |

### Feature detail — what a real user can do **today** with no keys
Verified end-to-end against live production (real signup → JWT → write → read back), plus a
Playwright browser suite:

- **Onboarding:** email OTP → SMS OTP → KYC register → dashboard.
- **Returning login:** password → MFA challenge → verify → dashboard.
- **Profile:** update + read-back; **account deletion**.
- **Real estate:** add property → appears in list → revalue.
- **Planning:** goals CRUD; debt add + payoff scenario; budgets.
- **Investments:** link broker, add alternative investments.
- **Deal Room:** create deal → marketplace; watch; express interest; sponsor track-record.
- **Business:** manual business + accounts (create → list).
- **Notifications:** preferences update; test notification.
- **AI:** chat + insights refresh (mock responses until a key is added).
- **Audit:** read my activity timeline.

> These cover **all manual data-entry flows** — a real user can sign up and use the whole app
> meaningfully without any third-party keys.

## 2.3 Screens completed (web)

Every nav item resolves to a designed, functional page (in
[`apps/web/src/pages/`](../finance-mvp/apps/web/src/pages/)):

Home · Accounts · Transactions · Plan/Budget · Goals · Calculators · Invest · Cash ·
Bill Pay · Real Estate · Deal Room · Fractional LLC · My Business · AI Assistant · Learn/Guide ·
Messages · Security · Settings · Profile · Customer Care (member 360) · Admin Dashboard
(role-gated analytics) · Auth (split-screen sign in / sign up with MFA).

The design reference mockups live in [`assets/`](../assets/) and are kept in sync per
[`docs/DESIGN_SYNC.md`](../docs/DESIGN_SYNC.md).

## 2.4 Already real (not mocked)

The following work with **real data/logic**, no provider key required:
- Net worth computed from real account balances.
- Budgets, goals, calculators, debt lab (avalanche/snowball/hybrid).
- Tamper-evident audit + `/verify`.
- Admin KPI dashboard.
- Prometheus metrics + correlation IDs.
- Data export + account delete.
- Postgres persistence.
- 31 web (Vitest) tests + backend (JUnit) tests.

When a Plaid key is added, the **entire core money pipeline becomes real**: linked accounts →
transactions → categories → net worth → budgets.

---

## 2.5 One known issue already fixed in code

- **Disclaimers endpoint returned HTTP 500** because `Disclaimer.bodyMarkdown` was `@Lob` but
  the DB column is Postgres `TEXT`. **Fixed in code** (`@Column(columnDefinition="text")`);
  ships on the next deploy. See [`OPERATIONS_RUNBOOK.md`](../finance-mvp/OPERATIONS_RUNBOOK.md) §7.

Continue to **[03-PENDING-TASKS.md](03-PENDING-TASKS.md)** for what's left.
