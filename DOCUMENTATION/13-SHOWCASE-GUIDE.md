# TerraVest — Complete Showcase & Demo Guide

**One document for presenting TerraVest to investors and end users.** Part 1 is what you say
before you open the app. Part 2 is every feature, individually, with the exact steps to
demonstrate it. Part 3 is the presenter layer — transitions, hooks, and answers. Part 4 covers
better ways to run the demo itself.

**Live:** `https://app.terravest.app` · **Verified:** 2026-07-18
**Full walkthrough:** ~25 min · **Short version:** 10 min (§2.0)

> Navigation labels in this guide are the real ones from the app's sidebar, grouped into the
> three sections you'll actually see: **Finance**, **Real Estate**, and **Settings**.

---

# PART 1 — APP OVERVIEW

## 1.1 What TerraVest is

**TerraVest is a wealth management platform for people who work for themselves.**

One login that holds three things most people keep in three different places: personal net worth,
business finances, and property portfolio. It connects them — because for a self-employed person
with a company and a rental, those were never three separate financial lives. It's one life, split
across tools that weren't built for it.

It ships on **web, iPhone, and Android** from a single codebase.

**Tagline:** *All your wealth, one place.*

## 1.2 The problem

Open with a person, not a market. Give her a name and keep coming back to her — this is the single
biggest thing that stops a demo from becoming a feature list.

> "Let me describe a real customer. Her name is Maria. She's a contractor.
>
> She has an LLC. She takes 1099 work. She owns three rental properties. And she files taxes
> jointly with her husband, who has a normal job.
>
> Now ask Maria a simple question. **How much are you worth?**
>
> She can't answer it. Not because she's bad with money — she's very good with money. But the
> answer is split across four systems that don't talk to each other. To find it, she needs an
> afternoon and a spreadsheet.
>
> And every March she spends a weekend collecting receipts, bank statements, and property numbers
> into a folder for her accountant — then pays that accountant professional rates to type it in.
>
> That's the problem. Not that the tools are bad. It's that no tool covers her whole life. So she
> does the joining by hand. Forever."

## 1.3 Why the existing tools don't fit

| Tool | Built for | Where it fails Maria |
|---|---|---|
| **Mint, Monarch, Copilot** | Someone with a paycheck | No business entity, no P&L, no rental logic. Reads her business spending as personal overspending. |
| **QuickBooks, Xero** | A bookkeeper doing the books | No personal net worth, no investments, no property equity. Answers "how did the business do?" — never "how am I doing?" |
| **Stessa, Baselane** | A landlord, only | Property alone. No business, no personal wealth. |
| **Spreadsheets** | Nobody, badly | Manual, always stale, and unsafe to share. |

**The turn:**
> "Nobody serves the person who has all three. That's who we built for."

## 1.4 Why it matters

Three costs of the gap — use whichever lands with the room:

1. **No single number.** She can't answer "what am I worth?" without an afternoon of work — so she
   never really knows, and can't make decisions from it.
2. **Tax money left on the table.** Rental depreciation, suspended passive losses, the 20% QBI
   deduction, quarterly estimates. These are exactly the levers this customer has, and exactly the
   ones a consumer app never surfaces.
3. **The accountant tax.** She pays professional rates for data assembly software should do.

## 1.5 What we've built

| | |
|---|---|
| **Live** | In production, HTTPS, deployed and monitored |
| **Scale** | 14 backend services · 305 API endpoints · 82 data entities · 174 database migrations |
| **Product** | 35 screens · 26 routes · ~42,300 lines of backend · ~32,000 lines of front-end |
| **Platforms** | Web PWA + iOS + Android from one codebase |
| **Revenue model** | Individual $9.99/mo · Business $29.99/mo · 7-day free trial · ~2 months free annually — built, running, with feature gating live |
| **Languages** | 9, including right-to-left Arabic |

## 1.6 The trajectory

> "Today it's a trusted dashboard. Next is advice — an assistant built for this specific customer.
> After that, a financial product: lending or advisory, sold to people whose complete financial
> picture only we can see.
>
> What I'm chasing right now isn't more features. It's 50 to 100 weekly active users in this niche.
> Traction in the wedge earns the next step."

---

# PART 2 — FEATURE-BY-FEATURE DEMO WALKTHROUGH

Every feature, in demo order. Each entry: **what it is → how to demo it → the line to say.**

**Sequence:** Module A (Personal) → B (Business) → C (Property) → D (Tax & Documents) →
E (Intelligence & Trust) → F (Platform & Business Model).

## 2.0 If you only have 10 minutes

Run features **1 → 11 → 12 → 13 → 25 → 26 → 31**. That's: the one number, the cash forecast, AR
aging, bulk remind, the tax engine, depreciation, and the accountant handoff. If you can keep only
**two**, keep the **90-day cash forecast** and the **tax screen** — those are the two moments
nobody else in the market can show.

---

## MODULE A — Personal Money *(sidebar: Finance)*

### Feature 1 — Net Worth Dashboard ★ CORE
**What it is:** One number — everything owned minus everything owed, across personal, business, and
investment accounts — charted over time with a breakdown of what moved it.

**Demo steps:**
1. Land on **Home** (already logged in before the call starts).
2. Pause on the **net worth figure**. Don't rush past it.
3. Change the **chart range** to show it's live and interactive.
4. Switch the chart type — **Area / Line / Bars**.
5. Open the **"what moved it"** contributor breakdown.
6. Point out the **KPI cards** and **upcoming bills** below the chart.

