# Proposal: Ops Portal

**Status:** **Phases 1–4 built (2026-07-16)** · Phases 5–6 open
**Built:** separate `ops_users` identity + mandatory MFA + `typ=ops` enforced across all 12 services
(P1); permission-based RBAC with a DB-editable access matrix (P2); actor/target/reason/diff audit on
a keyed HMAC chain with signed checkpoints (P3); the ops-admin + access-matrix screens (part of P4).
**Open:** the financial ops layer (P5) and the `ops.terravest.app` origin split (P6).

> **Access-control and audit reference:** [`ops-access-and-audit.md`](ops-access-and-audit.md) —
> the access matrix, what ops staff can and cannot reach, and what gets recorded.
**Area:** New `ops-service` + extensions to `auth-service`, `audit-service`, `payment-service`, `apps/web` (`/ops`)
**Related shipped work:** A first-cut ops portal already exists — `components/OpsPortal.jsx`, `pages/CustomerCarePage.jsx`, `pages/AdminDashboardPage.jsx`, `/api/v1/support/**` in auth-service, and the hash-chained `audit-service`. This proposal is about closing the gap between that and a real ops tool.

---

## 1. Executive summary

**Roughly 40% of the ask already exists and works.** There is a dedicated ops shell at `/ops`
with its own top bar, left nav, and agent identity chip; a customer search that already handles
free-text and structured (first/last/email/phone) queries; a customer-360 page with read-only
Accounts / Transactions / Payments / Deals tabs; role gating on `CARE` / `ADMIN`; and a
tamper-evident SHA-256 hash-chained audit log with a `/verify` endpoint. The design language is
already extended for ops — there are 27 `.ops-*` classes in `terravest-theme.css`.

So this is **not a from-scratch build**. The work splits into three honest gaps:

1. **Ops identity is not actually separate.** An ops agent is a customer row in the `users`
   table with `CARE` added to their roles set. There is no separate login, and because the JWT
   secret is shared across all services, an agent's token is a fully valid *member* token
   everywhere.
2. **The audit log cannot answer the question you actually need.** `audit_events.user_id` is
   the JWT subject — the *actor*. There is no `target_user_id`. When an agent opens customer
   42, the row says "agent 7 did `GET /api/v1/support/users/42`". "Show me everyone who touched
   customer 42" is only answerable by string-matching URL paths, and "what changed and why" is
   not recorded at all.
3. **There is no financial ops layer.** `payment-service` has bill-pay intents and
   subscriptions. There are no refunds, adjustments, credits, or disputes — no ledger, no
   approvals, no anomaly review.

Plus two smaller ones: the permission model is two coarse roles (`CARE`/`ADMIN`) enforced by URL
path matchers, and there are no internal notes or escalation paths.

The guiding principle for this proposal: **an ops tool's job is to be trustworthy about power.**
Every capability an agent has over a customer's money or data must be scoped, attributable, and
reconstructable after the fact. Where that trades against agent convenience, it wins.

---

## 2. What exists today (verified in code)

| Capability | Where | State |
|---|---|---|
| Ops shell at `/ops`, own nav + top bar | [`components/OpsPortal.jsx`](../../finance-mvp/apps/web/src/components/OpsPortal.jsx) | Works |
| Customer search (free-text + structured) | [`SupportController.searchUsers`](../../finance-mvp/apps/auth-service/src/main/java/com/mywealthmanagement/authservice/support/SupportController.java) | Works |
| Customer 360 + read-only data tabs | [`pages/CustomerCarePage.jsx`](../../finance-mvp/apps/web/src/pages/CustomerCarePage.jsx) | Works |
| Role grant/revoke | `SupportController.changeRole` | Works, ADMIN-only |
| Agent's own session log | `OpsPortal.jsx` → `SessionLog` | Works |
| Hash-chained audit + `/verify` | [`AuditChainService`](../../finance-mvp/apps/audit-service/src/main/java/com/mywealthmanagement/auditservice/audit/AuditChainService.java) | Works, but see §5 |
| Blanket request capture | [`AuditLoggingFilter`](../../finance-mvp/apps/api-gateway/src/main/java/com/mywealthmanagement/apigateway/AuditLoggingFilter.java) | Works |
| Ops design tokens/classes | `terravest-theme.css` (27 `.ops-*` rules) | Works |

**Reuse, don't rebuild.** Everything below extends these rather than replacing them.

