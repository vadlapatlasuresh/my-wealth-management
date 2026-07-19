# 11 — Showcase & Demo Prep

**Purpose:** everything you need to walk into two demo/presentation calls and speak about
TerraVest with confidence. Written to be used directly — read §1, §2, §8 out loud once and
you're ready.

**Verified against the codebase on 2026-07-18.** Live check: `https://app.terravest.app`
returned **HTTP 200 in 0.26s** while this document was being written.

> **How to use this for two different calls.** Most sections serve both audiences. Where a
> business audience and a technical audience need different emphasis, you'll see a
> **▶ Business call** / **▶ Technical call** split. Decide which call is which before you prep,
> then read the matching branch.

---

## 1. What the application does

### The 30-second version

> "TerraVest is a wealth management platform for people whose finances don't fit in a normal
> money app — the self-employed, small business owners, and real estate investors. Most people
> in that group are running their life across a personal budgeting app, a spreadsheet for their
> rentals, QuickBooks for the business, and a shoebox of receipts for their CPA. TerraVest puts
> personal net worth, business P&L, and property portfolios in one place, and connects them —
> because for these people, those aren't three separate financial lives. They're one."

### The 2-minute version

Add these three beats:

**1. Who it's for, precisely.** Not "everyone who wants to budget." The wedge is the person with
a **1099 income stream, an LLC, and at least one rental property**. That person is badly served:
consumer apps (Mint, Monarch, Copilot) ignore the business, accounting apps (QuickBooks) ignore
personal wealth, and neither one understands real estate.

**2. What they actually get.** One login that shows: consolidated net worth across linked bank
and brokerage accounts; a per-entity business command center with P&L, invoicing, expenses and
cash forecasting; a property portfolio with valuations, equity and per-property expense tracking;
a tax estimator that actually understands rental depreciation and the QBI deduction; and a
document center that packages all of it for their CPA with one secure link.

**3. Where it's going.** Dashboard → advice → financial product. It's a trusted dashboard today,
AI-driven advice tuned to this niche next, and eventually a financial product (lending, cash
management, or advisory) sold to an audience we already have the complete financial picture for.

### Proof points to have ready

| | |
|---|---|
| **Live** | `https://app.terravest.app`, HTTPS, deployed and healthy |
| **Scale of build** | ~42,300 lines of Java across 14 services + ~32,000 lines of React |
| **Surface area** | 305 REST endpoints · 82 data entities · 174 database migrations |
| **Product surface** | 35 screens across 26 routes |
| **Platforms** | Web PWA + iOS + Android from one codebase |
| **Pricing live in the product** | Individual $9.99/mo · Business $29.99/mo · 7-day free trial |

---

## 2. The problem it solves

### Frame it as a story, not a market-size slide

> "Picture a general contractor. She has an LLC, takes 1099 work, owns three rentals, and files
> jointly with a W-2 spouse. Ask her what she's worth and she can't tell you — not because she
> doesn't know her business, but because the answer is scattered across four systems that don't
> talk. Her personal accounts are in one app. Her business books are in QuickBooks. Her rentals
> are in a spreadsheet she updates twice a year. And every March she assembles all of it by hand
> for a CPA who charges her for the assembly."

### The gap, stated sharply

**The tools that exist are each built for a person who doesn't exist.**

| Category | Built for | Where it fails our user |
|---|---|---|
| Consumer PFM (Mint, Monarch, Copilot) | A W-2 employee with a paycheck | No business entity, no P&L, no rental logic. Treats business income as "income" and business expenses as personal overspending. |
| Accounting (QuickBooks, Xero) | A bookkeeper doing the books | No personal net worth, no investments, no property equity. Answers "how did the business do?", never "how am I doing?" |
| Real estate tools (Stessa, Baselane) | A landlord, only | Property-only. No business, no personal wealth. |
| Spreadsheets | Nobody, badly | Manual, stale, error-prone, and not shareable with a CPA in any safe way. |

**So the user does integration work by hand, forever.** That manual reconciliation is the product
gap. It is also the reason this is defensible: stitching personal + business + property together
correctly is genuinely hard, and none of the incumbents can do it without abandoning the customer
they're built for.

### The three costs of the gap (use whichever lands)

1. **No single number.** They can't answer "what am I worth?" without an afternoon of work — so
   they never actually know, and can't make decisions from it.
