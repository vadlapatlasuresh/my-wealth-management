# TerraVest — Financial Standards, Compliance, Auditing, Observability & Data-Gaps Review

A practical review of what a personal **+ business** finance platform needs to be
trustworthy and defensible (industry/legal), plus where we can improve flow,
auditing, logging, KPIs/dashboards, and the data model — and a roadmap for the
features you asked about (goals, calculators, mortgage payoff).

> Status legend: ✅ in place · 🟡 partial · ⬜ to build. None of this is legal
> advice — engage counsel/compliance before go‑live.

---

## 1. Regulatory / legal landscape (what actually applies)
TerraVest aggregates accounts and shows insights; it is **not** (yet) a bank,
broker, or RIA. The realistic obligations:

| Area | What it means for us | Status |
|---|---|---|
| **Data aggregation (Plaid)** | Honor Plaid's data-use terms; store tokens encrypted; let users disconnect & delete. | 🟡 Plaid wired; token encryption placeholder (`APP_ENCRYPTION_KEY`) ⬜ |
| **GLBA / privacy (US)** | Safeguard nonpublic personal info; privacy notice; right to delete. | 🟡 SSN/EIN last‑4 only ✅; account delete ✅ (cross-service cascade ⬜) |
| **CCPA/CPRA, GDPR (if EU)** | Export my data, delete my data, consent records. | 🟡 **data export ✅** (client bundle + `GET /api/v1/me/export`); account delete ✅; cross-service cascade + consent ledger ⬜ |
| **PCI DSS** | Only if we touch card PANs. **Avoid storing PANs** — use Stripe/Plaid tokens. | ✅ design avoids PANs |
| **"Not financial advice"** | Disclaimers on AI + projections/calculators. | ✅ config-driven disclaimers exist |
| **Payments (bill pay)** | Money movement = use a licensed rail (Stripe/Plaid Transfer/Dwolla); don't custody funds. | 🟡 provider-abstracted, mock until keys |
| **SOC 2 (trust, for B2B)** | Access control, audit logs, change mgmt, monitoring. | 🟡 audit-service + RBAC exist; formal controls ⬜ |
| **Record retention** | Define how long audit/financial records are kept. | ⬜ retention policy |

**Top legal to-dos:** (a) encrypt provider tokens at rest; (b) a real
**data-export + account-deletion** flow; (c) a versioned **consent ledger**
(disclaimer acceptances already model this — extend to ToS/privacy); (d) a
written **data-retention** policy enforced by a purge job.

---

## 2. Auditing (improve the flow)
**Have ✅:** `audit-service` persists domain events (login success/failure,
register) + gateway request capture; user-facing `/api/v1/audit/me`; internal
query API guarded by an internal key; immutable append rows.

**Improve:**
- ✅ **Tamper-evidence:** hash-chain shipped — each row stores
  `prev_hash` + `entry_hash` (SHA-256 over the previous hash + canonical content).
  `GET /api/v1/audit/verify` (internal key) walks the chain and reports
  `{valid, count, brokenAtId, detail}`. Verified: editing any row directly in the
  DB flips verify to `valid:false` with the offending id.
- ⬜ **Coverage:** emit audit events for *every* state change — money movement
  (bill pay create/cancel), account link/unlink, property/goal CRUD, role
  changes, settings/security changes, data export/delete. (Today: auth + all
  gateway-captured requests; extend to per-service domain events.)
- **Who/where/why:** ensure actor, source IP, user-agent, before/after on every
  sensitive change (schema already has the columns).
- **Retention + WORM:** ship audit logs to append-only storage; define retention.
- **Reason codes:** standardize `action` taxonomy (e.g. `payment.created`,
  `account.unlinked`) so dashboards/alerts can group them.

---

## 3. Observability — internal logging & issue tracking (M7)
**Have 🟡:** Spring Actuator health; per-service logs to stdout; the recurring
`/error` masking bug is now fixed across services.

**Build ⬜:**
- **Structured JSON logs** + a **correlation/request id** propagated from the
  gateway through every service (one id to trace a user action end-to-end).
- **Metrics:** Micrometer → Prometheus (`/actuator/prometheus`): latency,
  error rate, throughput per endpoint; JVM/DB pool gauges.
- **Health/readiness** wired to the orchestrator; DB + downstream checks.
- **Error tracking:** Sentry (web + services) to capture exceptions with the
  correlation id and user/session context.
- **Tracing:** OpenTelemetry spans across the gateway→service hops.
- **Alerting/SLOs:** alert on 5xx rate, p95 latency, auth-failure spikes,
  payment failures, DB saturation.

---

## 4. KPI metrics + dashboards
Two audiences:

**A. Member-facing KPIs (in-app):** net worth & trend ✅, savings rate, DTI
(debt-to-income), credit utilization ✅, emergency-fund months, budget
adherence, goal progress ⬜, projected retirement readiness ⬜.

**B. Operator/admin dashboard ⬜ (new):** built from `audit-service` + service
data — DAU/MAU, signups, linked-account success rate, bill-pay volume/failures,
AI usage, error rate by service, p95 latency, top failing actions. This is the
"some kind of dashboard that helps" — a `/admin` analytics view gated to
ADMIN/CARE roles, sourced from the audit event stream + Prometheus.

---

## 5. Data model — gaps & what to add
**Solid today:** users, accounts/transactions (Plaid), net-worth snapshots
(history ✅ new), budgets/lines, debts/scenarios, properties, deals, payment
intents, notifications/templates, disclaimers/acceptances, audit events.

**Gaps / additions ⬜:**
- **Goals** — savings/payoff/target-net-worth goals with progress (see §6).
- **Recurring transactions / bills** — detect & store cadence (powers real
  "upcoming bills" beyond scheduled intents).
- **Categories & rules** — user-editable categorization + budget mapping.
- **Account ownership / household** — joint/business vs personal scoping.
- **Documents** — statements, tax docs (with secure storage).
- **Consent ledger** — ToS/privacy versions accepted (extend disclaimer model).
- **Money movement ledger** — double-entry record of transfers for auditability.
- **Per-currency support** — store currency on every monetary field (some exist).

---

## 6. Feature roadmap you asked for
| Feature | What it does | Status |
|---|---|---|
| **Finance calculators** | Simple interest, compound (with contributions), **mortgage payoff + "how much more can I pay"** (months & interest saved, payoff date), prefill from a linked mortgage. | ✅ **shipped** (`/calculators`, pure tested math in `utils/calculators.js`, 9 tests) |
| **Goals** | Create savings/debt-payoff/net-worth goals, track progress vs. real balances, target date & required monthly contribution (reuses compound math). | ⬜ next (needs `goals` table + endpoints + UI) |
| **Retirement / FIRE projection** | Project net worth to retirement using the compound engine + real net worth. | ⬜ |
| **Affordability / DTI** | "Can I afford this?" using real income/debt. | ⬜ |
| **Admin KPI dashboard** | §4B operator analytics from audit + metrics. | ⬜ |

### Suggested build order (no external keys needed)
1. **Goals** (backend `financial-core` table + `/api/v1/planning/goals` CRUD +
   Goals page; required-monthly-contribution via the compound engine). 
2. **Audit coverage + hash-chain** (§2) — high trust value, pure code.
3. **Observability M7** (structured logs + correlation id + Prometheus + Sentry).
4. **Admin KPI dashboard** (depends on 2 + 3).
5. Token encryption at rest + data export/delete (legal must-haves) — some need
   the `APP_ENCRYPTION_KEY` you set in env.

Everything in 1–4 is implementable without provider keys; #5 needs the encryption
key + (for prod) a managed Postgres.
