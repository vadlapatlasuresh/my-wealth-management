# Proposal: Caller Verification & Tiered Disclosure

**Status:** **Phase A BUILT (2026-07-17)** — sessions + tiered disclosure gate + OTP + KBA + suspicious-freeze + timeline. Phases B–D (step-up, contact-change hardening, edge cohorts) open.
**Area:** New verification layer in `auth-service` + the ops 360 view (`apps/web`), extends the audit trail
**Builds on:** the ops portal (identity, RBAC, audit, financial layer — proposals `ops-portal.md`,
`ops-access-and-audit.md`)

> **As built (Phase A):** `auth-service` migration **V12** (`ops_verification_sessions`,
> `ops_verification_attempts`, DB-editable `ops_disclosure_tiers`); `CallerVerificationService` +
> `CallerVerificationController` (`/api/v1/ops/verify/**`); the disclosure gate wired into PII
> reveal (`requireTierFor` — a supervisor with `customer.pii.reveal` is 403'd until the caller is
> verified); OTP-to-registered (→T2) and dynamic KBA (→T1, never asks for SSN); the
> "can't verify" freeze; verification events on the keyed audit chain; and the
> `components/CallerVerification.jsx` banner on the 360 view (tier-coloured, resets per call,
> gates the PII reveal button). Decisions 1/2/3/4 taken as recommended; tier→action mapping is
> DB-editable per decision 2's "adjust after seeing it built". **Verified end-to-end** against
> running services; 5 dedicated tests + the RBAC suite updated. Phases B–D below remain.

---

## 1. The hole this closes

Today, the moment an agent opens a customer record they see everything the customer's tier and the
agent's permissions allow — balances, transactions, PII-reveal button, the lot. **Nothing has
established that the person on the phone is actually that customer.**

That is the single largest risk in any support tool, and it is not a hypothetical:

> "Hi, I'm locked out of my account. Yeah, it's John Smith… I don't have my phone on me, can you
> just read me my recent transactions so I can confirm it's me?"

An agent who is trying to be helpful reads out enough for the caller to pass verification *at the
next company they call*. This is how account-takeover chains start, and support desks are the soft
entry point. **Permissions gate what the AGENT may do. Nothing gates what the CALLER has proven.**
Both need to be true before a single account fact is disclosed.

The guiding principle: **verification is earned per call, it is tiered, and every disclosure is
recorded against the level the caller reached.** An agent should have to work slightly harder to
leak data than to help — and the system should make the safe path the easy one.

---

## 2. The core model: verify the caller, then gate disclosure by tier

Two ideas, and the second is the architecturally important one.

### 2a. Verification is a per-call session, not a flag on the customer

When an agent opens a record, a **verification session** is created — scoped to `(agent, customer,
timestamp)` and time-boxed to the length of a call (default 30 min). It starts at **Tier 0** and the
agent raises it by running a verification method. It is:

- **Ephemeral** — it expires; the next call starts cold. A caller verified yesterday is not verified
  today.
- **Attributed** — recorded in the audit trail: who verified whom, how, to what tier, and every
  fact disclosed under it.
- **Not a customer property** — verifying a caller does not mark the *account* as trusted; it marks
  *this conversation*.

### 2b. Disclosure is tiered — verification is NOT binary

This is the senior-architect call. "Verified / not verified" is too blunt: confirming a date of
birth should not unlock a wire transfer. Every field and action carries a **minimum disclosure
tier**, and the UI reveals or blocks accordingly.

