# Ops Access Control & Audit — Reference

**Status:** BUILT (2026-07-16) · Phases 2 & 3 of [`ops-portal.md`](ops-portal.md)
**Audience:** whoever is asked "who can see this?" or "who looked at this customer?"

This is the reference for **what ops staff can access, who has that access, and what gets recorded**.
The proposal explains *why*; this describes *what is true now*.

---

## 1. The two questions this answers

| Question | Where the answer lives |
|---|---|
| "Who can see customer PII?" | The access matrix (§3) — or the **Ops Accounts → Access matrix** screen, which reads the live DB |
| "Who looked at customer 42, and why?" | `GET /api/v1/ops/audit/target/42` — or the **Staff access** tab on the customer's record |
| "What has agent Dana been doing?" | `GET /api/v1/ops/audit/actor/{opsUserId}` — includes `distinctTargets`, the access-review signal |
| "Has the trail been tampered with?" | `GET /api/v1/audit/verify` — chain + checkpoints, both must hold |

---

## 2. How access is decided

**Permissions are the unit of enforcement. Roles are just named bundles of them.**

```
ops_user ──has──> role(s) ──grant──> permission(s) ──checked by──> @PreAuthorize on the endpoint
   (ops_users)   (ops_user_roles)   (ops_role_permissions)         (or an explicit perms check)
```

- **Permissions are code** (`OpsPermission` enum). A key that no endpoint checks would grant nothing
  while looking like a control on an access review, so the enum only contains what is enforced. V9
  seeds the same keys into `ops_permissions` for the UI to describe.
- **Roles are data** (`ops_roles` + `ops_role_permissions`). The matrix is retunable from the ops-admin
  screen without a deploy — the same pattern payment-service uses for its plan catalog.