**Say:**
> "One number. Everything she owns minus everything she owes. This used to take her an afternoon.
> Now it's the home screen. And it doesn't just show the number — it shows why it changed."

**Bonus:** if net worth drops more than 15%, the chart shifts to a warning palette automatically.
Mention it; don't try to trigger it live.

---

### Feature 2 — Account Linking
**What it is:** Connect real bank and brokerage accounts through Plaid. Balances and transactions
flow in and everything else updates from them.

**Demo steps:**
1. Sidebar → **Accounts**.
2. Show the **grouped account cards** and the KPI row above them.
3. Click **Link account** to open the Plaid flow.
4. Select an institution and walk the bank's own login screen.
5. Return to Accounts and show the newly linked account in the list.

**Say:**
> "This is how her money gets in. She picks her bank, logs in on the bank's own secure screen, and
> we never see her password. Balances and transactions flow from there."

---

### Feature 3 — Transactions
**What it is:** Every transaction, filterable, with re-categorization that feeds budgets and taxes.

**Demo steps:**
1. Sidebar → **Transactions**.
2. Filter by **date range**, then by **category**, then by **amount**.
3. Sort a column.
4. **Re-categorize** one transaction and show it update.

**Say:**
> "Every transaction, filterable. And she can re-categorize anything — which matters, because these
> categories feed her budgets and her tax numbers later."

---

### Feature 4 — Budgets
**What it is:** Spending plan with 50/30/20 presets across Needs, Wants, and Savings, with alerts.

**Demo steps:**
1. Sidebar → **Budgets**.
2. Apply the **50/30/20 preset**.
3. Show the **Needs / Wants / Savings** split against actual spend.
4. Change the **period**.
5. Point out an **over-budget alert**.

**Say:**
> "What she planned to spend, against what she actually spent — and it tells her when she's over."

---

### Feature 5 — Debt Lab
**What it is:** Payoff strategy modelling — Avalanche vs Snowball vs Hybrid — with an extra-payment
model and a recommendation.

**Demo steps:**
1. Sidebar → **Debt Lab**.
2. Show the **debts table**.
3. Switch strategy: **Avalanche → Snowball → Hybrid**, reading each explainer.
4. Enter an **extra monthly payment** and show the timeline change.
5. Open the **cross-strategy comparison** — "cheapest" vs "fastest".
6. Point at the **recommended plan**.

**Say:**
> "Avalanche is cheapest. Snowball is fastest to feel like progress. It compares them side by side,
> models paying extra, and recommends one. Most apps show you your debt. This one tells you what to
> do about it."

---

### Feature 6 — Goals
**What it is:** Savings targets with progress tracking and required-monthly math.

**Demo steps:**
1. Sidebar → **Goals**.
2. **Create a goal** — name, target amount, target date.
3. Show the **required monthly contribution** it calculates.
4. Show **progress** on an existing goal.

**Say:**
> "Set a target, and it works out exactly what she needs to put away each month to hit it."

---

### Feature 7 — Calculators
**What it is:** Built-in financial math — mortgage payoff, extra payments, compound and simple
interest.

**Demo steps:**
1. Sidebar → **Calculators**.
2. Run the **mortgage payoff** calculator with a realistic loan.
3. Add an **extra monthly payment** and show interest saved and time cut.
4. Show the **compound interest** calculator.

**Say:**
> "The quick math, built in — so she isn't opening a browser tab mid-decision."

---

### Feature 8 — Investments
**What it is:** Holdings, connected brokers, and alternative investments.

**Demo steps:**
1. Sidebar → **Investments**.
2. Show the **holdings** list.
3. Show **connect a broker**.
4. Open **Alternatives** and add an alternative investment.

**Say:**
> "Her investments — including alternatives, which matters for this customer, because a lot of
> their wealth isn't in a normal brokerage account."

`[MISSING: confirm the Alternatives add-flow fields and whether the Marketplace tab is demo-ready]`

---

### Feature 9 — Cash Position
**What it is:** What's actually liquid right now, with account freshness status.

**Demo steps:**
1. Sidebar → **Cash** *(shown as "Cash & cards" in some builds)*.
2. Show the **cash position** total.
3. Point at the account status indicators — **Healthy / Stale / Action required**.

**Say:**
> "What she actually has liquid — and it flags accounts that have gone stale so the number stays
> trustworthy."

`[MISSING: confirm exact Cash page layout and whether card balances appear here or under My Business]`

---

### Feature 10 — Bill Pay
**What it is:** Multi-step bill payment: payee → amount → funding account → schedule → confirm,
with duplicate protection and cancellation.

**Demo steps:**
1. Sidebar → **Pay Bills**.
2. Step 1: select or add a **payee**.
3. Step 2: enter an **amount**.
4. Step 3: choose the **funding account**.
5. Step 4: pick a **date**.
6. Step 5: **confirm** — show the scheduled payment appear in the list.
7. **Cancel** the scheduled payment to show it's reversible.
8. Point at the **sidebar badge** showing pending payment count.

**Say:**
> "Who she's paying, how much, from which account, and when. It's built to be safe — double-click
> and it won't pay twice, and she can cancel before it goes out."

---

## MODULE B — Business *(sidebar: Finance → My Business)*