2. **Tax money left on the table.** Rental depreciation, suspended passive losses, the 20% QBI
   deduction, quarterly estimates — these are exactly the levers this group has, and exactly the
   ones a consumer app never surfaces.
3. **The CPA tax.** They pay professional rates for data assembly that software should do.

### The one-sentence version

> "Every tool in personal finance assumes your money life is simple. For the self-employed, it
> never is — and TerraVest is built for the version that isn't."

---

## 3. What we are achieving

Lead with outcomes. Features are §5.

### For the user

- **One number, always current.** Consolidated net worth computed from real linked account
  balances — not a manual entry, not an estimate. Charted over time with a "what moved it"
  contributor breakdown, and a visual alert when it drops more than 15%.
- **Their business becomes legible.** A per-entity command center that computes a business health
  score, a 90-day cash forecast with shortfall detection, and AR aging — so an owner sees a cash
  crunch coming with a quarter's warning instead of discovering it at the bank.
- **They get paid faster.** Invoicing that sends by email or SMS, gives the customer a public
  payment page, reconciles payments back to transactions, and can chase every overdue invoice in
  one bulk action.
- **Tax stops being an annual panic.** A running estimator that models rental depreciation,
  suspended loss carryforward, QBI, and quarterly estimates — visible in July, not just April.
- **The CPA handoff becomes one link.** Categorized expense exports and a document center that
  shares a view-only, passcode-protected, expiring link with a full access log.

### For the business

- **Live, revenue-ready.** Not a prototype. Deployed, HTTPS, monitored, with a subscription and
  billing lifecycle already in the product: two plans, a 7-day trial, and feature gating that
  actually locks modules behind entitlements.
- **A pricing catalog that's config, not code.** Plans, prices, trial length and per-plan feature
  flags are database rows — you can reprice or re-package without a deploy.
- **A defensible wedge.** Purpose-built for a niche the incumbents structurally can't serve.
- **Distribution on three platforms** from one codebase — web PWA, iOS, Android.
- **Institutional-grade trust primitives** already built (see §4): tamper-evident audit,
  centralized encrypted secrets, and a separated ops portal. These are the things that are
  expensive to retrofit and cheap to have built early.

### For an evaluator (the engineering story)

- **Fourteen independently deployable services** with one database each, Flyway-versioned — not a
  monolith with a services folder.
- **Every external dependency is behind an interface with a working mock.** The entire product is
  demoable and testable with zero third-party keys. Adding a key is a config flag, not a code
  change — and if a key is missing or a call fails, it falls back to the mock and logs it.
- **Built by a very small team, fast** — the git history shows 200+ merged PRs of real feature
  work with CI on every one.

---

## 4. Technical overview

### The shape of it

```
   Browser · iOS · Android  (one React codebase; phones = Capacitor wrapper)
                     │
                     ▼
          Caddy  — HTTPS, static SPA, reverse proxy
                     │   (/api/* → gateway, so prod is same-origin: no CORS)
                     ▼
          API Gateway :8080
          single front door · routing · auth · CORS allow-list
          X-Request-Id correlation · audit capture · rate limiting
                     │
   ┌──────────┬──────┴─────┬────────────┬──────────────┬─────────────┐
   ▼          ▼            ▼            ▼              ▼             ▼
  auth   account-agg  financial-core  real-estate  business-fin  ai-insights
  8081      8082          8083           8084          8085         8086
   ▼          ▼            ▼            ▼              ▼             ▼
 payment  notification  platform-config  audit    documents     secrets
  8087      8088           8089          8090       8091        (internal)

  Every service → its own Postgres database, its own Flyway migrations, its own JWT filter.
```

### The five design decisions worth defending

**1. One database per service.** No shared schema, no cross-service joins. Each service owns its
data and its migrations (174 of them, versioned). Services talk over HTTP through the gateway or
via internal keyed endpoints — never by reaching into each other's tables.

**2. Provider abstraction with a mock default.** Every external integration — Plaid, Stripe,
QuickBooks, SendGrid, Twilio, RentCast, Anthropic, Gemini, FCM — is a Spring bean selected by a
config flag, defaulting to a deterministic mock. The real implementation is
`@Primary @ConditionalOnProperty` and **falls back to the mock if the key is absent or the call
errors**, logging that it did. This is why the app is fully demoable with no keys, and why
turning on a vendor is a one-line config change plus a restart of one service.

