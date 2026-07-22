# Shared Household — Design Doc (for review, no code yet)

> **Status:** APPROVED — decisions taken (phased approach, owner-pays, one household per user,
> partner has their own login, copyable invite link). **3a backend is implemented.**
> **Phase:** 3 (reach/moat layer)

**Implementation notes (3a, backend):**
- `auth-service` `V14__household.sql` + `Household` / `HouseholdMember` / `HouseholdInvite`,
  `HouseholdService` (the single `requireActiveMember` rule) and `HouseholdController`.
- Gateway `RouteLocator` entry added for `/api/v1/household/**` (without it every call 404s).
- **11 authorization tests**, incl. the cross-household leak test, immediate revocation,
  single-use / expiring / email-bound invites, and "raw token is never stored".
- ⚠️ The one-household-per-user rule is enforced in **service code only**. A partial unique
  index (`WHERE status = 'ACTIVE'`) is PostgreSQL-only and broke every `@SpringBootTest` when
  Flyway ran it against H2 in tests. Harden later via vendor-specific Flyway locations.
- **Owner-pays** is implemented as: *creating* a household requires `individual.household`
  (Plus); joining and participating never do — otherwise an invited Free member couldn't see
  the household they joined. Server-side enforcement of the create-gate is still TODO
  (currently UI-gated), and must land before the feature flag is enabled.

---

## 1. Why this matters

Shared finances is the single biggest TAM unlock in the expansion: it takes the product
from "one person's tool" to "our household's tool", and it's a genuine differentiator —
few tools do personal + business + rental **and** multiplayer. It's also the feature most
likely to cause a catastrophic bug, so it gets a design doc before code.

**The failure we are designing against:** one household seeing another household's money.
In a finance app that is not a bug, it's an incident. Everything below optimizes for
*making that impossible by construction* rather than by careful coding.

---

## 2. Current state (verified in the code, not assumed)

| Fact | Evidence |
|---|---|
| The JWT **subject is the user id**. Member tokens carry no other identity claim (`perms`/`typ` exist for ops tokens only). | `auth-service` `JwtService.createToken(...).setSubject(userName)` |
| Every service derives identity the same way: `Long.valueOf(authentication.getName())`. | e.g. `AggregationController.getUserId()` |
| Authorization is **implicit**: repositories query `WHERE user_id = :me`. There is no shared authorization layer to change in one place. | per-service repositories |
| Data is spread across **per-service databases**, with ~**59 `user_id` columns across 10 services**. | migration scan |

**`user_id` column count by service** (the blast radius of any "share everything" approach):

| Service | user_id cols | Notable tables |
|---|---:|---|
| business-financials | 14 | business_transactions, invoices, goals, budgets… |
| financial-core | 13 | goals, budgets, debts, net_worth_snapshots, tax_*, cpa_* |
| real-estate | 8 | properties, property_expenses, deals, holdings |
| account-aggregation | 6 | accounts, transactions, holdings, plaid_items |
| payment | 5 | user_subscription, bill_pay_intents, ledger_entries |
| notification | 4 | notifications, preferences, device_token |
| auth | 4 | users, user_roles, deletion tasks |
| documents | 2 | documents, doc_folders |
| ai-insights / audit | 1 each | insights / audit_events |

**Implication:** any design that changes what `WHERE user_id = :me` means must be audited
across ~10 services and dozens of queries. **Missing one query = a leak or missing data.**
That is the crux of the options below.

---

## 3. Goals / non-goals

**Goals (v1)**
- Two+ people can act as one household: a joint view of agreed-upon money.
- Shared **goals** and **bills**, with "who paid what".
- Invite / accept / revoke, with immediate effect on access.
- Members keep private things private **by default**.

**Non-goals (v1)**
- Sharing business entities, rental properties, or tax data (the wedge stays single-owner).
- Granular per-field permissions.
- More than one household per user.
- Merging two existing users' historical data.

**Guiding principle:** *default private, explicitly shared.* Nothing becomes visible to a
partner because a household exists — only because someone shared it.

---

## 4. Options considered

### Option A — Household-aware identity ("visible user ids")
Resolve a member's household and replace `user_id = :me` with `user_id IN (:visibleIds)`
everywhere (via a JWT `hid` claim or a per-request lookup).