> ⚠️ **My Business is behind a feature gate.** Confirm your demo account's plan renders the real
> page and not an upgrade prompt. See §4.2.

### Feature 11 — Multi-Business Command Center ★★ CORE
**What it is:** Each company as its own isolated set of books, plus a combined view, with a health
score across the top.

**Demo steps:**
1. Sidebar → **My Business** → **Overview** tab.
2. Show the **business switcher** — move between entities.
3. Show the **consolidated view** across all businesses.
4. Point at the **business health score**.

**Say:**
> "Here's where we're different from every other money app. This is her LLC as its own set of
> books, completely separate from her personal money. Three companies means three sets of books,
> plus a combined view."

---

### Feature 12 — 90-Day Cash Forecast ★★ CORE
**What it is:** Forward-looking cash projection that detects a shortfall before it happens.
**This is the single strongest moment in the demo.**

**Demo steps:**
1. On **Overview**, scroll to the **90-day cash forecast**.
2. Trace the projection line with your cursor to the **shortfall point**.
3. Stop talking for a beat. Let them read it.

**Say:**
> "This is a 90-day cash forecast. It's telling her that in about nine weeks, she runs tight.
>
> Most business owners find out they have a cash problem when the money is already gone. This tells
> her **while she can still do something about it.** That's the difference between a dashboard and
> a decision."

---

### Feature 13 — AR Aging ★ CORE
**What it is:** Everyone who owes money, bucketed by how overdue they are.

**Demo steps:**
1. From the forecast, click into **AR aging**.
2. Show the **aging buckets** — 30 / 60 / 90+ days.
3. Point at the **most overdue invoice**.

**Say:**
> "And it shows her *why*. These are her unpaid invoices, sorted by how late they are. This one is
> 60 days overdue. That's her cash problem, sitting right there."

---

### Feature 14 — Invoicing & Bulk Reminders ★ CORE
**What it is:** Create and send invoices, give customers a public payment page, reconcile payments
back to bank transactions, and chase every overdue invoice at once.

**Demo steps:**
1. **My Business → Business Tools → Invoices**.
2. **Create an invoice** — customer, line items, amount, due date.
3. **Send it by email** and show the confirmation.
4. Open the **public invoice page** in a second tab, as the customer sees it.
5. Return and click **"Remind all overdue"** — show the bulk confirmation.
6. Show **payment reconciliation** — marking a payment and linking it to a transaction.

**Say:**
> "One click just chased every overdue invoice. Her customer gets a link, opens a payment page, and
> pays. When the money lands, it matches back against her bank transaction automatically.
>
> Problem, reason, and fix — one screen, three clicks. Not a report. A decision."

---

### Feature 15 — Business Transactions Ledger
**What it is:** Period-aware ledger merging linked bank data with manual entries.

**Demo steps:**
1. **My Business → Transactions** tab.
2. Change the **period** and show the figures update.
3. **Add a manual transaction**.
4. Show linked-account and manual entries in one ledger.

**Say:**
> "Her business ledger — bank data and anything she enters by hand, in one place, for whatever
> period she's looking at."

---

### Feature 16 — Business Expenses
**What it is:** Dated, categorized business expenses linked to real transactions, with export.

**Demo steps:**
1. **My Business → Expenses** tab.
2. **Add an expense** — date, category, amount, vendor.
3. **Link it to a transaction**.
4. **Export to CSV**.

**Say:**
> "Every business expense, dated, categorized, and tied back to the real transaction — so at tax
> time there's nothing to reconstruct."

---

### Feature 17 — Business Credit Cards
**What it is:** Business card tracking, separate from personal cards.

**Demo steps:**
1. **My Business → Credit Cards** tab.
2. Show card balances and activity.

**Say:**
> "Business cards tracked separately from personal — which sounds obvious, and is exactly what
> gets messy when you're running both from one wallet."

`[MISSING: add specific demo steps — confirm whether cards are added manually or come from linked accounts]`

---

### Feature 18 — Budgets & Variance
**What it is:** Business spending plan versus actuals.

**Demo steps:**
1. **My Business → Business Tools → Budgets**.
2. **Set a budget** for a category.
3. Show the **variance** against actual spend.

**Say:**
> "What she planned to spend in the business, against what she actually spent."

---

### Feature 19 — Business Goals
**What it is:** Cash reserve and tax set-aside targets.

**Demo steps:**
1. **My Business → Business Tools → Goals**.
2. Set a **cash reserve** target.
3. Set a **tax set-aside** target.
4. Show progress against both.

**Say:**
> "A cash reserve, and a tax set-aside — so the tax money is put away *before* she spends it. Every
> self-employed person has learned that lesson the hard way."

---

### Feature 20 — Vendor Management
**What it is:** Vendor spend, contract status, and renewal alerts.

**Demo steps:**
1. **My Business → Business Tools → Vendors**.
2. Show **computed vendor spend**, ranked.
3. Open a vendor and set **status, renewal date, and notes**.
4. Point at a **renewal alert**.

**Say:**
> "Everyone she pays, what she pays them, and a warning before a contract auto-renews."

---

### Feature 21 — Recurring & Subscription Detection
**What it is:** Automatic detection of repeating charges and subscriptions.

**Demo steps:**
1. **My Business → Business Tools → Recurring**.
2. Show the **detected recurring charges**.
3. Show **per-customer payment behaviour** — who pays on time, who doesn't.