---

## 2b. Phase 1 — as built (2026-07-16)

| Piece | Where |
|---|---|
| Ops identity | `ops_users` + `ops_user_roles` (auth-service migration **V7**), `OpsUser`, `OpsRole` |
| Ops login | `POST /api/v1/ops/auth/login` → MFA → `POST /api/v1/ops/auth/mfa/verify` (`OpsAuthController`) |
| Agent's own trail | `GET /api/v1/ops/auth/me/activity` (ops id, not a customer id) |
| Token boundary | `OpsTokens` + `JwtAuthFilter` in **all 12 services** |
| Revocation | migration **V8** deletes every CARE/ADMIN grant from customer rows |
| Promotion path removed | `POST /support/users/{id}/roles`, its UI panel, and `Role.{CARE,ADMIN}` all deleted |
| Bootstrap | `OpsBootstrap` (`OPS_BOOTSTRAP_EMAIL` + `OPS_BOOTSTRAP_PASSWORD`) |
| Ops sign-in UI | `pages/OpsLoginPage.jsx`, `.ops-login-*` in `terravest-theme.css`, separate token slot in `api.js` |

**Verified by driving the running service**, not just tests: ops token → `/support/users` 200;
ops token → `/auth/me` **403**; member token → `/support/users` **403**; member token →
`/auth/me` 200; lockout engages after 5 failures without revealing that the account is locked.

> ⚠️ **Deploy requirement.** V8 revokes all existing staff access. The deploy that ships this
> **must** set `OPS_BOOTSTRAP_EMAIL` + `OPS_BOOTSTRAP_PASSWORD`, or nobody can reach the portal.
> Ops MFA codes are gated by `OPS_OTP_EXPOSE_DEV_CODE` (default **false**) — deliberately *not*
> the member `OTP_EXPOSE_DEV_CODE`, which is still `true` in prod pending SendGrid domain auth.
> And per the standing rule, this is a frontend change: it needs `deploy.sh` (a plain `up -d`
> leaves the SPA stale).

**Closed by Phase 3 (below):** ops audit rows now carry `target_user_id`, so "who viewed customer 42"
is a direct query rather than a guess from the request path.

---

## 2c. Phases 2 & 3 — as built (2026-07-16)

Full reference: [`ops-access-and-audit.md`](ops-access-and-audit.md).

| Piece | Where |
|---|---|
| Permission catalog (8 keys, all enforced) | `OpsPermission` enum; seeded to `ops_permissions` by **V9** |
| DB-editable roles + access matrix | `ops_roles` + `ops_role_permissions` (V9), `OpsRoleEntity`, `OpsPermissionService` |
| Enforcement | `@PreAuthorize` per endpoint (needs `@EnableMethodSecurity`); `perms` claim in the ops JWT |
| Cross-service | `customer.data.view` on aggregation/payments/deals support routes; `cpa.moderate` on CPA admin; `ops.analytics.view` on audit stats/health |
| Ops administration | `OpsAdminController` (`ops.user.manage`), `pages/OpsAccountsPage.jsx` (accounts + live access matrix) |
| PII behind a reason | `GET /support/users/{id}/pii` (`customer.pii.reveal`, reason ≥8 chars); 360 view no longer carries SSN/EIN at all |
| Actor/target/reason/diff | audit-service **V5** + `AuditEvent`; gateway populates actor/target on every request |
| Keyed chain + checkpoints | `AuditChainService` v2 HMAC (`hash_version` keeps v1 rows verifiable), `AuditCheckpointService` + **V6** |
| Queryable trail | `/api/v1/ops/audit/target/{id}` and `/actor/{id}` (`audit.query`); **Staff access** tab on the customer record |

**Verified by driving the running services**, not just tests: an agent and an admin — both fully
authenticated — differ exactly as designed (agent opens a record 200 / reveals PII **403**; admin
reveals **200**; agent → ops-admin **403**, → audit **403**). "Who touched customer 1" returns the
named actor and their stated reason. `/verify` reports chain + checkpoints valid; a forced checkpoint
pins the head and emits an `AUDIT-ANCHOR` log line. Granting agents `customer.pii.reveal` from the
admin API takes effect on the next login with no deploy; unknown keys 400, stripping the last
`ops.user.manage` 409, a junk reason 400.