| Tier | What the caller has proven | What the agent may disclose / do |
|---|---|---|
| **T0 — Unverified** | Nothing | That an account exists; the attention panel (why they're calling, in generic terms); generic help ("I can email a reset link to the address on file") — but **never read anything back** |
| **T1 — Identity** (KBA / one factor) | Knows account-holder facts | Account *status* (plan, is a payment failing, is it locked), non-sensitive settings, open case summaries |
| **T2 — Possession** (OTP to registered device) | Controls the registered email/phone | Balances, transactions, PII last-4, subscription/billing detail; can make routine changes |
| **T3 — Step-up** (fresh challenge, per action) | Re-proved possession *now* | High-risk actions: full PII, **changing contact info**, money movement, closing the account |

Two rules make this real:

1. **Agent permission AND caller tier must both pass.** A supervisor holding `customer.pii.reveal`
   still cannot reveal PII to a T1 caller — the reveal button is *present but gated on the tier*,
   and clicking it prompts "verify the caller to Tier 3 first." The existing permission model is
   untouched; this sits in front of it.
2. **T3 is per-action and fresh.** The classic account-takeover move is "verify with a stolen OTP,
   then change the email so all future codes come to the attacker." So **changing contact info is
   T3, and a contact-info change re-notifies the OLD channel** — a fraudster who controls the new
   phone still can't silence the alert to the real owner.

---

## 3. Verification methods (what raises the tier)

All reuse primitives that already exist — `OtpService.generateFor/verifyFor`, notification-service
delivery, and the customer data on the `users` row.

| Method | Tier it grants | How | Notes |
|---|---|---|---|
| **OTP to registered device** | **T2** (T3 when re-run for a step-up) | Agent clicks "Send code"; a one-time code goes to the customer's **registered** email/SMS; caller reads it back | Strongest, lowest-friction. Proves possession of a channel we already trust. The code goes to the channel on file, **never to a channel the caller supplies on the call.** |
| **Dynamic KBA** | **T1** | System generates questions from real account data: DOB, address on file, last-4 SSN/EIN, most-recent transaction amount, most-recent linked institution, plan name | "Dynamic" (from live data) beats static security questions. Agent sees the expected answer masked and marks pass/fail — they never read the answer out. |
| **Security passphrase** | **T1** | If the customer set one, they say it | Optional; opt-in during onboarding (future) |
| **Callback to registered number** | **T2** | For "I can't get the OTP" — agent ends the call and rings the number **on file**, not one supplied | Defeats the "I've lost my phone, call me on this other number" attack |

**Deliberately NOT accepted as verification:** anything the caller can look up or that we already
showed them. Reading the account number off a statement proves they have a statement, not that they
are the owner. Full SSN is never *asked* — we only ever confirm the last 4, and only as one factor.

---

## 4. Scenarios (the senior-PM enumeration)

A support flow is defined by its edge cases. These are the ones the design has to answer, not just
the happy path.

| # | Scenario | Designed behaviour |
|---|---|---|
| 1 | **Happy path** | Open record (T0) → send OTP → caller reads it back (T2) → agent helps. One click, ~20s. |
| 2 | **Caller can't receive the OTP** (lost/changed phone) | Fall back to KBA for T1 (limited help), and offer **callback to the number on file** for T2. Updating the contact channel is itself T3 and re-notifies the old channel — see #7. |
| 3 | **Verification fails** | Agent cannot disclose. Offer self-service ("I'll email a reset link to the address on file") or a callback. **Every failed attempt is audited.** N failures in a window (default 3) raises a fraud flag on the account and locks further attempts for a cooldown. |
| 4 | **Suspected social engineering** | A **"Can't verify / suspicious"** button: freezes disclosure for the session, drops it to T0, raises a HIGH fraud escalation, and records the agent's note. The agent never has to argue with the caller — the tool makes "no" the safe default. |
| 5 | **Authorized third party** (spouse, accountant, POA) | Separate consent model: the account holder pre-authorizes a named representative with a scope (e.g. "billing only"). The rep verifies as *themselves* against *their* authorization, and the tier caps at the granted scope. **Not built in phase 1** — flagged so the schema leaves room. |
| 6 | **Deceased / estate** | A locked state: no verification path discloses to a caller; routes to a specialist queue with a document-upload requirement. Phase 2. |
| 7 | **Contact-info change** (the ATO vector) | **Always T3.** Requires a fresh OTP to the *current* registered channel, and on change we notify **both** the old and new channel. A caller who controls the new phone still can't hide the change from the real owner. |
| 8 | **Outbound call** (we called them) | The reverse problem: **we** must prove we're TerraVest. The agent states a pre-agreed, non-secret reference (e.g. the last 4 of the case number the customer can see in-app) and **never asks the customer to verify full credentials on an outbound call.** A banner reminds the agent. |
| 9 | **Vulnerable / accessibility** | A care flag on the account relaxes friction with a supervisor's sign-off (e.g. accepts KBA where OTP is impractical) and is itself audited — the relaxation is a recorded decision, not a silent bypass. |
| 10 | **Verification expires mid-call** | The tier banner counts down; at expiry it drops and the next gated action re-prompts. No hard cut mid-sentence. |
| 11 | **Minor / custodial account** | Verification is against the *custodian*, not the minor. Phase 2. |
| 12 | **Chat / IVR / chatbot channel** | The same tier model, different method mix (in-app confirmation, IVR OTP). The verification session is channel-agnostic by design — the existing mockup already anticipates IVR/chatbot integration. |

---

## 5. The disclosure timeline — "step by step, agent opened this"

You asked specifically for the step-by-step record. It already half-exists: the audit trail records
`ops.customer.view`, `ops.pii.reveal`, `ops.adjustment.*` with actor, target, and reason (see
`ops-access-and-audit.md`). This adds the **verification events** and presents them as a per-call
**disclosure timeline** — a single readable narrative of exactly what happened:

```
14:02  Agent Dana opened this record                             (Tier 0)
14:02  Sent verification code to registered ••••1234
14:03  Caller verified — OTP                                     (Tier 0 → Tier 2)
14:03  Viewed accounts & balances
14:05  Revealed SSN last-4    reason: "caller confirming tax id"
14:06  Proposed $40 refund    reason: BILLING_ERROR, duplicate June charge
14:09  Session ended
```

New audit actions: `ops.caller.verify.start`, `ops.caller.verify.pass` (with method + tier),
`ops.caller.verify.fail`, `ops.caller.verify.suspicious`. All flow through the same keyed,
tamper-evident chain, so the disclosure record is as hard to alter as the money record.

This timeline surfaces two places: live in the agent's session panel (so they can see what they've
disclosed this call), and in the **Staff access** tab for compliance review — with the tier at which
each disclosure happened, which is the question an auditor actually asks: *"was the caller verified
when their SSN was read out?"*