**3. Shared-secret JWT, per-service enforcement.** A token issued by auth-service validates in
every service, so there's no central session lookup on the hot path — but each service still runs
its own Spring Security filter, so no service trusts the gateway blindly.

**4. Tamper-evident audit.** Every state change is written to a SHA-256 hash chain. `GET
/api/v1/audit/verify` re-walks the chain and proves nothing was altered or deleted. The ops
portal's audit goes further: a keyed HMAC chain with signed checkpoints recording actor, target,
reason, and diff.

**5. Ops identity is separate from customer identity.** Staff are rows in `ops_users`, not
customers with an extra role. Ops tokens are typed (`typ=ops`) and **refused on member routes** —
so an agent's credential can never be used to act as a customer. Access is permission-based
against a database-editable matrix, and PII reveal requires a typed reason that gets recorded.

### The stack, briefly

| Layer | Choice |
|---|---|
| Frontend | React 18 · Vite · React Router · single CSS design system · i18next (9 languages, RTL for Arabic) · light/dark/glass themes |
| Mobile | Capacitor wrapping the web build → native iOS + Android projects |
| Backend | Java 17 · Spring Boot 3.2 · Spring Security · JPA · Flyway · Feign |
| Data | Postgres, one database per service |
| Infra | Single GCP VM · Docker Compose (12 services + Caddy) · Terraform for VM/IP/firewall/KMS |
| CI/CD | GitHub Actions builds + tests every service and the web app → multi-arch images to GHCR → one-click deploy workflow SSHes to the VM |
| Observability | Micrometer → Prometheus `/actuator/prometheus` on every service; `X-Request-Id` correlation through gateway → logs (MDC) → Feign hops |
| Secrets | Centralized encrypted secret store; key-encryption key in Cloud KMS |

**▶ Technical call — the honest architectural note to volunteer.** Fourteen services is more than
this traffic needs. Say so first, before they do: *"This is service-per-domain because each domain
has a genuinely different external dependency and compliance surface — bank data, tax data, and
document sharing shouldn't share a blast radius. The cost is operational complexity, and I run it
on a single VM with Compose rather than Kubernetes precisely to keep that cost proportionate to
the stage."* Owning the tradeoff out loud reads as judgment. Being caught not having considered it
does not.

---

## 5. Key features and functionality

Grouped the way you should demo them — as three connected stories, not a feature list.

### Story 1 — "Know what you're worth" (personal wealth)

| Feature | What it does |
|---|---|
| **Bank & brokerage linking** | Plaid integration — link accounts, pull balances and transactions. **Live on sandbox keys today.** |
| **Net worth** | Computed from real balances. Interactive chart (area/line/bars), range selector, "what moved it" contributors, downfall alert on a >15% drop. |
| **Transactions** | Filterable by date, amount, category; re-categorization. |
| **Budget & Plan** | 50/30/20 presets, Needs/Wants/Savings, period selection, alerts. |
| **Debt Lab** | Avalanche / Snowball / Hybrid payoff strategies with explainers, an extra-payment model, a recommended plan, and a cross-strategy "cheapest vs fastest" comparison. |
| **Goals** | Targets, progress tracking, required-monthly-contribution math. |
| **Calculators** | Mortgage payoff, extra payment, compound and simple interest. |
| **Invest / Cash** | Holdings, broker connections, alternative investments, cash position. |
| **Bill Pay** | Multi-step payee → amount → funding → schedule → confirm, idempotent and cancelable. |

### Story 2 — "Run the business" (the wedge, part one)

The flagship screen. One page, seven tabs, ~4,800 lines of front-end — and multi-entity
throughout, so someone with three LLCs gets three isolated books plus a consolidated view.

| Tab | What it does |
|---|---|
| **Overview — the Command Center** | Business health score, **90-day cash forecast with shortfall detection**, AR aging, and rule-based smart insights. |
| **Transactions** | Ledger merging linked-account data with manual entries, period-aware. |
| **Expenses** | Per-business dated, categorized expense tracking with transaction linking and export. |
| **Credit Cards** | Business card tracking. |
| **Business Tools** | Invoicing (send by email/SMS, public payment page, payment reconciliation, bulk "remind all overdue"), recurring/subscription detection, per-customer payment behavior, budgets & variance, cash-reserve and tax set-aside goals, vendor/procurement management with renewal alerts. |
| **Reports** | Cash-basis P&L, Balance Sheet, Cash Flow — CSV export and print-to-PDF. |
| **Documents** | Per-business folders and invoice attachments. |