Tests: 9 RBAC (allow **and** deny per permission), 10 chain/checkpoint (each one performs the attack
it claims to defend against), 4 gateway target-extraction. Full suite green across all 13 services.

> ⚠️ **New deploy requirement.** `AUDIT_CHAIN_KEY` is now **required** — audit-service refuses to
> start without it outside dev/test. It is *not* `AUDIT_INGEST_KEY` (that authenticates callers;
> this signs history). Generate with `openssl rand -hex 32`. **Changing it later invalidates every
> existing row's verification**, so treat it as append-only.

**Fixed along the way:** `@PreAuthorize` denials were surfacing as **500 "Access Denied"** because
the catch-all `@ExceptionHandler(Exception.class)` swallowed Spring Security's exception. Every
permission denial would have read as a broken server. Now a proper 403.

---

## 3. Identity & authentication

### The problem with today's model

`SupportBootstrap` promotes a customer account to `ADMIN`+`CARE`. That means the ops agent *is*
a member. Their token carries `sub = <their user id>` and passes every member endpoint's JWT
filter. There is no boundary — only a role check on `/api/v1/support/**`.

### Recommendation: separate ops identity, shared auth infrastructure

Add an `ops_users` table and a distinct login route inside **auth-service** (not a new service —
it already owns JWT minting, MFA, and password hashing, and a 12th service means a new Neon DB,
a new `docker-compose.prod.yml` entry, and a new gateway route for no real isolation win).

What makes it genuinely separate:

- **Own credential record.** `ops_users` has its own email/password/MFA. An ops agent's customer
  account (if they have one) is unrelated. No promotion path from customer → ops.
- **Own login route.** `POST /api/v1/ops/auth/login` — never `/api/v1/auth/login`.
- **Own token type.** The JWT carries `typ: "ops"` plus `perms: [...]`. This is the critical
  bit: **because the JWT secret is shared across all 11 services, an ops token would otherwise
  be silently accepted by every member endpoint.** Every service's `JwtAuthFilter` must reject
  `typ=ops` on member routes, and ops routes must require `typ=ops`. This is a small change
  replicated across services, and it is not optional — skipping it makes the separation
  cosmetic.
- **Mandatory MFA**, short token TTL (30–60 min vs. the member TTL), and no "remember me".

**Bootstrap:** replace `SupportBootstrap`'s promote-a-member behaviour with an
`OPS_BOOTSTRAP_EMAIL` + one-time invite token that creates the first `ops_admin`. Thereafter ops
admins invite each other.

> **Migration note:** existing `CARE`/`ADMIN` grants on customer rows must be migrated to
> `ops_users` and then **removed from the customer rows**. Leaving them is the whole vulnerability.

---

## 4. Role-based access control

### Recommendation: roles as DB-editable bundles of fine-grained permissions

Today's `hasAnyRole("CARE","ADMIN")` on a URL path matcher can't express "an agent may view a
customer but not reveal their SSN" — which is exactly the kind of rule this portal needs.

**Model:** permission strings are the unit of enforcement; roles are named bundles stored in the
DB (so you can retune a role without a deploy — the same pattern `payment-service` already uses
for its DB-editable plan catalog).

```
ops_permissions   (key, description)                    -- seeded from a Java enum, source of truth
ops_roles         (id, key, name, description)
ops_role_perms    (role_id, permission_key)
ops_user_roles    (ops_user_id, role_id)
```

**Proposed permission set:**

| Permission | Meaning |
|---|---|
| `customer.search` | Run searches |
| `customer.view` | Open a customer record |
| `customer.pii.reveal` | Unmask SSN/EIN last-4, full phone |
| `customer.note.write` | Add internal notes |
| `customer.flag.write` | Set/clear account flags |
| `customer.status.write` | Suspend/restore an account |
| `finance.ledger.view` | See the money history |
| `finance.adjustment.create` | Propose a refund/credit/adjustment |
| `finance.adjustment.approve` | Approve someone else's proposal |
| `finance.dispute.manage` | Work disputes/chargebacks |
| `audit.query` | Query the audit trail across customers |
| `ops.user.manage` | Create ops users, assign roles |

**Proposed default roles:**

| Role | Permissions |
|---|---|
| `ops_agent` (support agent) | search, view, note.write, flag.write |
| `ops_supervisor` | agent + status.write, adjustment.approve, pii.reveal, audit.query |
| `ops_finance` | search, view, ledger.view, adjustment.create, refund, dispute.manage |
| `ops_compliance` | search, view, ledger.view, audit.query — **read-only** |
| `ops_admin` | all + ops.user.manage |