**Say:**
> "It spots subscriptions and repeat charges by itself. And on the income side, it learns which
> customers actually pay on time — which is worth knowing before you take the next job."

---

### Feature 22 — Business Reports
**What it is:** Cash-basis P&L, balance sheet, and cash flow, exportable.

**Demo steps:**
1. **My Business → Reports** tab.
2. Open the **Profit & Loss**.
3. Open the **Balance Sheet**.
4. Open the **Cash Flow** statement.
5. **Export to CSV**, then show **print-to-PDF**.

**Say:**
> "Profit and loss, balance sheet, cash flow — the three statements her accountant will ask for,
> exportable as a spreadsheet or a PDF."

---

### Feature 23 — Business Documents
**What it is:** Per-business document folders and invoice attachments.

**Demo steps:**
1. **My Business → Documents** tab.
2. **Upload a file** to a business folder.
3. Show an **invoice with an attachment**.
4. Show the **All view** across businesses, newest first.

**Say:**
> "Per-business folders, and receipts attached to the invoices they belong to."

---

### Feature 24 — QuickBooks Import
**What it is:** Import existing books from QuickBooks Online.

**Demo steps:**
1. **My Business → Connect QuickBooks**.
2. Show the connection prompt.

**Say:**
> "And if she already keeps books in QuickBooks, it imports — she isn't starting over."

`[MISSING: add demo steps for the post-connection import view — what the user sees once books are pulled in]`

---

## MODULE C — Property *(sidebar: Real Estate)*

### Feature 25 — Property Portfolio ★ CORE
**What it is:** Each property with estimated value, mortgage balance, real equity, and rental
cap rate.

**Demo steps:**
1. Sidebar → **Properties**.
2. Show the **portfolio list** with value, debt, and equity per property.
3. **Add a property** — address, purchase price, mortgage.
4. Show the **auto-estimated value** from market data.
5. Point at the **cap rate** for a rental.

**Say:**
> "Her three rentals. What each is worth, what she still owes, and the equity she actually has —
> plus the yield, so she can see which property is genuinely earning."

---

### Feature 26 — Per-Property Expense Tracker ★ CORE
**What it is:** Dated, categorized expenses per property — the shoebox, digitized.

**Demo steps:**
1. From **Properties**, open a property → **Expenses** drawer.
2. **Add an expense** — date, category, amount.
3. Show the **category breakdown** for the year.
4. **Export** the property's expenses.
5. Show the **portfolio-wide combined tax export** across all properties.

**Say:**
> "Every repair, insurance bill, property tax payment, and management fee — dated and categorized,
> all year long. This is the part that usually lives in a shoebox."

---

### Feature 27 — Deal Room
**What it is:** A passive bulletin-board directory of real-estate listings. Informational only — TerraVest does not vet, endorse, advise on, or facilitate anything listed.

**Demo steps:**
1. Sidebar → **Deal Room**.
2. Browse the **listing directory** — photos and location lead each card.
3. Point out the **red disclaimer banner**: not a broker-dealer, no vetting, no advice.
4. Open a listing — photos, description, **Directory History** of the posting party.
5. **Save** a listing, then **Request Contact Information** (opens their own mail client).

**Say:**
> "A noticeboard for real estate projects. She sees the property, the location, and who posted it.
> If she's interested, she goes to their site or emails them directly — everything happens off
> our platform."

**For investors, add:** *"Deliberately a passive directory: no vetting, no advice, no securities
handling. That keeps it a listing product rather than a regulated intermediary."*

---

### Feature 28 — Fractional LLC
**What it is:** Co-investment marketplace — buy into a property alongside other investors.

**Demo steps:**
1. Sidebar → **Fractional LLC**.
2. Show available **co-investment opportunities**.
3. Open one and show the ownership structure.

**Say:**
> "And she can co-invest in a property alongside other investors, instead of having to buy one
> outright."

`[MISSING: add demo steps for the participation/commit flow — what happens when she joins an LLC]`

---

## MODULE D — Tax & Documents

### Feature 29 — Tax Estimator ★★ CORE
**What it is:** A live, year-round tax picture covering filing status, W-2 income, self-employment
income, investment income, and rentals. **Your most differentiated screen.**

**Demo steps:**
1. Sidebar → **Taxes**.
2. Set **filing status** — choose *Married filing jointly*.
3. Add the spouse's **W-2**.
4. Enter **self-employment / 1099 income**.
5. Show **interest, dividends, long-term capital gains, retirement income**.
6. Show the **running tax estimate** updating as you type.

**Say:**
> "This is her tax picture — live all year, not just in April. Her filing status, her husband's
> W-2, her 1099 income from the business."

---

### Feature 30 — Rental Tax Modelling ★★ CORE
**What it is:** The rental section that no consumer app has — depreciation and suspended loss
carryforward. **Slow down here. This is your differentiation.**

**Demo steps:**
1. On **Taxes**, open the **rental section**.
2. Enter **gross rents collected**.
3. Enter operating costs: **mortgage interest, property tax, insurance, repairs, management fees**.
4. Enter **property cost basis** and **land value**.
5. Enter **prior-year suspended loss (carryforward)**.
6. Show the resulting deduction change in the estimate.

**Say:**
> "Look at what it asks for. **Cost basis and land value** — that's depreciation. Every rental
> owner can deduct part of the building's value every single year. It's one of the biggest
> deductions this customer has.
>
> And **prior-year suspended loss** — when a rental loses money, that loss doesn't disappear. It
> carries forward. Most people forget it exists and never claim it."

