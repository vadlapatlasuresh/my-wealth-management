# TerraVest Ops Portal — Design Spec (for review)

_Status: **PARTLY BUILT** · drafted 2026-06-07 · identity model superseded 2026-07-16_

> **Read this first.** The portal shell, customer search, and the 360 read-only tabs described
> below are built. **§2 (agent login) is superseded**: ops staff are no longer customers with a
> CARE/ADMIN role — they are separate accounts in `ops_users` with their own login and a `typ=ops`
> token that member routes refuse. The reason is in
> [`DOCUMENTATION/proposals/ops-portal.md`](../../DOCUMENTATION/proposals/ops-portal.md), which is
> now the live plan (RBAC, audit actor/target, financial ledger, phasing). This file remains the
> reference for the UX flows and the mockup.

A dedicated **support / help-desk portal**, separate from the member app, where a customer-care
agent signs in, looks up a customer (by name / email / phone), sees **everything the customer
sees** (read-only), spots what went wrong, and helps — with **every step audited**. Built to plug
into **IVR and chatbots** later.

> **Interactive mockup:** [`assets/terravest-ops-portal.html`](../../assets/terravest-ops-portal.html)
> — open in a browser. (The simpler embedded version is
> [`assets/terravest-customer-care.html`](../../assets/terravest-customer-care.html).)
> This doc is the architecture/flow spec behind that mockup. **Nothing here is built yet** — it's
> for you to review and mark up; I'll implement after sign-off.

---

## 1. Why a separate portal (not the member app page)
The Deal-Room/Customer-Care page lives _inside_ the member SPA today. For a real help desk we want:
- **Separate URL** (e.g. `ops.terravest.app`) so it can be firewalled / IP-allowlisted, has its own
  login, and never ships agent tooling to members.
- **CARE/ADMIN-only** at the door — a normal user hitting the URL is bounced.
- Its own UX optimized for "a caller is on the line," not for managing your own money.

**Two build options (pick one at review):**
| | A. Separate route in the same app | B. Separate SPA / deployment |
|---|---|---|
| URL | `app.terravest.app/ops` (guarded route) | `ops.terravest.app` (own build) |
| Effort | Low — reuse components | Higher — new bundle + pipeline |
| Isolation | Logical only | Network + bundle isolation |
| Recommendation | **Start with A**, graduate to B | when volume/compliance needs it |

---

## 2. Agent login & session — ⚠️ SUPERSEDED (built differently)
The original plan was to reuse a customer account and gate on `role ∈ {CARE, ADMIN}`. That was
built and has since been **replaced**, because it did not actually separate ops from members: the
JWT secret is shared platform-wide, so an agent's token was a fully valid *member* token on every
service. The role check on `/api/v1/support/**` was the only thing standing in the way.

**As built (2026-07-16):**
- Ops accounts live in their own `ops_users` table. **No promotion path** from a customer account.
- Own login: `POST /api/v1/ops/auth/login` → MFA → `POST /api/v1/ops/auth/mfa/verify` → token.
  MFA is **not** switchable off for ops, and ops OTP dev-code exposure is its own flag
  (`OPS_OTP_EXPOSE_DEV_CODE`), never the member one.
- Tokens carry `typ=ops` + `OPS_*` roles, TTL 60 min. **Every service** refuses a `typ=ops` token
  off its ops surface, and a member token on it (`OpsTokens` + `JwtAuthFilter`, per service).
- First admin: `OPS_BOOTSTRAP_EMAIL` + `OPS_BOOTSTRAP_PASSWORD` (replaces `SUPPORT_BOOTSTRAP_EMAIL`).
- `POST /api/v1/support/users/{id}/roles` and the **Roles & Access** tab are **removed** — granting
  staff roles onto a customer row was the vulnerability. Ops-account management is Phase 2.

## 3. Customer search (name / email / phone)
Today's `GET /api/v1/support/users?query=` matches **email or name only**. To support the requested
fields we extend it:
- Add **phone** and **first/last** matching → `?first=&last=&email=&phone=&query=` (any combination,
  AND-ed). Normalize phone to digits before comparison.
- Keep paging + "recent users when blank."
- Results show name · email · phone · roles, with a **View** action.

## 4. Customer 360 — "see what the customer sees" (read-only)
This is the core new capability. The member data endpoints derive the user from the **caller's JWT**,
so an agent can't see a customer's data through them. We add **read-only, CARE/ADMIN-gated, audited
support-proxy endpoints** that take an explicit `{id}`:

| Tab | New support endpoint | Proxies to |
|---|---|---|
| Overview (net worth) | `GET /api/v1/support/users/{id}/snapshot` | financial-core |
| Accounts | `GET /api/v1/support/users/{id}/accounts` | account-aggregation |
| Transactions | `GET /api/v1/support/users/{id}/transactions` | account-aggregation |
| Budget & Goals | `GET /api/v1/support/users/{id}/planning` | financial-core |
| Deal Room | `GET /api/v1/support/users/{id}/deals` | real-estate |
| Payments | `GET /api/v1/support/users/{id}/payments` | payment |
| Activity & Issues | `GET /api/v1/support/users/{id}/activity` _(exists)_ | audit |
| Profile + Roles | `GET /api/v1/support/users/{id}` _(exists)_ | auth |

**Hard rules:**
- **Read-only.** No support endpoint can move money, create deals, or change member data. Agents
  **view**; they never act _as_ the customer.
- Each proxy is gated to CARE/ADMIN and **records an audit event** (who viewed whose what).
- Sensitive fields stay masked (SSN/EIN last-4 only, account numbers `••1234`).
- A persistent **"Viewing X — READ-ONLY"** banner makes the mode obvious.

> Implementation note: the cleanest pattern is a thin **support-proxy** in each service that trusts
> an internal `X-Support-Actor` header from the gateway (same trust model as the existing
> `X-Internal-Key` calls), so member controllers stay untouched.

## 5. Issue-first help desk
The Overview leads with an **Issue Spotlight**: the customer's most recent failed/denied action
(service, status, time, IP) so the agent instantly sees "why they called." Already shipped on the
in-app page; the portal reuses it. Source: audit-service `onlyIssues=true`.

## 6. Agent audit trail — "what the agent did, step by step"
Two layers, both already partly in place:
1. **Automatic** — the gateway's `AuditLoggingFilter` records every agent request (who, path,
   status, time, IP). Sensitive support views are captured here.
2. **Explicit** — high-value actions log a typed event (e.g. `support.role.grant`,
   `support.customer.view`, `support.session.start`) attributed to the agent.

The portal surfaces this as a live **"Agent session log"** rail (see mockup) and, for supervisors, a
per-agent timeline:
```
GET /api/v1/audit/agent/{agentId}?from=&to=   → [ {at, action, targetUserId, status, ip} ]
```
Captured per step: **signed in → searched (terms) → opened customer #X → viewed Accounts →
viewed Transactions → granted CARE to #X → signed out.** Retention follows the compliance window;
audit rows are immutable and survive account deletion.

## 7. IVR & chatbot integration (later — designed for now)
The portal is built with integration seams so these drop in without a redesign:
- **IVR screen-pop:** an inbound webhook (`POST /api/v1/support/ivr/context`) carries the verified
  caller's phone + reason code; the portal auto-searches by phone and opens the match ("Open matched
  customer" in the mockup). Caller-verified status is shown so the agent skips re-verification.
- **Chatbot handoff:** when a bot escalates, it posts the **transcript + customer ref** to
  `POST /api/v1/support/chat/handoff`; the portal shows the transcript inline and links the session.
- **Outbound context:** agent actions can emit events the bot/IVR consumes (e.g. "issue resolved").
- All integration calls are authenticated service-to-service and audited like everything else.

These are **stubs in the mockup** (the IVR + chatbot panels on the right) — no vendor chosen yet.

## 8. Rollout (proposed)
1. **P0** — extend search (phone + first/last) + the read-only proxy endpoints + portal route (option A)
   + agent session log. _This delivers the whole "pull up a caller and see their data" flow._
2. **P1** — MFA for agents, idle auto-logout, supervisor per-agent audit view.
3. **P2** — IVR screen-pop + chatbot handoff; separate `ops.` deployment (option B).

## 9. Open questions for you to mark up
1. Separate **route (A)** to start, or go straight to a separate **`ops.` deployment (B)**?
2. Should agents see **full financial values**, or **masked/ranged** amounts (e.g. "~$120k") for
   privacy? (We can gate full values behind a "reveal — audited" click.)
3. Which data tabs are **must-have v1** vs later? (Accounts/Transactions/Payments seem core;
   Deals/Budget maybe later.)
4. **MFA** for agents now or P1?
5. Any **IVR/telephony or chatbot vendor** already in mind (so the webhook contracts match)?
6. Do supervisors need a **live "who's viewing whom" board**, or is the after-the-fact audit enough?

---
_Reply with edits inline (or tell me) and I'll update this spec + the mockup, then implement the
agreed P0._