Note that `ops_finance` **cannot approve its own proposals** and `ops_supervisor` **cannot
create** them. That separation is deliberate — see §6.

**Enforcement, three layers:**

1. **Backend, per-endpoint:** `@PreAuthorize("hasAuthority('finance.adjustment.create')")`.
   Method-level, not path-level — path matchers drift from the code they protect.
2. **Token:** `perms` claim, resolved at login. Trade-off: a revoked permission stays live until
   the token expires — which is why the ops TTL is short. (The alternative, checking the DB per
   request, costs a lookup on every call; at ops volume that's genuinely affordable, so this is
   a reversible decision.)
3. **UI:** a `<PermGate perm="...">` overlay component — this already exists in spirit as the
   `FeatureGate` used for subscription gating. Reuse the pattern so the codebase has one idea of
   "gated UI", not two.

---

## 5. Audit logging

This is the most important section, and the one where the current implementation is furthest
from the requirement.

### 5.1 Actor vs. target — the core schema gap

Add to `audit_events`:

```sql
ALTER TABLE audit_events ADD COLUMN actor_kind      VARCHAR(20);  -- MEMBER | OPS | SYSTEM | ANONYMOUS
ALTER TABLE audit_events ADD COLUMN actor_id        VARCHAR(64);  -- ops_user id when actor_kind=OPS
ALTER TABLE audit_events ADD COLUMN target_user_id  VARCHAR(64);  -- the customer acted UPON
ALTER TABLE audit_events ADD COLUMN reason          TEXT;         -- why (required for sensitive actions)
ALTER TABLE audit_events ADD COLUMN before_json     TEXT;         -- state before
ALTER TABLE audit_events ADD COLUMN after_json      TEXT;         -- state after
ALTER TABLE audit_events ADD COLUMN ticket_ref      VARCHAR(64);

CREATE INDEX idx_audit_target_time ON audit_events (target_user_id, created_at);
CREATE INDEX idx_audit_actor_time  ON audit_events (actor_id, created_at);
```

`user_id` stays as-is for backward compatibility (existing `/audit/me` and the member timeline
depend on it), but every new write populates `actor_*` and `target_user_id`.

This single change is what makes **"show me every ops action ever taken on customer 42, and by
whom"** a one-index query instead of a `LIKE '%/42%'` scan over URL paths.

### 5.2 Two tiers of events, one chain

- **Tier 1 — automatic coverage.** `AuditLoggingFilter` keeps capturing every request. Extend it
  to read `typ` and set `actor_kind=OPS`, and to extract `target_user_id` from the ops route
  pattern. Guarantees nothing is missed. Grain: HTTP.
- **Tier 2 — semantic events.** Ops write explicit events: `ops.customer.view`,
  `ops.pii.reveal`, `ops.note.add`, `ops.refund.execute`, with `before_json`/`after_json`/
  `reason`. This is the tier that answers *what changed and why*; the gateway physically cannot.

**Both go into the same `audit_events` table and the same hash chain.** One chain means one
`/verify`, one integrity story, and cross-tier queries. Splitting ops into its own table would
mean two chains and a correlation problem at exactly the moment you least want one.

### 5.3 Tamper-evidence: the current chain is weaker than it looks

`AuditChainService` computes `entry_hash = SHA-256(prev_hash | content)` with **no secret**.
Anyone who can write to the DB can rewrite a row *and* recompute every subsequent hash — the
chain verifies clean. It defends against a careless `UPDATE`; it does not defend against an
attacker or an insider, which is the actual threat model for a financial audit trail.

**Two fixes, both recommended:**

1. **HMAC-SHA256 with a key from `secrets-service`**, not stored in the audit DB. Now rewriting
   the chain requires DB write access *and* the KEK. The infrastructure for this already exists.
2. **Periodic checkpoint anchoring.** Daily, sign the current chain head and write it somewhere
   append-only outside the audit DB (a GCS bucket with object versioning is enough). Verifying
   against a checkpoint proves nothing before that point was altered, even by someone holding
   the key.

**Also flagged:** `append()` is `synchronized` — an in-process lock. Correct for one instance
(the current deployment), silently broken if audit-service is ever scaled to two. The existing
javadoc already calls this out. If ops traffic makes scaling likely, move to a Postgres advisory
lock before that happens, not after.