---

### Feature 31 — Tax Guidance Engine ★ CORE
**What it is:** Rule-based prompts for deductions and credits this customer qualifies for.

**Demo steps:**
1. On **Taxes**, scroll to the **guidance panel**.
2. Show **Deductions** — claim rental depreciation, track suspended losses, 20% QBI deduction,
   max out tax-advantaged accounts.
3. Show **Credits** — child & dependent care, home energy and EV credits.
4. Show the **quarterly estimated payments** prompt.

**Say:**
> "And it tells her what she's missing. The 20% QBI deduction on her business income. Her quarterly
> estimates. Energy credits.
>
> A normal budgeting app has **no idea** any of these exist. And these are exactly the deductions
> this customer has. That's the whole point of building for a specific person instead of everyone."

**The line that lands the module:**
> "This screen is the difference between an app that watches your money and an app that
> *understands* your money."

---

### Feature 32 — Document Upload & OCR
**What it is:** Upload tax documents; the app extracts values from PDFs and images.

**Demo steps:**
1. On **Taxes**, use the **document upload**.
2. Upload a **W-2** (PDF or photo).
3. Show the **extracted values** populating the form.
4. Show **remove/replace** on an uploaded file.

**Say:**
> "She can photograph a W-2 instead of typing it in."

`[MISSING: confirm OCR extraction accuracy on your demo file and pre-test it — do not attempt this live untested]`

---

### Feature 33 — Document Center ★ CORE
**What it is:** Personal document storage with folders and a cross-app registry that pulls in
documents generated elsewhere in the product.

**Demo steps:**
1. Sidebar → **Documents**.
2. Show the **folder structure**.
3. **Upload a document** to a folder.
4. Show the **cross-app registry** — exports from Real Estate and My Business appearing here.

**Say:**
> "Every financial document in one place — including the exports the app generates for her
> automatically."

---

### Feature 34 — CPA Secure Sharing ★ CORE
**What it is:** Share documents with an accountant via a view-only link with expiry, mandatory
passcode, and a full access log. **The emotional payoff of the whole demo.**

**Demo steps:**
1. From **Documents**, select files → **Share**.
2. Build a **multi-file share set**.
3. Set an **expiry date**.
4. Set the **passcode** (mandatory).
5. Generate the link and **open it in an incognito window** as the accountant.
6. Enter the passcode and show the **view-only** experience.
7. Return and show the **access log** — who opened it and when.

**Say:**
> "Remember Maria's weekend of collecting paperwork? This is that — one link.
>
> View-only. It expires. It needs a passcode. And she can see exactly when her accountant opened
> it. Her whole tax year, sent safely, in about ten seconds — instead of a folder and a weekend,
> and instead of paying an accountant professional rates to do data entry."

---

### Feature 35 — CPA Marketplace
**What it is:** Find and connect with an accountant.

**Demo steps:**
1. Navigate to **/cpa** *(route-only — not in the sidebar; reach it via the Documents/Tax link or the URL)*.
2. Browse **available CPAs**.
3. Open a profile and show the connect flow.

**Say:**
> "And if she doesn't have an accountant, she can find one here."

`[MISSING: confirm the in-app entry point to /cpa so you're not typing a URL during the demo]`

---

## MODULE E — Intelligence & Trust

### Feature 36 — AI Assistant
**What it is:** A financial assistant grounded in the user's actual accounts, business, and
properties — with scope control, response styles, a prompt library, and voice input.

**Demo steps:**
1. Sidebar → **AI Assistant**.
2. Show the **insight cards** on arrival.
3. Ask **one pre-tested question** — e.g. *"How did my business do last month?"*
4. Show the **scope selector** — what the assistant is allowed to see.
5. Show **response styles** and the **prompt library**.
6. Point at the **disclaimer**.

**Say:**
> "An assistant that can actually see her numbers — not generic advice from the internet. She
> controls what it's allowed to look at."

> ⚠️ **Test your exact question before the call.** Never ask an AI a question live that you haven't
> already seen answer well.

---

### Feature 37 — Notifications & Messages
**What it is:** In-app inbox plus email/SMS/push alerts with per-user preference control.

**Demo steps:**
1. Click the **notifications bell** in the topbar — show the dropdown and unread indicator.
2. Click **View all messages** → **Messages** page.
3. Go to **Settings → Notifications** and toggle a preference.
4. Send a **test notification**.

**Say:**
> "Alerts in one inbox, and she controls exactly which ones reach her and how."

---

### Feature 38 — Security Center
**What it is:** Two-factor authentication, active session management, and a readable login history
with device and location.

**Demo steps:**
1. Sidebar → **Security**.
2. Show **two-factor authentication** settings.
3. Show **active sessions**.
4. Show the **login history** — friendly labels, device, time, location.

**Say:**
> "Two-factor, every active session, and a full login history — device, time, and where it came
> from. If something looks wrong, she sees it."

---

### Feature 39 — Audit Trail
**What it is:** A tamper-evident hash chain of every state change, with a verification endpoint
that proves the log wasn't altered. **Strong with technical investors.**

**Demo steps:**
1. Show the user-facing **activity timeline**.
2. For technical audiences, open **`/api/v1/audit/verify`** and show the chain verifying.