---

## 6. Architecture

- **Where it lives:** a `CallerVerificationService` + `ops_verification_sessions` /
  `ops_verification_attempts` tables in **auth-service** — it owns the customer PII and the OTP
  machinery, so no new cross-service hop and no PII leaving the service.
- **The disclosure gate** is enforced **server-side**, not just in the UI. Every ops endpoint that
  returns a customer fact takes the verification-session context and refuses to return above-tier
  data even if the UI asks — the tier is checked next to the permission, in the same `@PreAuthorize`
  neighbourhood. UI gating is convenience; the server is the boundary. (Same principle as the
  permission model: the front-end hides, the back-end refuses.)
- **Tags, not scattered constants:** each disclosable field/action declares its minimum tier in one
  place (a `DisclosureTier` enum mapping), so "what needs what" is a table you can read and audit,
  not logic spread across controllers — mirrors how `OpsPermission` centralizes the permission
  catalog.
- **Reuses:** `OtpService` (the codes), `NotificationClient` (delivery), the `users` row (KBA source
  + registered channels), and the audit chain (the record).

---

## 7. What this is NOT

- **Not the agent's login.** Agents already authenticate strongly (separate identity, mandatory MFA,
  short sessions — phase 1). This verifies the *caller*, a different party.
- **Not a replacement for permissions.** It's an orthogonal gate that sits in front of them. Both
  must pass.
- **Not KYC/onboarding identity proofing.** That's proving who someone is when they *sign up*. This
  is proving the *caller* is that already-known customer.

---

## 8. Product decisions (yours to make)

My recommendation is first in each. These change scope, so they're the sign-off points.

| # | Decision | Options | Recommendation |
|---|---|---|---|
| 1 | **Which methods in phase 1** | (a) OTP-to-registered + dynamic KBA; (b) OTP only; (c) KBA only | **(a)** — OTP is the strong path, KBA the fallback when the caller can't receive it. Both reuse existing primitives. |
| 2 | **How many tiers** | (a) 4 (T0–T3 as above); (b) 3 (fold step-up into T2); (c) binary | **(a)** — the T3/step-up separation is exactly what stops "verified once, then drain the account". Binary is the status quo hole. |
| 3 | **Failed-attempt lockout** | (a) 3 fails → flag + 30-min cooldown; (b) softer; (c) none | **(a)** — repeated failed verification IS the signal of an attack; not recording/acting on it wastes the best fraud signal a desk has. |
| 4 | **Contact-info change** | (a) T3 + notify both channels; (b) T2; (c) same as any edit | **(a)** — this is the #1 account-takeover vector; it earns the strictest treatment. |
| 5 | **Third-party / estate / minor** | (a) leave schema room, build phase 2; (b) build now; (c) ignore | **(a)** — real but lower-volume; designing the session model to allow a `subject_relationship` now avoids a migration later. |
| 6 | **Build vs. design-first** | (a) build phase 1 (OTP+KBA, 4 tiers, disclosure gate, timeline) after sign-off; (b) design only for now | **your call** — the design is ready to build; the decisions above are what it waits on. |

**Two I'd genuinely weigh with you:** #2 (a 4-tier model is more UI friction on every call — worth
it for a finance product, maybe heavy for a low-risk one) and #6 (this is a multi-service build of
real size; worth confirming appetite before I start).

---

## 9. Suggested phasing (after sign-off)

| Phase | Contents |
|---|---|
| **A. Session + gate + OTP** | verification session model, the disclosure-tier gate (server + UI), OTP-to-registered method, the tier banner, disclosure-timeline events |
| **B. KBA + failure handling** | dynamic KBA questions, failed-attempt lockout + fraud flag, the "suspicious" freeze button |
| **C. Step-up + contact-change hardening** | T3 per-action challenges, contact-info change re-notifying both channels |
| **D. Edge cohorts** | authorized third party, estate, minor, vulnerable-customer care flag |

Phases A–C are the core and where the risk reduction is. D is real but lower-volume and can trail.