### 5.4 Retention

Audit rows are append-only, `UPDATE`/`DELETE` revoked at the DB grant level for the app user.
Retention 7 years for financial actions (fits the general regulatory posture for money movement);
purge by *chain segment* with a signed tombstone rather than row deletion, so the chain stays
verifiable across a purge boundary.

---

## 6. Financial tracking & auditing

### 6.1 Where it lives

Money truth is currently scattered: `payment-service` (Stripe, bill-pay, subscriptions),
`account-aggregation-service` (Plaid — read-only, someone else's money), `business-financials`
(invoices). **`payment-service` is the only service that actually moves money**, so the ledger
belongs there rather than in a new ops-service. Ops calls into it; it stays the system of record.

### 6.2 Append-only ledger

The rule: **nothing is ever mutated.** A correction is a new, reversing entry that references the
original. This is what makes the financial history auditable rather than merely current.

```sql
CREATE TABLE ledger_entries (
    id              BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id         VARCHAR(64) NOT NULL,
    entry_type      VARCHAR(32) NOT NULL,  -- CHARGE|REFUND|CREDIT|ADJUSTMENT|DISPUTE_HOLD|DISPUTE_RELEASE|REVERSAL
    amount_cents    BIGINT NOT NULL,       -- signed; + owed to us, - owed to customer
    currency        VARCHAR(3) NOT NULL DEFAULT 'USD',
    balance_after   BIGINT NOT NULL,       -- running balance, computed at append
    source          VARCHAR(32) NOT NULL,  -- STRIPE|BILLPAY|SUBSCRIPTION|OPS_ADJUSTMENT
    external_ref    VARCHAR(128),          -- Stripe charge/refund id
    reverses_id     BIGINT REFERENCES ledger_entries(id),
    adjustment_id   BIGINT REFERENCES ops_adjustments(id),
    idempotency_key VARCHAR(128) UNIQUE,   -- non-negotiable: prevents double refunds on retry
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      VARCHAR(64)            -- ops_user id, or 'SYSTEM'
);
CREATE INDEX idx_ledger_user_time ON ledger_entries (user_id, created_at);
```

### 6.3 Maker-checker on adjustments

Every ops-initiated money movement is a **request** that goes through a state machine, not a
direct write:

```
DRAFT → PENDING_APPROVAL → APPROVED → EXECUTING → EXECUTED
                        ↘ REJECTED          ↘ FAILED
```

```sql
CREATE TABLE ops_adjustments (
    id               BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id          VARCHAR(64) NOT NULL,
    kind             VARCHAR(32) NOT NULL,   -- REFUND|CREDIT|MANUAL_ADJUSTMENT|GOODWILL|DISPUTE_ACCEPT
    amount_cents     BIGINT NOT NULL,
    currency         VARCHAR(3) NOT NULL DEFAULT 'USD',
    reason_code      VARCHAR(48) NOT NULL,   -- from a fixed vocabulary, not free text
    reason_note      TEXT NOT NULL,          -- required narrative
    ticket_ref       VARCHAR(64),
    status           VARCHAR(24) NOT NULL,
    requested_by     VARCHAR(64) NOT NULL,
    requested_at     TIMESTAMP NOT NULL,
    decided_by       VARCHAR(64),            -- MUST differ from requested_by
    decided_at       TIMESTAMP,
    decision_note    TEXT,
    executed_at      TIMESTAMP,
    ledger_entry_id  BIGINT REFERENCES ledger_entries(id),
    failure_reason   TEXT
);
```

**Rules:**

- `decided_by <> requested_by`, enforced in code *and* as a DB check constraint. Four-eyes is
  the single highest-value control in this whole document — it is what stops one compromised or
  malicious agent from draining money.
- **Auto-approve below a threshold** (suggest **$25**) to keep routine goodwill credits fast;
  above it, an `ops_supervisor` must approve. The threshold lives in the DB catalog, editable
  without a deploy.
- `reason_code` from a fixed vocabulary — free text alone is unqueryable, and you will want
  "how much did we refund for `BILLING_ERROR` last quarter" eventually.
- Every transition writes a semantic audit event with before/after.
- Execution is idempotent on `idempotency_key`; a retry after a timeout can never double-refund.

### 6.4 Anomaly review

Rather than a "flag anomalies" button that does nothing much, make it concrete — a nightly job
in payment-service that raises `ops_anomalies` rows on rules that actually catch things:

- Refunds to a customer exceeding N or $X in a rolling 30 days
- An agent's adjustment volume >3σ above their peer group (catches the insider case)
- A ledger balance that disagrees with Stripe's balance for that customer (catches integration bugs)
- Repeated failed payments followed by a refund (catches a card-testing pattern)

Anomalies land in a supervisor queue with an accept/dismiss decision, and the decision is audited.

---

## 7. UI flows

The existing `/ops` shell stays; the nav gains items and the customer page is restructured
around what an agent actually needs in the first five seconds.

### 7.1 Customer 360 — information hierarchy

The current page leads with data tabs. It should lead with **why this person is on the phone**.
Proposed top-to-bottom order:

1. **Identity strip** — name, email, ID, member since, subscription/trial state, lifetime value.
   PII masked; an "unmask" control that demands a reason and writes `ops.pii.reveal`.
2. **Attention panel** (the new hero) — computed, not decorative: open escalations, failed
   payments in the last 30d, failed logins, denied actions, account flags, trial ending, open
   disputes. If it's empty, say "Nothing needs attention" — an honest empty state, consistent
   with how the Home KPI cards handle the flat case (PR #187).
3. **Action rail** — permission-gated buttons: Add note · Flag · Escalate · Issue credit ·
   Refund · Suspend. Buttons the agent lacks permission for are *absent*, not disabled-and-teasing.
4. **Tabs** — Overview · Financials · Activity · Notes · Audit. (Accounts/Transactions/Payments/
   Deals fold into Overview and Financials; four tabs of raw tables is a data browser, not a
   support tool.)

### 7.2 Key flows

- **Search → open record.** Every open writes `ops.customer.view` with `target_user_id`. No
  reason prompt on open — requiring one on every record open trains agents to type "support" a
  hundred times a day, which destroys the signal. Reasons are demanded where they carry weight:
  PII reveal and money movement.
- **Issue a refund.** Ledger context → amount + reason code + note (+ ticket) → below threshold
  executes, above threshold enters the approval queue with a visible "waiting on supervisor"
  state → executed entry appears in the ledger, linked to the adjustment, linked to the audit event.
- **Approve.** Supervisor queue → side-by-side request + customer's ledger history + the
  requesting agent's recent adjustment volume (context to approve *well*, not just fast) →
  approve/reject with a note.
- **Escalate.** Note + severity + assignee → lands in a queue → shows in the target customer's
  attention panel until resolved.
- **Audit tab.** Per-customer: every ops action on them, actor named, reason shown, before/after
  diffable, with a chain-verify badge on the segment.

### 7.3 Design language

Extend, don't restart — consistent with the standing rule that the whole app's design stays in
sync. Reuse `--tv-*` tokens, `.ops-*` shell classes, `.tv-table`, `.badge-*`, `.empty-state`, and
the existing card system. New pieces needed: `.ops-attention-*`, `.ops-ledger-*`,
`.ops-approval-*`, `.ops-diff-*`. All must work in light/dark/glass, since the tokens already do.

> Per the standing convention, any UI change here also updates the three design mockups
> (web + iOS + Android) — though note the ops portal is deliberately web-only, so the mockup
> update is likely "web only, no mobile surface", which should be stated explicitly rather than
> silently skipped.

---

## 8. Repo-specific gotchas this work will hit

Worth stating up front, because each of these has bitten before:

1. **Gateway `RouteLocator`.** A new top-level `/api/v1/ops/**` prefix returns 404 until it's
   added to the gateway's Java `RouteLocator` — this exact thing bit the CPA marketplace (fixed
   in PR #102).
2. **New service DB.** If any new per-service DB is introduced, adding it to
   `init-databases.sql` does **not** create it on the existing VM — that script runs only on
   first Postgres init. The service crash-loops and the gateway 500s until the DB is created
   manually. (This proposal avoids new services partly for this reason.)
3. **Web deploy needs a rebuild.** Ops portal changes are frontend changes: `deploy.sh` must run:
   a plain `up -d` is backend-only and leaves the UI stale. And a stale service-worker cache will
   make a correct deploy look broken.
4. **Audit ingest key.** The gateway posts to audit-service with `X-Internal-Key`. New ops
   semantic events must authenticate the same way or they'll be silently dropped —
   `AuditLoggingFilter` is deliberately fire-and-forget and swallows failures.
5. **`AuditLoggingFilter` skips `/api/v1/audit/**`** to avoid recursion. If ops audit-query
   endpoints live under that prefix, **ops queries of the audit log won't themselves be audited**
   — which compliance will eventually ask about. Put ops audit queries under `/api/v1/ops/audit/**`.

---

## 9. Open decisions

These change the architecture, so they're yours to make. My recommendation is first in each list.

| # | Decision | Options | Recommendation |
|---|---|---|---|
| 1 | **Ops identity** | (a) `ops_users` in auth-service + `typ=ops` token; (b) new `ops-identity-service`; (c) status quo (roles on customer) | **(a)** — real separation without a 12th service and a new Neon DB. (c) fails the requirement outright. |
| 2 | **Permission model** | (a) DB roles → permission strings, `perms` in JWT; (b) hardcoded role enum; (c) full policy engine (OPA/Cedar) | **(a)** — feature-level as required, retunable without deploy. (c) is real overkill at this size. |
| 3 | **Audit home** | (a) extend `audit_events` with actor/target/reason/diff; (b) separate `ops_audit` table + own chain | **(a)** — one chain, one `/verify`, cross-tier queries. |
| 4 | **Tamper-evidence** | (a) HMAC via secrets-service + daily signed checkpoints; (b) plain SHA-256 (today); (c) external WORM/QLDB | **(a)** — (b) doesn't survive an insider with DB write; (c) is a lot of infra for the current stage. |
| 5 | **Ledger home** | (a) `payment-service`; (b) new `ops-service`; (c) new `ledger-service` | **(a)** — it already owns Stripe and is the only service that moves money. |
| 6 | **Maker-checker threshold** | (a) auto-approve < $25; (b) approve everything; (c) approve > $100 | **(a)** — (b) will get routed around by busy agents, which is worse than a sane threshold. |
| 7 | **Ops portal delivery** | (a) phase it: keep `/ops` in the member SPA now, split to `ops.terravest.app` when financial powers land; (b) split immediately; (c) never split | **(a)** — once ops can issue refunds, a member-app XSS sharing an origin with an ops token is a genuine path to money. Same-origin is fine while ops is read-only; it isn't after §6 ships. |
| 8 | **Reason-for-access** | (a) reason on PII reveal + money only; (b) reason on every record open; (c) none | **(a)** — (b) produces a hundred "support" strings a day and destroys the signal it's meant to create. |

**Two I'd flag as genuinely arguable:** #7 (splitting the origin is real work and you may
reasonably want it done once, up front, rather than as a migration) and #6 (the threshold depends
on your actual refund distribution — worth checking the Stripe data before fixing a number).