- **Resolution happens at login.** The token carries `perms`, so a retune reaches an agent on their
  **next sign-in**. The 60-minute ops TTL is what bounds that window. (If that ever proves too long,
  resolve per-request — don't lengthen the token.)

**Three layers, and only one of them is the boundary:**

| Layer | What it does | Is it the security boundary? |
|---|---|---|
| `typ=ops` token check (every service) | An ops token works only on the ops surface; a member token only off it | Yes — Phase 1 |
| `@PreAuthorize("hasAuthority('…')")` | Per-endpoint permission check | **Yes — this is it** |
| UI gating (`hasOpsPermission`) | Hides what you can't do | No. Convenience only |

> ⚠️ `@PreAuthorize` is inert without `@EnableMethodSecurity` — with it removed, every authenticated
> ops user silently passes every check and nothing else fails. `OpsRbacTests` exists to catch that.

---

## 3. The access matrix (as seeded by V9)

| Permission | Agent | Supervisor | Finance | Compliance | Admin |
|---|:---:|:---:|:---:|:---:|:---:|
| `customer.search` — find customers | ✅ | ✅ | ✅ | ✅ | ✅ |
| `customer.view` — open a record | ✅ | ✅ | ✅ | ✅ | ✅ |
| `customer.data.view` — accounts, transactions, payments, deals | ✅ | ✅ | ✅ | ✅ | ✅ |
| `customer.pii.reveal` — unmask SSN/EIN last-4 | — | ✅ | — | ✅ | ✅ |
| `audit.query` — who accessed whom | — | ✅ | — | ✅ | ✅ |
| `ops.analytics.view` — operator KPIs + health | — | ✅ | — | ✅ | ✅ |
| `cpa.moderate` — approve/reject CPA listings | — | ✅ | — | — | ✅ |
| `ops.user.manage` — ops accounts + roles | — | — | — | — | ✅ |

**The reasoning behind the gaps:**

- **Agents don't get `customer.pii.reveal`.** The common case — "why did my payment fail?" — never
  needs an SSN. Making it ambient turns every glance into an unrecorded PII access; making it a
  supervisor action with a written reason means the trail can answer "who looked, and why", and the
  answer is usually "nobody".
- **Compliance holds no `*.manage` / `*.moderate` key.** Read-only by construction, not by convention.
- **Finance looks thin, honestly.** There is no money surface to gate yet — the ledger, refunds and
  disputes are Phase 5. Those add `finance.*` keys **with** the endpoints that honour them, and
  deliberately **not** `finance.adjustment.approve` for Finance: the maker cannot be the checker.

**Two guardrails on editing the matrix:**
1. An unknown permission key is rejected (400) — you can't build a role from a key nothing checks.
2. Removing the last grant of `ops.user.manage` is refused (409) — it would lock everyone out of
   role administration with no way back short of a DB edit.

### What ops staff **cannot** reach, by design

| Surface | Why |
|---|---|
| A customer's **documents** | documents-service has no ops surface — an ops token is refused on every route there |
| The **encryption keys** (secrets-service `/admin/**`) | Not gateway-exposed, and its ops-path list is empty on purpose. The ops portal must never be a path to the KEK |
| **Acting as a customer** | Every ops route is read-only over member data. Ops staff view; they never act *as* the customer |
| **Full SSN/EIN** | Encrypted at rest; no ops route returns more than the last 4 |

---

## 4. What gets recorded

**Two tiers, one chain.**

| Tier | Written by | Grain | Answers |
|---|---|---|---|
| Request capture | gateway `AuditLoggingFilter` | Every HTTP request | "was anything missed?" — the floor |
| Semantic events | the handlers (`AuditClient.recordOps`) | `ops.customer.view`, `ops.pii.reveal`, `ops.user.create`, `ops.role.permissions.update` | "what changed, and why" |

The gateway can only ever say *"ops user 7 did GET /api/v1/support/users/42"*. It cannot say why, or
what changed. Both tiers land in the same `audit_events` table and the same hash chain — one
`/verify`, one integrity story, cross-tier queries.

### The schema that makes it queryable

`user_id` used to be the only identity column, and it holds the **actor**. So "who touched customer
42" meant a `LIKE` scan over URL paths. V5 added:

| Column | Meaning |
|---|---|
| `actor_kind` | MEMBER / OPS / SYSTEM / ANONYMOUS |
| `actor_id` | ops_users id when OPS |
| **`target_user_id`** | **the customer acted upon** — indexed; this is the whole point |
| `reason` | the actor's stated justification |
| `before_json` / `after_json` | what changed |
| `hash_version` | 1 = legacy unkeyed SHA-256, 2 = keyed HMAC |

> **History is honestly incomplete.** `target_user_id` was **not** backfilled. It could have been
> guessed by regexing old URL paths, but a guessed access record reads as fact in an audit. The trail
> is authoritative from this deploy forward.

### Tamper-evidence: three layers

1. **Hash chain** — each row's hash covers the previous row's, so editing any past row breaks every
   later hash.
2. **Keyed (HMAC)** — the original chain was unkeyed SHA-256, which only catches a careless `UPDATE`:
   anyone who could write to auditdb could rewrite a row *and* recompute every later hash, and
   `/verify` would report "valid". Keying it means forging history needs DB write access **and**
   `AUDIT_CHAIN_KEY`, which isn't in the DB. The `reason`/`target` columns are inside the digest —
   a trail whose "who, and why" can be edited freely isn't a trail.
3. **Signed checkpoints** — HMAC still loses to someone holding *both*. A daily checkpoint pins the
   chain head and is emitted to the service log (`AUDIT-ANCHOR`), which ships off-box. Rewriting
   history then means also rewriting every published copy. `AuditChainIntegrityTest` performs each
   of these attacks and asserts they're caught.

### ⚠️ The v1 chain never actually verified in production

Found while building this, by a test that only fails on Linux:

`created_at` is part of the hashed content, but the store keeps **microseconds** (Postgres
`timestamp`; H2 the same). `LocalDateTime.now()` returns **nanoseconds on Linux** and only
microseconds on macOS. So every row written in production hashed a nanosecond timestamp, the
database rounded it away on write, and the hash could never be recomputed from the row's own
persisted fields. `/api/v1/audit/verify` would have reported **"hash mismatch"** on a completely
untouched log — indistinguishable from tampering.

It never showed up locally because it **cannot reproduce on a Mac**. `AuditChainService.append`
now truncates to microseconds before hashing, and
`aChainWrittenWithNanosecondTimestampsStillVerifies` supplies the nanoseconds explicitly rather
than trusting the platform clock — otherwise the test passes on a laptop while the bug is live.

**What this means for existing rows:** every pre-fix v1 row is unverifiable and always was. The
chain is trustworthy from this deploy forward. Don't read a v1 failure as evidence of tampering.

**Known limits, stated plainly:**
- The log line is a real anchor only because logs are retained separately. A GCS bucket with object
  versioning or a WORM store is strictly stronger and drops into `AuditCheckpointService.publish`.
- `append()` is `synchronized` — correct for one audit-service instance, silently wrong at two. Move
  to a DB advisory lock before scaling it, not after.
- Rotating `AUDIT_CHAIN_KEY` invalidates every existing row's verification. Treat it as append-only.

---

## 5. Operational notes

**Required env (audit-service will not start in prod without it):**
```
AUDIT_CHAIN_KEY=<openssl rand -hex 32>     # signs history — NOT AUDIT_INGEST_KEY, which authenticates callers
```

**Reading the audit log is itself audited.** The ops query endpoints live under `/api/v1/ops/audit/**`,
not `/api/v1/audit/**` — the gateway skips the latter to avoid recursively auditing its own ingest,
which would make "who read the audit log" invisible.

**An unavailable trail is never rendered as "no access".** `/ops/audit/target/{id}` returns **503** if
audit-service is unreachable, and the UI says so. "Nobody accessed this customer" and "the audit
service is down" must never look the same to someone doing a review.