### Story 3 — "The property portfolio & the tax payoff" (the wedge, part two)

| Feature | What it does |
|---|---|
| **Real Estate** | Properties with auto-estimated values (RentCast), equity, and rental cap-rate. |
| **Per-property expenses** | Dated, categorized expense tracking per property, with a portfolio-wide combined tax export. |
| **Tax estimator** | Filing status, W-2s, self-employment income, and a genuine rental model: gross rents, mortgage interest, property tax, insurance, repairs, management, **cost basis and land value for depreciation**, and **prior-year suspended loss carryforward**. Plus guidance on the 20% QBI deduction, quarterly estimates, dependent care, and energy/EV credits. |
| **Document Center** | Personal folders, uploads, a cross-app document registry, and **CPA secure sharing**: view-only links with expiry, mandatory passcode, and an access log. Multi-file share sets. |
| **CPA Marketplace** | Connect to a professional. |
| **Deal Room** | Sponsor marketplace — deals, leads, docs, watchlist, express interest, sponsor track record. |
| **Fractional LLC** | Co-investment marketplace. |

### Cross-cutting

| Feature | What it does |
|---|---|
| **AI Assistant** | Insights and chat grounded in the user's real numbers, with scope selection, response styles, a prompt library, voice input, and a disclaimer. **Live on Gemini**; Anthropic and OpenAI clients also implemented and switchable. |
| **Auth & security** | Split-screen sign-in/sign-up, individual vs business, email + SMS OTP, MFA, encrypted SSN/EIN stored as last-4, session management, and friendly login history with optional offline geo-IP. |
| **Subscriptions** | Two plans, 7-day trial, trial-onboarding modal and trial-ending banner, billing lifecycle, and feature gating that locks business modules behind entitlements. Catalog is database-editable. |
| **Notifications** | Email / SMS / push / in-app fan-out with per-user preference gating and an in-app inbox. |
| **Ops Portal** | Separate staff identity, permission-based RBAC, customer 360, caller verification with tiered disclosure, financial ops (append-only ledger, maker-checker adjustments, anomaly queue), notes and escalations — all on an HMAC-chained audit trail. |
| **Platform** | Feature flags, nav config, versioned disclaimers. Admin analytics dashboard. Data export and account deletion. |

---

## 6. Demo flow suggestions

### The principle

**Do not tour the navigation.** Thirty-five screens will flatten any audience. Demo *one person's
problem being solved*, end to end, in a single narrative arc. The nav sidebar is visible the whole
time and does your "there's a lot here" work for you silently.

Use a persona and name her: **"Maria — general contractor, one LLC, three rentals, files jointly."**
Say the name at the start and refer back to it at every step. It keeps a feature demo from
decaying into a feature list.

### Recommended sequence (~12 minutes)

**0. Cold open — before you share your screen (30s).**
Deliver the problem from §2. Do not open the app until they feel the pain. The dashboard is far
more impressive to someone who has just been made to feel the mess it replaces.

**1. The single number (90s).** Land on Home. Consolidated net worth, chart, "what moved it."
> *"This is every account Maria has — personal, business, brokerage — in one number. Before
> TerraVest, getting this number took her an afternoon and a spreadsheet."*

Change the chart range. Show the contributor breakdown. Don't linger.

**2. The connection — this is the moment (3 min).** Go to **My Business → Overview**.
> *"Here's what no consumer finance app does. This is Maria's LLC, as its own set of books."*

Show the health score. Then the **90-day cash forecast**, and stop there:
> *"This is the feature owners react to. It's telling her she's tight in week nine — in time to do
> something about it. That's the difference between a dashboard and a decision."*

Then AR aging → **"and here's why she's tight"** → invoicing → **bulk remind all overdue.**
> *"One click just chased every overdue invoice by email and SMS. Her customer gets a payment page,
> and when they pay, it reconciles back against the transaction automatically."*

That cause → effect → *action* chain is the strongest 90 seconds in the product. Rehearse it.

**3. The wedge — real estate + tax (3 min).** Real Estate → the three properties, values, equity,
cap rate. Then per-property expenses. Then **Tax**.
> *"Now watch what a tool built for this person does. Depreciation on each property. Suspended
> passive losses carried forward. The 20% QBI deduction on her business income. Her quarterly
> estimate. A consumer budgeting app has no idea any of these exist — and these are exactly the
> levers this customer has."*