- ➕ One conceptual change; "everything is shared" works instantly.
- ➖ **Touches ~59 columns / every query in 10 services.** One missed query leaks.
- ➖ Violates *default private* — a partner would see everything, including things people
  genuinely don't share (a gift, a personal therapist payment).
- ➖ Irreversible-feeling: hard to "unshare" cleanly.
- **Verdict: rejected for v1.** Highest risk, worst privacy default.

### Option B — Denormalized `household_id` on every shareable table
Add `household_id` alongside `user_id`, backfill, and filter on it.

- ➕ Efficient queries; clear ownership column.
- ➖ Migration + backfill across 10 services; same "audit every query" burden as A.
- ➖ Two sources of truth for ownership (`user_id` *and* `household_id`) invites drift.
- **Verdict: rejected for v1.** Same blast radius as A, plus migration risk.

### Option C — Explicit share registry (additive read path)
A `household_share` registry records "user X shared resource R with household H".
Existing queries are **never modified**; a *separate*, additive endpoint resolves
"things shared with me".

- ➕ **Existing per-user queries are untouched → existing data cannot start leaking.**
- ➕ Matches a pattern already in this codebase (documents-service's cross-app registry +
  secure-share model with expiry/revocation/access logging).
- ➖ Two read paths to maintain (mine vs shared-with-me).
- ➖ Joint views require fan-out/aggregation work.
- **Verdict: the right mechanism for sharing *existing* personal data — but see D.**

### Option D — Household-owned entities (new, co-owned objects)
Shared goals and shared bills are **new entities owned by the household**, not shared views
of personal ones. `household_goal`, `household_bill`, `household_contribution`.

- ➕ **Zero interaction with existing `user_id` scoping** — nothing existing can leak.
- ➕ Delivers the actual product value people want ("our house fund", "who paid rent").
- ➕ Simple, obviously-correct authorization: *are you a member of this household?*
- ➖ Doesn't give a joint view of personal accounts (that needs C).
- **Verdict: recommended first slice.**

---

## 5. Recommendation

**Phase it. Ship value before touching any existing scoping.**

| Slice | What ships | Touches existing scoping? | Risk |
|---|---|---|---|
| **3a — Household & membership** | Create household, invite, accept, leave, revoke. **No data sharing at all.** | No | Low |
| **3b — Household-owned goals & bills** (Option D) | Shared goals, shared bills, contributions, who-paid-what | No | Low |
| **3c — Opt-in sharing of personal accounts** (Option C) | "Share this account with my household", read-only joint net worth | Additive read path only | Medium |
| **3d — Joint views / roll-ups** | Combined household net worth & cash flow | Read-only fan-out | Medium |

**We can stop after 3b and still have a genuinely multiplayer product.** 3c/3d are only worth
doing once 3a/3b prove people actually invite someone.

---

## 6. Proposed data model (3a + 3b)

Owned by **auth-service** (it already owns identity and invitations/OTP):

```
household
  id, name, created_by_user_id, created_at

household_member
  id, household_id, user_id, role ('OWNER'|'MEMBER'), status ('ACTIVE'|'LEFT'|'REMOVED'),
  joined_at, left_at
  UNIQUE (household_id, user_id)
  -- v1 constraint: a user may have at most ONE active membership

household_invite
  id, household_id, invited_email, token_hash, invited_by_user_id,
  status ('PENDING'|'ACCEPTED'|'REVOKED'|'EXPIRED'), expires_at, accepted_at, accepted_user_id
  -- token is single-use, hashed at rest, short TTL (7d)
```

Household-owned money objects (3b) live in **financial-core** (it already owns goals):

```
household_goal          id, household_id, name, target_amount, target_date, created_by_user_id
household_goal_contribution  id, household_goal_id, user_id, amount, occurred_on, note
household_bill          id, household_id, name, amount, cadence, due_day, split_type, created_by
household_bill_payment  id, household_bill_id, paid_by_user_id, amount, paid_on
```

**Authorization rule (single, testable):** *every* household read/write resolves to
`isActiveMember(currentUserId, householdId)`. One helper, one place, one test suite — as
opposed to Option A's "audit 59 columns".