**Say:**
> "Every change to an account is written into a cryptographic chain. This endpoint re-walks that
> chain and proves nothing was altered or deleted. Most fintechs retrofit this after their first
> audit. We built it before we had users."

---

### Feature 40 — Data Export & Account Deletion
**What it is:** Full data export and self-service account deletion.

**Demo steps:**
1. **Settings → Data & Privacy**.
2. Trigger a **data export**.
3. Show the **delete account** option — describe it, don't click it.

**Say:**
> "She can export everything or delete her account outright. Her data is hers. We say that, and
> then we make it a button."

---

## MODULE F — Platform & Business Model

### Feature 41 — Profile & Identity
**What it is:** Personal details and identity information, with SSN/EIN encrypted and shown only
as last four digits.

**Demo steps:**
1. Sidebar footer → **Profile**.
2. Show **name and contact details**.
3. Show the **masked SSN/EIN** — last four only.
4. Show **notification preference toggles**.

**Say:**
> "Her identity details are encrypted and only ever displayed as the last four digits — even to
> her."

---

### Feature 42 — Settings, Themes & Languages
**What it is:** Appearance, regional settings, and full internationalization.

**Demo steps:**
1. Sidebar → **Settings**.
2. Cycle the **theme** from the topbar — **Light → Dark → Glass**.
3. Change the **language**; show a right-to-left language such as Arabic.
4. Show **regional settings**.

**Say:**
> "Light, dark, and glass. Nine languages, including right-to-left for Arabic — because this
> customer base isn't only English-speaking."

---

### Feature 43 — Subscription & Plans *(investor close)*
**What it is:** Two-tier subscription with a 7-day trial and live feature gating — built, running,
and repriceable without a deploy.

**Demo steps:**
1. Sidebar → **Subscription**.
2. Show **Individual $9.99/mo** and **Business $29.99/mo**.
3. Show the **7-day trial** and annual pricing (~2 months free).
4. Show the **per-plan feature list**.
5. Mention the **trial-ending banner** and onboarding modal.

**Say:**
> "The plans, the trial, the billing lifecycle, and the feature locks are all built and running.
> And pricing lives in the database, not the code — we can reprice or repackage without a deploy."

---

### Feature 44 — Learn & Guide
**What it is:** In-app educational modules.

**Demo steps:**
1. Topbar **help icon** → **Learn**.
2. Show the **educational modules**.

**Say:**
> "Built-in education, because half of this customer's problem is that nobody ever explained
> depreciation to them."

`[MISSING: add demo steps — confirm which Learn modules have finished content worth showing]`

---

### Feature 45 — Mobile Apps
**What it is:** The same product on iPhone and Android from one codebase, installable as a PWA.

**Demo steps:**
1. Show the app on a **phone** if one is to hand.
2. Otherwise show the **install-to-home-screen** prompt in the browser.

**Say:**
> "Same product on iPhone and Android, from one codebase. She can install it from the browser."

---

### Feature 46 — Ops Portal *(internal — investors only)*
**What it is:** A staff support console with identities fully separate from customer identities,
permission-based access control, caller verification, and an actor/target audit chain.

**Demo steps:**
1. Describe rather than demo — it's a separate login at **/ops**.
2. If showing: **customer 360**, **caller verification with tiered disclosure**, and
   **PII reveal requiring a typed reason**.

**Say:**
> "Support staff have completely separate accounts — a staff token is *refused* on customer routes,
> so an agent's credential can never act as a customer. Revealing a customer's personal data
> requires a typed reason that gets permanently recorded."

`[MISSING: decide whether to show the ops portal at all — recommended only for technical/institutional investors, and only if you have a seeded staff account]`

---

# PART 3 — DEMO SCRIPT NOTES

Presenter layer, in the same order as Part 2.

## 3.1 Before you share your screen

**Do not open the app until the room feels the problem.** Deliver §1.2 (Maria) first — 60 seconds,
no screen. The dashboard is dramatically more impressive to someone who has just been made to feel
the mess it replaces.

Then §1.3 in four fast lines:
> "Mint's built for someone with a paycheck. QuickBooks is built for a bookkeeper. Property apps
> only do property. So she uses a spreadsheet — and a spreadsheet is always out of date."

**Then the turn:** *"Nobody serves the person who has all three."* Now open the app.

## 3.2 Transitions between modules

These carry the narrative. Say them deliberately — they're what makes it a story rather than a tour.

| Between | Say |
|---|---|
| **Overview → Personal (F1)** | "So let me show you what Maria sees on a Monday morning." |
| **Personal → Business (F10 → F11)** | "That's her personal money — and honestly, other apps do a version of that. Here's what nobody else does." |
| **Forecast → AR aging (F12 → F13)** | "And it doesn't just warn her. It shows her *why*." |
| **AR aging → Invoicing (F13 → F14)** | "And she fixes it from the same screen." |
| **Business → Property (F24 → F25)** | "That's the business. Now the third piece — the properties." |
| **Property → Tax (F28 → F29)** | "Now — why does all this property detail matter so much? Because of what it unlocks." |
| **Tax → Documents (F31 → F33)** | "And here's how the year ends." |
| **Documents → Close** | "One link. Instead of a folder and a weekend." |

## 3.3 Pacing