This is the section that proves the product isn't a generic dashboard with a business tab bolted
on. Give it the most time.

**4. The payoff — the CPA handoff (90s).** Document Center → generate a secure share link.
> *"Expiring, passcode-protected, view-only, with an access log. Maria's entire tax year, to her
> CPA, in one link — instead of a shoebox and an hourly rate for data entry."*

**5. Close on trust (90s).** Pick **one**, matched to the audience:
- **▶ Business call →** Subscription page. Two plans, trial, gating. *"This is revenue-ready
  today. Prices and features are database rows — we can reprice without a deploy."*
- **▶ Technical call →** `/api/v1/audit/verify` and the Ops Portal. *"Every state change is in a
  hash chain, and this endpoint proves it wasn't tampered with. Staff have separate identities
  whose tokens are refused on customer routes. Revealing a customer's PII requires a typed reason
  that gets recorded."*

**6. Land the plane (30s).** Return to Home — visually closing the loop where you opened.
> *"One login. Personal, business, property, tax. For the ten million Americans whose money life
> doesn't fit in a budgeting app."*

### Practical prep — do these before the call

- [ ] **Seed the demo account with realistic data.** Empty states kill demos. Three properties, a
      business with a dozen invoices (some deliberately overdue, to make AR aging and bulk-remind
      land), and a few months of transactions.
- [ ] **Log in beforehand and leave the tab open.** Never demo through an OTP flow — you'll be
      waiting on an inbox in front of an audience. If you must show signup, show it *last*, as a
      deliberate segment.
- [ ] **Hard-refresh the browser** before starting. This is a PWA and a stale service-worker cache
      can serve you an older bundle than the one you deployed. Verify the live bundle is current.
- [ ] **Check `https://app.terravest.app` returns 200** the morning of.
- [ ] **Pre-open your closing tab** (subscription or audit-verify) so the finish is clean.
- [ ] **Have the mobile app ready** as a 20-second flourish only if asked — don't spend demo time
      on it unprompted.
- [ ] **Rehearse step 2 out loud twice.** It's the strongest sequence and the easiest to fumble.

### If you only get 5 minutes

Cold open (30s) → Net worth (60s) → Business cash forecast + bulk remind (2 min) → Tax
depreciation + QBI (90s). Cut real estate detail, the document center, and the close. The tax
screen is the single most differentiated thing in the product — if you can only keep two things,
keep the cash forecast and the tax screen.

---

## 7. Anticipated questions and strong answers

### On the market

**"Isn't this just Mint / Monarch / Empower?"**
> "Those are excellent products for a W-2 employee, and I'd lose that fight — it's a crowded,
> commoditized market. I'm not in it. They have no concept of a business entity, a P&L, an
> invoice, or rental depreciation. My user has all four. The overlap is one screen out of
> thirty-five, and it's the least important one."

**"What about QuickBooks? They own small business."**
> "QuickBooks answers 'how is the business doing?' It has no idea what its user is *worth* — no
> personal accounts, no investments, no property equity, no joint tax picture. For an owner whose
> personal and business finances are the same finances, that's half an answer. We integrate with
> QuickBooks rather than fight it — it's a supported data source."

**"Why can't an incumbent just build this?"**
> "They can, but it costs them their focus. Monarch adding a P&L makes their product worse for the
> 95% of users who are W-2. QuickBooks adding personal net worth confuses the bookkeeper they sell
> to. Serving this customer means combining three domains none of them wants to own all three of —
> that's the wedge, and it's why it stays open long enough to build a business in."

**"How big is this market?"**
> Give the shape honestly: tens of millions of self-employed Americans, a large subset of whom own
> rental property. Then pivot to the thing that actually matters: *"But I'm not making the case on
> TAM. I'm making it on traction in the niche — the target is 50 to 100 weekly active users in the
> wedge. That number is the real proof, and it's the honest gate on raising."*

### On the product

**"How much of this is real versus mocked?"**
Answer this one *proactively*, before it's asked — volunteering it buys enormous credibility.
> "Real and live today: bank linking via Plaid on sandbox keys, email OTP through SendGrid, and
> the AI assistant on Gemini. Real with no vendor needed at all: net worth, budgets, goals, debt
> strategies, calculators, the tax estimator, invoicing, all business reports, document sharing,
> and the audit chain — that's most of the product, because it's our own logic, not a vendor's.
> Still mocked: Stripe money movement, SMS, QuickBooks sync, and push. Every one of those is a
> config flag plus a key — the same one-line change that turned Plaid on. It's deliberately
> architected so no integration is a rewrite."

