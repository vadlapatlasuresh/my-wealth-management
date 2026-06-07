# 04 · Feature Status & Gaps

**Your question:** *"Check all my features with backend API + data — what's pending?"*

This is the consolidated reality check: every feature, whether it's wired to the backend, whether the
backend uses a **real** integration or a **mock**, and **what's pending** to make it production-real.

## Legend
- ✅ **Done & real** — backend-wired, real integration (or no integration needed).
- 🟡 **Done on mock** — fully wired, but the external provider is a mock behind a real interface.
- 🟠 **Partial** — mostly backend, but some sections are hardcoded/placeholder.
- ⬜ **Static** — no backend; hardcoded or localStorage only.

---

## Feature matrix

| Feature (web page) | Backend service | Endpoints | Provider | Status | Pending to be prod-real |
|---|---|---|---|---|---|
| Auth (login/register/SMS) | auth | `/auth/*` (5) | none | ✅ | Real SMS provider for `sms/send` (dev returns code); auth event logging |
| Accounts | account-aggregation | `/aggregation/*` (5) | **Plaid 🟢 sandbox** | ✅ (sandbox) | Plaid **production** keys; encrypt access token; webhook handling |
| Transactions | account-aggregation | `/aggregation/transactions` | Plaid 🟢 | ✅ (sandbox) | Same as Accounts; transaction sync/refresh job |
| Home dashboard | financial-core (+others) | `/me/snapshot` | none | 🟠 | "Upcoming bills" is **hardcoded**; wire to payment/calendar data |
| Budgets | financial-core | `/planning/budgets/*` | none | ✅ | — (category bucketing is client-side by design) |
| Debt Lab | financial-core | `/planning/debt-scenarios*` | none | ✅ | Strategy copy hardcoded (cosmetic) |
| Net-worth snapshot | financial-core → aggregation (Feign) | `/me/snapshot` | none | 🟠 | Some 30d-change deltas are placeholders; confirm real-estate equity feeds in |
| Bill Pay | payment | `/payments/*` (5) | **Stripe 🟡 mock** | 🟡 | Real Stripe (or ACH) keys; **webhook signature verify**; persist webhook events |
| Real Estate / Properties | real-estate | `/real-estate/*` (7) | **Valuation 🟡 mock** | 🟡 | Real valuation API (RentCast/ATTOM); 30d deltas are placeholders |
| AI Assistant | ai-insights | `/ai/*` (3) | **LLM 🟡 mock** | 🟡 | Real Claude/OpenAI wiring (`AI_PROVIDER`); prompt library hardcoded |
| My Business | business-financials | `/business/*` (7) | **QuickBooks 🟡 mock** | 🟡 | Real QBO OAuth + token storage; entity-type list hardcoded |
| Messages (inbox) | notification | `/notifications/*` | in-app ✅ / email,push,sms 🟡 | 🟡 | Real SendGrid/FCM/Twilio adapters (config-driven router ready) |
| Profile / Settings (notif prefs) | notification | `/notifications/preferences` | none | ✅ | — |
| Security | auth (client) | (login endpoints) | none | 🟠 | 2FA/session management UI not backend-wired; biometric (mobile) |
| Remote config / nav / flags | platform-config | `/config/*` | DB ✅ | ✅ | Optional managed flag provider (LaunchDarkly/Unleash) |
| Disclaimers / legal copy | platform-config | `/content/*` | DB ✅ | ✅ | Broaden coverage (only RE valuation wired today) |
| **Invest** (stocks/brokers/alts/market) | — | none | — | ⬜ | No backend at all; holdings/allocation/marketplace **hardcoded** + localStorage |
| Learn | — | none | — | ⬜ | Static content; no learning service |
| How-to Guide | — | none | — | ⬜ | Static walkthrough |
| Deal Room | — | none | — | ⬜ | No backend wiring |
| Fractional LLC | — | none | — | ⬜ | No backend wiring |
| Cash | account-aggregation (reuse) | (reuses accounts/tx) | Plaid 🟢 | 🟠 | Category list hardcoded |

---

## What's pending — grouped

### 1. Flip mocks → real providers (config + one class each)
```mermaid
flowchart LR
    subgraph Mock["🟡 mock today"]
        S[Stripe] 
        Q[QuickBooks]
        L["LLM (Claude/OpenAI)"]
        V["RE valuation"]
        E["Email/SMS/Push"]
    end
    Mock -->|add keys + impl behind existing interface| Real["🟢 real"]
```
- **Payment** → real Stripe (keys + `PaymentProvider` impl) **and webhook signature verification**.
- **AI** → set `AI_PROVIDER=anthropic`, implement `AiProvider` with Claude.
- **Business** → real QBO OAuth, store + refresh tokens (currently only realm_id mock).
- **Real estate** → real valuation provider (`PropertyValuationProvider` impl + key).
- **Notification** → real SendGrid/FCM/Twilio adapters (the `ChannelRouter` already selects by config).

### 2. Build out the unbacked features (⬜)
- **Invest** is the biggest gap — entirely hardcoded/localStorage (holdings, allocation, brokers,
  alternatives, marketplace). Needs an investments service (or brokerage aggregation) to be real.
- **Learn / Guide / Deal Room / Fractional LLC** — decide: keep static (CMS-driven via platform-config)
  or build services.

### 3. Replace remaining hardcoded UI blocks (🟠)
- Home "upcoming bills"; Invest allocation & day-change; Real-estate 30d deltas; Cash categories;
  AI prompt library; debt-strategy copy. (Mostly cosmetic except upcoming bills.)

### 4. Cross-cutting production-readiness (see [03](03-data-persistence-and-audit.md) + [DEPLOYMENT_PLAN](../DEPLOYMENT_PLAN.md))
- 🔴 **Encrypt Plaid access token at rest.**
- **Audit layer**: auth events, generic audit_log, OAuth consent log, webhook event storage.
- **Webhooks**: verify signatures (Stripe + Plaid); persist events.
- **Soft-delete + retention.**
- **Postgres cutover + secrets manager + tests/CI + deploy** (Day 1–7 plan already underway).

---

## One-line summary

> **Core money features (auth, accounts, transactions, budgets, debt, bill pay, real estate, AI,
> business, notifications) are fully wired to the backend.** Only **Plaid is a live integration
> (sandbox)**; the other five integrations are **mocks behind real interfaces** (flip via config).
> **Invest + Learn/Guide/Deal Room/Fractional LLC are not backed by any API yet.** The biggest
> non-feature gaps are **encrypting the stored Plaid token** and **adding a real audit trail**.