| Module | Time | How to play it |
|---|---|---|
| **A — Personal** (F1–10) | 5 min | Brisk. Establishes competence. Only F1 gets real time. |
| **B — Business** (F11–24) | 7 min | **Slowest section.** F12–14 is your strongest sequence. |
| **C — Property** (F25–28) | 3 min | Steady. Sets up tax. |
| **D — Tax & Docs** (F29–35) | 6 min | **Second-slowest.** F30 is your differentiation — do not rush it. |
| **E — Intelligence** (F36–40) | 2 min | Quick. Shows completeness. |
| **F — Platform** (F41–46) | 2 min | Fast. Close on F43 for investors. |

## 3.4 The three moments that decide the demo

1. **Feature 12 — the cash forecast.** After you say "she runs tight in nine weeks," **stop
   talking for two full seconds.** The silence does the work. Business owners have a physical
   reaction to this screen.
2. **Feature 30 — depreciation and suspended losses.** Slow right down and explain what each one
   *is*. Most people in the room won't know, and teaching them something is what makes the product
   feel expert rather than pretty.
3. **Feature 34 — the CPA link.** This is the emotional payoff. Tie it explicitly back to the
   weekend-with-a-shoebox image from your opening.

## 3.5 Audience hooks

**For users — ask, don't tell.** Turn the last five minutes into a conversation:
- *"How do you track your rentals today?"*
- *"How long does tax preparation take you each year?"*
- *"What's the most annoying part of your money every month?"*
- *"If you could delete one tool you use today, which one?"*

**Write down their answers during the call.** They're worth more than the rest of the demo.

Close for users:
> "You don't need to change how you work. Link your accounts, add your properties once, and it
> keeps itself current. The tax deductions alone — the depreciation, the carried-forward losses,
> the 20% business deduction — usually cover the cost of the app many times over."

**For investors — the "why can't the incumbents do this" beat.** Deliver this after Feature 43:
> "The obvious question is why Mint or QuickBooks doesn't just build this. They can. But it costs
> them their focus. If Monarch adds a P&L, it makes their product worse for the 95% of users who
> have a normal paycheck. If QuickBooks adds personal net worth, it confuses the bookkeeper they
> sell to. Serving this customer means combining three worlds none of them wants to own all three
> of. That gap is our opening."

## 3.6 The close

Return to **Home**. Ending where you started closes the loop visually.

> "So — one login. Her personal net worth. Her business, with a warning before cash runs out. Her
> properties. Her taxes, with the deductions she actually qualifies for. And one safe link to her
> accountant.
>
> For millions of people whose money life is too complicated for a budgeting app — and too personal
> for accounting software."

**Then stop talking.** Silence invites questions. Filling it undoes the ending.

## 3.7 Anticipated questions

**"Isn't this just Mint or Monarch?"**
> "Those are excellent products for someone with a paycheck, and I'd lose that fight — it's a
> crowded market. I'm not in it. They have no concept of a business entity, a P&L, an invoice, or
> rental depreciation. My user has all four."

**"What about QuickBooks? They own small business."**
> "QuickBooks answers 'how is the business doing?' It has no idea what its user is *worth* — no
> personal accounts, no investments, no property equity. For someone whose personal and business
> finances are the same finances, that's half an answer. We integrate with it rather than fight it."

**"How big is the market?"**
> Give the shape — tens of millions of self-employed Americans, a large share owning rental
> property — then pivot: *"But I'm not making the case on market size. I'm making it on traction in
> the niche. Fifty to a hundred weekly actives is the real proof, and it's the honest gate."*

**"Do you have users?"**
> "Not yet at scale — the product went live recently. The next milestone is exactly that. I'd
> rather give you the honest number than a vanity one."

**"What's the moat?"**
> "Three layers. Near term, focus — incumbents can't follow without damaging their core product.
> Medium term, data — once someone's personal, business, and property history lives here, switching
> means rebuilding years of records. Long term, the financial product — if we lend against a picture
> only we can see, that's not a feature anyone copies."

**"How do you handle security?"**
> "JWT auth enforced independently in every service. SSN and EIN encrypted, displayed only as last
> four. Provider secrets in a KMS-backed encrypted store, never in the repo. Services refuse to boot
> on a weak secret. CSP, rate limiting, and a strict CORS allow-list. Every state change in a
> tamper-evident hash chain with a verification endpoint. And staff access completely separated from
> customer identity."

**"Are you SOC 2 compliant?"**
> "No formal certification — that's an audit with real cost, and it's premature before revenue.
> What I've done is build the primitives an audit asks for, early, because they're expensive to
> retrofit: tamper-evident logging, encryption at rest, KMS-backed secrets, separated privileged
> access with recorded reasons, and data export plus deletion. When SOC 2 stands between us and a
> customer, it's a process to run — not an architecture to rebuild."

**"Why so many services? Isn't that over-engineered?"**
> "Partly, and I'll own that. It's service-per-domain because each domain has a different external
> dependency and compliance surface — bank data, tax data, and document sharing shouldn't share a
> blast radius. The cost is operational overhead, which I control by running Compose on a single VM
> rather than Kubernetes."

**"What's the biggest risk?"**
> "Distribution, not product. I've built something this customer needs. I haven't yet proven I can
> reach them efficiently. That's why the milestone is weekly actives, not more features."

## 3.8 Lines worth memorizing

> **The idea:** "All your wealth, one place — personal, business, and property."

> **The problem:** "Every money app assumes your finances are simple. If you work for yourself,
> they never are."

> **The gap:** "Mint doesn't know you own a business. QuickBooks doesn't know you own a house.
> Nobody knows you own both."