**"Do you have users?"**
Do not dress this up.
> "Not yet at scale — the product went live recently and the security gate for real-money users
> isn't fully closed. The next milestone is exactly that: close the gate, then get to 50–100
> weekly actives in the wedge. I'd rather tell you the honest number than a vanity one."

**"What's the business model?"**
> "Subscription, already built and priced in the product: $9.99/month for Individual, $29.99/month
> for Business, both with a 7-day trial and roughly two months free annually. Feature gating is
> live, so the Business modules genuinely lock behind the tier. Longer term the subscription isn't
> the interesting revenue — having the complete financial picture for a self-employed borrower is
> the foundation for lending or advisory, which is where the margin is."

**"What's the moat?"**
> "Three layers. Near term, focus — the incumbents can't follow without damaging their core
> product. Medium term, data — once someone's personal, business, and property history lives here,
> switching means rebuilding years of records. Long term, the financial product — if we lend
> against a picture only we can see, that's not a feature anyone copies."

### On the technology

**"Why microservices? Isn't that over-engineered for this stage?"**
Volunteer the tradeoff before they press it — see §4's note.
> "Partly, and I'll own that. The reason it's service-per-domain is that each domain carries a
> genuinely different external dependency and compliance surface — bank data, tax data, and
> document sharing shouldn't share a blast radius, and each needs its own migration cadence. The
> cost is operational overhead, which I control by running Compose on a single VM rather than
> Kubernetes. When traffic justifies it, the services are already independently deployable."

**"How do you handle security and sensitive data?"**
> "Layered. JWT auth with per-service Spring Security enforcement — no service trusts the gateway
> blindly. SSN and EIN are encrypted and displayed only as last-four. All provider secrets live in
> a centralized encrypted store with the key-encryption key in Cloud KMS, never in the repo.
> Services refuse to boot in production on a weak or default secret. CSP and security headers,
> rate limiting, and an explicit CORS allow-list. Every state change lands in a tamper-evident
> SHA-256 hash chain with a `/verify` endpoint. And staff access is fully separated: distinct ops
> identities whose tokens are rejected on customer routes, permission-based RBAC, and PII reveal
> that requires a recorded reason."

**"Are you compliant? SOC 2? PCI?"**
Do not overclaim. This is where credibility is won or lost.
> "No formal certification — that's an audit process with real cost, and it's premature before
> revenue. What I've done is build the primitives an audit will ask for, early, because they're
> expensive to retrofit: tamper-evident audit logging, encryption at rest for identifiers,
> centralized KMS-backed secrets, separated privileged access with recorded reasons, and data
> export plus account deletion. When SOC 2 becomes the thing standing between us and a customer,
> it's a process to run, not an architecture to rebuild."

**"What happens if a vendor goes down?"**
> "Every integration falls back to its mock implementation and logs that it did — so a Plaid or
> SendGrid outage degrades one capability instead of taking the app down. That's a direct
> consequence of the provider abstraction; it was built for local development without keys, and
> resilience came free with it."

**"How do you know it works? What's your testing story?"**
Be precise, including the limits.
> "CI runs on every pull request and builds and tests all fourteen services plus the web app —
> 49 Java test classes and a Vitest suite, plus Playwright browser coverage of the core flows. On
> top of that, every core flow has been verified against live production with real signup through
> to read-back. I'll be straight about the gap: coverage is strongest on the money math and
> thinnest on the newest features, and broadening the E2E suite is an open item on the roadmap."

**"How long did this take, and who built it?"**
> "Small team, heavily AI-assisted development — 200-plus merged PRs of real feature work, each
> through CI. That velocity is itself part of the pitch: the iteration speed to find product-market
> fit in this niche is unusual."

**"What's your infrastructure cost?"**
> "Effectively nothing today — a single GCP VM, Postgres on a free tier, and all paid providers
> either mocked or on free sandbox tiers. It scales vertically for a long time before it needs
> to scale out, and the whole VM is reproducible from Terraform."

### The hard ones

**"What's the biggest risk?"**
Answer directly. Hedging here reads as evasion; candor reads as command of the business.
> "Distribution, not product. I've built something this customer needs; I haven't yet proven I can
> reach them efficiently. Self-employed people with rentals don't cluster in one channel. That's
> the next thing to solve, and it's why the milestone is weekly actives rather than more features."