---

## 7. API surface (sketch)

```
POST   /api/v1/household                 create (creator becomes OWNER)
GET    /api/v1/household/me              my household + members
POST   /api/v1/household/invites         { email }  → emails a single-use link
POST   /api/v1/household/invites/accept  { token }  → joins
DELETE /api/v1/household/invites/{id}    revoke a pending invite
DELETE /api/v1/household/members/{userId} remove a member (OWNER only)
POST   /api/v1/household/leave           leave (OWNER must transfer first)

GET/POST /api/v1/household/goals         household-owned goals
POST   /api/v1/household/goals/{id}/contributions
GET/POST /api/v1/household/bills
POST   /api/v1/household/bills/{id}/payments
```

Gateway note: `/api/v1/household/**` is a **new top-level prefix** — per the known gotcha it
must be added to the gateway's Java `RouteLocator` or it 404s.

---

## 8. Security, privacy & lifecycle requirements

These are requirements, not nice-to-haves:

1. **Default private.** Creating/joining a household grants access to *household-owned*
   objects only. No personal account, transaction, goal, property or business row becomes
   visible.
2. **Immediate revocation.** Removal/leaving flips membership to inactive; the very next
   request loses access (no token-cached household id that outlives revocation → **do not
   put `household_id` in the JWT**; resolve per request).
3. **Invites are capability tokens.** Single-use, hashed at rest, 7-day TTL, bound to the
   invited email, revocable. (Mirrors the documents-service secure-share model.)
4. **Audit every membership change** — create/invite/accept/remove/leave — via audit-service,
   which already keeps an HMAC-chained trail with actor + target + reason.
5. **Export & delete.** A user's export must include their contributions; deleting a user
   must not delete household objects others still depend on — reassign or tombstone.
6. **Notifications** must respect per-user preferences (notification-service), not blast the
   household.
7. **No cross-household reads, ever.** Enforced by the single membership check + tests.

---

## 9. Billing / entitlements

`individual.household` is already seeded as a **Plus+** feature (payment-service V6), and the
Free floor does not include it — so gating works today via `hasFeature('individual.household')`.

**Unresolved product decision:** when the OWNER has Plus, do members inherit entitlements?
- *Owner-pays* (recommended): members get household features free; simplest, best growth —
  the household becomes a reason to upgrade.
- *Everyone-pays*: more revenue per household, much worse invite conversion.

This changes `getEntitlements()` (which today resolves from a single `user_subscription`),
so it must be settled before 3a lands.

---

## 10. Open questions (need your decision)

1. **Scope of v1 sharing** — do we stop at household-owned goals & bills (3a+3b), or is a
   joint view of personal accounts (3c) required to feel worthwhile?
2. **Entitlement inheritance** — owner-pays or everyone-pays? (§9)
3. **One household per user** — acceptable for v1? (Simplifies everything; revisit later.)
4. **Invite channel** — email only (SendGrid domain auth is still pending per go-live notes),
   or also a copyable link?
5. **Does a partner need their own login?** Assumed yes (invite → their own account). The
   alternative (a read-only sub-profile) is a very different design.

---

## 11. Rollout & testing

- Behind a config flag (`household.enabled`) + the existing `requiredFlags` nav mechanism, so
  the module can ship dark and be enabled per environment.
- **Tests that must exist before enabling:** a non-member cannot read/write any household
  object (the leak test); a removed member loses access on the next request; an invite cannot
  be replayed or used by a different email; a household object survives a member's deletion.
- New DB tables mean the **per-service DB must exist** — note the known gotcha that adding a
  DB to `init-databases.sql` does *not* create it on an existing VM.
- Design mockups (web + iOS + Android) and `SCREEN_FEATURE_INVENTORY.md` updated in the same
  change, per `DESIGN_SYNC.md`.

---

## 12. What I'd build first (if approved)

1. `household` + `household_member` + `household_invite` in auth-service, with the single
   `isActiveMember` authorization helper and its test suite.
2. Gateway `RouteLocator` entry for `/api/v1/household/**`.
3. A **Shared** nav section with one screen: create/invite/members.
4. Only then: household goals & bills.

No existing query is modified in any of the above.