---

## 10. Suggested phasing

Ordered so that each phase is independently shippable, and so that **no phase grants ops new
power over money before the controls that constrain that power exist**.

| Phase | Contents | Why here |
|---|---|---|
| ~~**1. Foundations**~~ ✅ **BUILT** | `ops_users` + separate login + MFA + `typ=ops` enforced both ways on all 12 services; V8 revokes CARE/ADMIN from customer rows; promotion path removed | Closes the live vulnerability. Nothing else should ship first. |
| ~~**2. RBAC**~~ ✅ **BUILT** | `OpsPermission` catalog + DB-editable roles (V9), `@PreAuthorize` per endpoint, permission checks across services, ops-admin + access-matrix screens | Everything downstream is gated on this. |
| ~~**3. Audit upgrade**~~ ✅ **BUILT** | actor/target/reason/diff columns (V5), semantic events, keyed HMAC chain + signed checkpoints (V6), "who touched customer X" query + Staff access tab | Must precede money powers, so the first refund is fully attributable. |
| **4. Customer 360 rework** — *partly built* | ✅ PII reveal w/ reason, Staff access tab, ops-admin screens · ⬜ attention panel, action rail, tab restructure, notes, escalation queue | Pure support value; no money surface. |
| **5. Financial layer** | ledger, adjustments + maker-checker, refunds/credits, approval queue, disputes | The controls from 1–3 are now in place. |
| **6. Anomalies + split** | anomaly rules + supervisor queue; split to `ops.terravest.app` (decision #7) | Ops now has money powers → the origin split stops being optional. |

Phases 1–3 are unglamorous and are where nearly all the risk lives. If timelines compress, cut
scope from 4 and 6 — not from 1–3.