**"What would you do with funding?"**
> "Close the security gate for real-money users, turn on the remaining paid integrations, and put
> everything else into distribution in the wedge. Not more features — the product is already
> broader than the traction justifies."

**"Why hasn't this been built before?"**
> "Because it's three products' worth of domain logic for one customer, and it only became
> tractable recently. Bank aggregation is now an API instead of a partnership. Property valuation
> is an API. And AI makes personalized advice viable without a human advisor per customer. The
> pieces got cheap enough at the same time that one small team can combine them."

**"What are you missing / what would you fix first?"**
Have this ready — it's a favorite, and a prepared answer signals self-awareness.
> "Three things, in order. One: the security gate — SMS delivery keys and turning off the
> development OTP bypass, which is non-negotiable before a single real user. Two: true cascading
> delete across every service for a clean GDPR-grade deletion — today it's incomplete. Three:
> moving the web token out of localStorage into an httpOnly cookie to harden against XSS. All
> three are known, scoped, and on the roadmap, not discoveries."

---

## 8. One-liners and talking points

### On the product

> **"All your wealth, one place."** *(the actual tagline)*

> "Personal net worth, business P&L, and property portfolio — in one login, because for our
> customer those were never three separate financial lives."

> "It's the financial operating system for people who work for themselves."

> "One number for people who currently need an afternoon and a spreadsheet to find it."

### On the problem

> "Every money app assumes your finances are simple. For the self-employed, they never are."

> "Mint doesn't know you own a business. QuickBooks doesn't know you own a house. Nobody knows you
> own all three."

> "Our customer is doing systems integration by hand, every month, forever. That's the product gap."

> "They pay professional rates for data entry. Software should have done that."

### On the wedge

> "A net-worth dashboard for everyone is a commodity. A financial OS for the self-employed with
> real estate is a wedge."

> "The incumbents can't follow us here without making their product worse for the customer they
> already have."

> "We're not trying to be everyone's money app. We're trying to be one specific person's only
> money app."

### On the achievement

> "Fourteen services, three hundred endpoints, thirty-five screens, three platforms — live in
> production, not a prototype."

> "Every external vendor is one config flag away from on, and one failure away from a graceful
> mock. Nothing here is a rewrite."

> "We built the trust primitives — tamper-evident audit, KMS-backed secrets, separated staff
> access — before we had the users, because those are the things you can't bolt on later."

### On the AI

> "The AI isn't a chatbot bolted on the side. It's grounded in the user's actual numbers — and for
> this customer, generic financial advice is worse than none."

### On the trajectory

> "Dashboard, then advice, then a financial product. We're at the end of step one, and each step
> earns the right to the next."

> "Funding follows traction in the niche, not the idea. The number I'm chasing is weekly actives,
> not features."

### Closers — pick one

> "There are millions of people whose financial life is too complicated for a budgeting app and
> too personal for accounting software. We're building the only thing that fits."

> "The best proof isn't the architecture. It's that this started as my own problem, and nothing on
> the market solved it."

---

## 9. Quick-reference card

Keep this visible during the call.

**Live:** `https://app.terravest.app` · **Tagline:** "All your wealth, one place."
**Who for:** self-employed / business owners with real estate
**Pricing:** Individual $9.99/mo · Business $29.99/mo · 7-day trial · ~2 months free annual
**Scale:** 14 services · 305 endpoints · 82 entities · 174 migrations · 35 screens · 3 platforms
**Code:** ~42,300 lines Java · ~32,000 lines React
**Live integrations:** Plaid (sandbox) · SendGrid email · Gemini AI
**Mocked:** Stripe · Twilio SMS · QuickBooks · push
**Strongest demo moment:** 90-day cash forecast → AR aging → bulk remind overdue
**Most differentiated screen:** Tax (rental depreciation · suspended losses · QBI)
**Biggest risk (own it):** distribution, not product
**Next milestone:** close the security gate → 50–100 weekly actives in the wedge

---

*Companions: [01-PROJECT-OVERVIEW.md](01-PROJECT-OVERVIEW.md) (architecture) ·
[02-COMPLETED.md](02-COMPLETED.md) (what's verified working) ·
[03-PENDING-TASKS.md](03-PENDING-TASKS.md) (honest gaps) ·
[00-GO-LIVE-TODO.md](00-GO-LIVE-TODO.md) (production readiness).*