> **The best moment:** "It warns you about a cash problem while you can still fix it. That's the
> difference between a dashboard and a decision."

> **The tax line:** "This is the difference between an app that watches your money and an app that
> understands it."

> **The close:** "For the millions of people whose money life is too complicated for a budgeting
> app — and too personal for accounting software."

---

# PART 4 — RUNNING THE DEMO WELL

Answering "is there a better way to go through the steps and demo at the same time?" — yes. Six
things, roughly in order of how much they'll help.

## 4.1 Use two screens — script on one, app on the other

The highest-value change you can make. Share **only the app window**, and keep Part 2 open on a
second screen or a printed page. Never scroll a script in a shared window — it instantly reveals
you're reading, and it kills the sense that you're just showing someone your product.

No second monitor? Print §2 and hold it. Paper doesn't get shared by accident.

## 4.2 Seed a demo account — and verify the feature gate ⚠️

**The single most important prep item.** Empty screens kill demos, and several of your best
features have *nothing to show* without the right data:

| Feature | Needs |
|---|---|
| **F12 cash forecast** | Enough transaction history to project |
| **F13 AR aging** | Invoices that are **genuinely overdue** |
| **F14 bulk remind** | Multiple overdue invoices |
| **F20 vendors** | Recurring vendor payments |
| **F26 property expenses** | A year of dated expenses across 3 properties |
| **F29–31 tax** | Income, W-2, and rental figures filled in |

**⚠️ Critical gate check:** **My Business**, **Deal Room**, and **Fractional LLC** are wrapped in a
`FeatureGate` component. If your demo account is on the wrong plan or its trial has expired, your
flagship screen renders an **upgrade prompt instead of the product**. Log in the day before and
confirm all three render the real page.

Ask me to write a seed script and you'll get a repeatable "Maria" account you can reset before each
call.

## 4.3 Record a backup video

Record the full walkthrough once, cleanly, and have the file open in a background tab. If the site
is slow, a screen freezes, or Wi-Fi drops, you say *"let me show you the recorded version while
that loads"* and keep control of the room. Demos are lost to nerves in that dead air, not to bugs.

It also doubles as an asset you can send afterwards.

## 4.4 Rehearse the three moments, not the whole thing

Don't memorize 46 features. Rehearse **F12, F30, and F34** out loud, twice, until the wording is
automatic. Everything else you can narrate naturally from the app in front of you — but those three
are where a fumble costs you the room.

## 4.5 A one-page cheat card

Keep this visible. It's everything you might blank on:

> **Live:** app.terravest.app · **Tagline:** All your wealth, one place
> **For:** self-employed people with a business and property
> **Pricing:** Individual $9.99 · Business $29.99 · 7-day trial
> **Scale:** 14 services · 305 endpoints · 35 screens · web + iOS + Android
> **Order:** Home → Business (forecast → AR → remind) → Property → Tax → Documents → Close
> **Best moment:** 90-day cash forecast
> **Best screen:** Tax — depreciation, suspended losses, QBI
> **Biggest risk (own it):** distribution, not product
> **Next milestone:** 50–100 weekly actives in the niche

## 4.6 Demo hygiene

- **Log in before the call** and leave the tab open. Never demo through a login or an OTP code —
  you don't want to be waiting on an inbox in front of an audience.
- **Hard-refresh** (Cmd+Shift+R). This is a PWA; a stale cached bundle can load instead of the
  current one.
- **Close every other tab.** Turn off system and browser notifications.
- **Zoom the browser to ~110%.** Financial tables are dense and unreadable in a shrunk-down screen
  share.
- **Pre-open your closing tab** (Subscription for investors) so the ending is clean.
- **Click the whole path once the day before** so nothing surprises you live.
- **Have a second browser profile ready** for the public invoice page (F14) and the CPA share link
  (F34) — showing the recipient's view in incognito is far more convincing than describing it.

## 4.7 Handling questions mid-demo

Take them — a demo that becomes a conversation is going well. But use a parking phrase for anything
that would derail your sequence:

> "Great question — that's actually the next screen, let me show you."
> or
> "Let me park that and come back at the end, because it connects to something I want to show you
> first."

Keep a note open and actually return to parked questions before you close. Not returning is worse
than not taking the question.

---

# APPENDIX — Items still to fill in

Every `[MISSING]` flag in this document, in one place:

| # | Feature | What's needed |
|---|---|---|
| 8 | Investments | Confirm the Alternatives add-flow fields; is Marketplace demo-ready? |
| 9 | Cash Position | Confirm page layout; do card balances live here or under My Business? |
| 17 | Business Credit Cards | Demo steps — are cards added manually or pulled from linked accounts? |
| 24 | QuickBooks Import | Demo steps for the post-connection import view |
| 28 | Fractional LLC | Demo steps for the participation/commit flow |
| 32 | Document OCR | Pre-test extraction on your actual demo file before showing it live |
| 35 | CPA Marketplace | Confirm the in-app entry point (route is not in the sidebar) |
| 44 | Learn & Guide | Which modules have finished content worth showing? |
| 46 | Ops Portal | Decide whether to show it; needs a seeded staff account if so |

**Also verify before any demo:**
- [ ] My Business / Deal Room / Fractional LLC render past the `FeatureGate` on your demo account
- [ ] The AI Assistant answers your exact planned question well
- [ ] The demo account has overdue invoices, or F13 and F14 have nothing to show
