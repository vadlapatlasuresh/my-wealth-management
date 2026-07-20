# 12 — Application Walkthrough Script (Full Product)

**What this is:** a screen-by-screen script for demoing the **whole** TerraVest product live — to
**users** and to **investors**. It tells you what to click, what to say, and what to point at.

**This version walks every major feature**, including the ones whose external provider is still
running in sandbox/demo mode. Those features are fully built — screens, flows, data model, and
logic all work. §8 gives you the exact language for them, so you can show everything with
confidence.

> Companion: [11-SHOWCASE-AND-DEMO-PREP.md](11-SHOWCASE-AND-DEMO-PREP.md) for positioning,
> one-liners, and the full Q&A bank.

**Timing:** full walkthrough ≈ **22 minutes**. Stops marked **★ CORE** are the ones to keep if you
only have 10. See §6 for the short version.

---

## 1. The idea — say this before you share your screen

Do not open the app yet. Say this first. It takes 40 seconds.

> "TerraVest is a money app for people who work for themselves.
>
> If you have a job with a paycheck, there are a hundred apps for you. But if you run your own
> business, or own rental property, or both — none of them fit. Your business is in one place.
> Your properties are in a spreadsheet. Your personal accounts are somewhere else. And once a
> year you put it all in a folder for your accountant.
>
> TerraVest puts all three in one place — personal, business, and property — and connects them.
> Because for a self-employed person, those were never three separate things. It is one financial
> life, split across tools that were not built for them."

**Then pause.** Let it land. Then open the app.

---

## 2. The problem — the story to tell

Use a real person. Give her a name and keep referring to her. This is the single biggest thing
that stops a demo from becoming a boring feature list.

> "Let me describe a real customer. Her name is Maria. She is a contractor.
>
> She has an LLC. She takes 1099 work. She owns three rental properties. And she files taxes
> jointly with her husband, who has a normal job.
>
> Now — ask Maria a simple question. **How much are you worth?**
>
> She cannot answer it. Not because she is bad with money. She is very good with money. But the
> answer is split across four systems that do not talk to each other. To find it, she needs an
> afternoon and a spreadsheet.
>
> And every March, she spends a weekend collecting receipts, bank statements, and property
> numbers into a folder for her accountant — and then pays that accountant professional rates to
> type it all in.
>
> That is the problem. Not that the tools are bad. It is that no tool covers her whole life. So
> she does the joining by hand. Forever."

### Why the existing tools don't work — one line each

> - "Mint and Monarch are built for someone with a paycheck. They don't know what a business is."
> - "QuickBooks is built for a bookkeeper. It tells her how the business did. It has no idea what
>   *she* is worth."
> - "Property apps only do property."
> - "So she uses a spreadsheet. And a spreadsheet is always out of date."

**Then the turn:**

> "Nobody serves the person who has all three. That is who we built for."

---

## 3. The walkthrough

Format for each stop: **① what you click → ② what you say → ③ what to point at.**

---

## ACT 1 — "Know what you're worth" (personal money) · ~5 min

### ★ CORE — STOP 1 · Home · 90 seconds

**Click:** Land on Home after login. (Be logged in *before* the call starts.)

**Say:**
> "This is the first thing Maria sees. One number. Everything she owns, minus everything she owes.
> Personal accounts, business accounts, investments — all of it.
>
> Remember, this used to take her an afternoon. Now it is the home screen."

**Point at:**
- The **net worth number** — sit on it a second, don't rush
- The **chart** — change the date range so they see it is live
- The **"what moved it"** contributors — *"it doesn't just show the number. It shows why it changed."*
- The **alert behaviour** — *"and if net worth drops sharply, the chart changes colour and tells her."*

---

### STOP 2 · Accounts & linking · 90 seconds

**Click:** Accounts → **Link account** → run the Plaid flow.

**Say:**
> "This is how her money gets in. She connects her bank the same way you would in any modern
> finance app — she picks her bank, logs in through the bank's own secure screen, and we never see
> her password.
>
> Balances and transactions flow in from there, and everything else in the app updates from it."

**Point at:** grouped account cards, the KPIs at the top.

> *(Say once, lightly: "We're connected in sandbox mode for this walkthrough, so this is test bank
> data rather than my real accounts.")*

---

### STOP 3 · Transactions · 45 seconds

**Click:** Transactions.

**Say:**
> "Every transaction, filterable by date, amount, or category. And she can re-categorize anything —
> which matters, because those categories feed her budgets and her tax numbers later."

---

### STOP 4 · Plan, Debt Lab, Goals & Calculators · 2 minutes

Move quickly through these four. They're table stakes — show competence, don't dwell.

**Click:** Plan/Budget:
> "Budgets — needs, wants, savings, with alerts when she goes over."

**Click:** Debt Lab — *this one is worth 45 seconds:*
> "This is the debt lab. She puts in her debts, and it shows her the two real strategies —
> avalanche, which is cheapest, and snowball, which is fastest to feel like progress. It compares
> them side by side, models paying extra each month, and recommends one.
>
> Most apps show you your debt. This one tells you what to do about it."

**Click:** Goals:
> "Set a target, and it works out how much she needs to put away each month to hit it."

**Click:** Calculators:
> "Mortgage payoff, extra payments, compound interest — the quick math, built in."

---

### STOP 5 · Invest & Cash · 45 seconds

**Click:** Invest, then Cash.

**Say:**
> "Her investments — holdings, connected brokers, and alternative investments, which matters for
> this customer because a lot of their wealth isn't in a normal brokerage account.
>
> And her cash position, so she always knows what is actually liquid."

---

### STOP 6 · Bill Pay · 60 seconds

**Click:** Bill Pay → walk the multi-step flow: payee → amount → funding → schedule → confirm.

**Say:**
> "Paying bills. Pick who she's paying, how much, which account it comes from, and when.
>
> It's built to be safe — if she double-clicks, it won't pay twice, and she can cancel a scheduled
> payment before it goes out."

> *(Framing: "The payment flow is complete and running against our payment provider's sandbox — we
> switch it to live processing per customer.")*

---

## ACT 2 — "Run the business" · ~6 min

### ★★ CORE — STOP 7 · My Business · 5 minutes

**This is your most important stop. Give it the most time. Rehearse it out loud twice.**

**Click:** My Business → **Overview** tab.

**Say:**
> "Now here is where we are different from every other money app.
>
> This is Maria's business — as its own set of books. Her LLC lives here, completely separate from
> her personal money. If she had three companies, there would be three, plus a combined view."

**Point at the health score, then go straight to the forecast:**

> "But look at this. This is a **90-day cash forecast**.
>
> It is telling her that in about nine weeks, she runs tight on cash.
>
> This is the moment that matters. Most business owners find out they have a cash problem when the
> money is already gone. This tells her **while she can still do something about it.** That is the
> difference between a dashboard and a decision."

**Then show the cause.** Click **AR aging**:
> "And it shows her *why*. These are her unpaid invoices, sorted by how late they are. This one is
> 60 days overdue. That is her cash problem, sitting right there."

**Then the action.** **Business Tools → invoicing → "Remind all overdue":**
> "And she fixes it from the same screen. One click just chased every overdue invoice. Her customer
> gets a link, opens a payment page, and pays. When the money arrives, it matches back against her
> bank transaction automatically."

**Say the summary line — the sentence people remember:**
> "Problem, reason, and fix — on one screen, in three clicks. Not a report. A decision."

**Then the depth (90 seconds, keep moving):**

- **Reports:** *"Profit and loss, balance sheet, cash flow — export as a spreadsheet or print to PDF."*
- **Expenses:** *"Every business expense, dated, categorized, tied to the real transaction."*
- **Credit Cards:** *"Business cards tracked separately from personal."*
- **Budgets & variance:** *"What she planned to spend versus what she actually spent."*
- **Business goals:** *"A cash reserve target, and a tax set-aside — so the tax money is put away before she spends it."*
- **Vendors:** *"Everyone she pays, what she pays them, and a warning before a contract auto-renews."*
- **Recurring detection:** *"It spots subscriptions and repeat charges automatically."*
- **Documents:** *"Per-business folders, and invoice attachments."*
- **QuickBooks:** *"And if she already keeps books in QuickBooks, it imports."*

---

## ACT 3 — "Property, tax, and the payoff" · ~7 min

### ★ CORE — STOP 8 · Real Estate · 2 minutes

**Click:** Real Estate.

**Say:**
> "Maria's three rentals. What each is worth, what she still owes, and the equity she actually has.
> Plus the rental yield — the cap rate — so she can see which property is actually earning."

**Click:** add or open a property → show the **auto-valuation**:
> "It estimates the property value automatically from market data, so she isn't guessing or
> updating a spreadsheet twice a year."

**Click:** into a property's **expense tracker**:
> "And underneath each property — every expense. Repairs, insurance, property tax, management fees.
> Dated and categorized, all year long.
>
> This is the part that usually lives in a shoebox."

**Set up the next stop:**
> "Now — why does this matter so much? Because of what it unlocks."

---

### STOP 9 · Deal Room & Fractional LLC · 60 seconds

**Click:** Deal Room.

**Say:**
> "And a simple bulletin board of real estate projects. She can browse listings, see the photos and
> the location, look at what else that party has listed, and save the ones she likes.
>
> Two things she can do on any listing: open the poster's own site in a new tab, or get their email
> and write to them herself. We're a noticeboard — we don't vet listings, we don't advise, and
> nothing is transacted here."

*(For investors, add: "This is also a future revenue line — we sit between sponsors and qualified
investors we already know the financial picture of.")*

---

### ★★ CORE — STOP 10 · Tax · 3 minutes

**Your most differentiated screen. Nothing on the market does this for this customer.**

**Click:** Tax.

**Say:**
> "This is Maria's tax picture — live all year, not just in April.
>
> Her filing status. Her husband's W-2. Her 1099 income from the business. And then her rentals."

**Scroll into the rental section and slow down:**

> "Look at what it asks for. Gross rents. Mortgage interest. Property tax. Insurance. Repairs.
> Management fees. And then these two:
>
> **Cost basis and land value** — that is **depreciation**. Every rental owner can deduct part of
> the building's value every single year. It is one of the biggest deductions this customer has.
>
> And **prior-year suspended loss** — when a rental loses money, that loss doesn't disappear. It
> carries forward. Most people forget it exists and never claim it."

**Then the guidance panel:**
> "And it tells her what she is missing. The **20% QBI deduction** on her business income. Her
> quarterly estimated payments. Child and dependent care. Energy and EV credits.
>
> Now think about this. A normal budgeting app has **no idea** any of these exist. And these are
> exactly the deductions this customer has. That is the whole point of building for a specific
> person instead of everyone."

**Land it:**
> "This screen is the difference between an app that watches your money and an app that
> understands your money."

---

### ★ CORE — STOP 11 · Documents & the accountant handoff · 90 seconds

**Click:** Documents → create a secure share link.

**Say:**
> "And here is how the year ends.
>
> Remember Maria's weekend of collecting paperwork? This is that — one link.
>
> It is view-only. It expires. It needs a passcode. And she can see exactly when her accountant
> opened it."

**Point at:** expiry, passcode, access log.

> "Her whole tax year, sent safely, in about ten seconds. Instead of a folder and a weekend — and
> instead of paying an accountant professional rates to do data entry."

**Then:** CPA Marketplace:
> "And if she doesn't have an accountant, she can find one here."

---

## ACT 4 — "The rest of the product" · ~3 min

Move briskly. This section exists to show the product is complete, not to explore.

### STOP 12 · AI Assistant · 60 seconds

**Click:** AI Assistant. Ask one **pre-tested** question, e.g. *"How did my business do last month?"*

**Say:**
> "An assistant that can actually see her numbers. Not generic advice from the internet — grounded
> in her real accounts, her business, and her properties.
>
> She can set what it's allowed to look at, choose how detailed the answers are, use voice, and
> pull from a library of common questions."

> ⚠️ **Test your exact question before the call.** Never ask an AI a question live that you haven't
> already seen answer well.

---

### STOP 13 · Messages, Security, Settings, Profile · 60 seconds

**Click:** Messages → Security → Settings.

**Say:**
> "Her inbox for alerts. Her security — two-factor authentication, active sessions, and a login
> history showing every sign-in, the device, and where it came from.
>
> Settings — notification preferences, light, dark and glass themes, language. The app runs in nine
> languages including right-to-left for Arabic.
>
> And under privacy, she can export all of her data or delete her account outright. Her data is
> hers."

---

### STOP 14 · Subscription & mobile · 45 seconds

**Click:** Subscription.

**Say:**
> "Two plans — Individual and Business — both with a seven-day free trial."

**Then mention mobile (only show if asked):**
> "And this is the same product on iPhone and Android, from one codebase. Install it from the
> browser or the app stores."

---

### STOP 15 · Close · 1 minute

**Click:** back to **Home**. Ending where you started closes the loop visually.

**Say:**
> "So — one login.
>
> Her personal net worth. Her business, with a warning before cash runs out. Her properties. Her
> taxes, with the deductions she actually qualifies for. And one safe link to her accountant.
>
> For millions of people whose money life is too complicated for a budgeting app — and too personal
> for accounting software."

**Then stop talking.** Let the silence invite questions.

---

## 4. Changing the ending for your two audiences

Same walkthrough. Only the last two minutes change.

### ▶ For USERS

They care about one thing: **does this solve my problem?**

**Add at the close:**
> "You don't need to change how you work. Link your accounts, add your properties once, and it
> keeps itself current. The tax deductions alone — the depreciation, the carried-forward losses,
> the 20% business deduction — usually cover the cost of the app many times over."

**Then turn it into a conversation.** A user demo should end with you listening:
- *"How do you track your rentals today?"*
- *"How long does tax preparation take you each year?"*
- *"What is the most annoying part of your money every month?"*
- *"If you could delete one of the tools you use today, which one?"*

Their answers are worth more than the rest of the call. **Write them down during the call.**

### ▶ For INVESTORS

They care about: **is this a business?**

**The "why can't the big guys do this" beat:**
> "The obvious question is why Mint or QuickBooks doesn't just build this.
>
> They can. But it costs them their focus. If Monarch adds a profit-and-loss statement, it makes
> their product worse for the 95% of their users who have a normal paycheck. If QuickBooks adds
> personal net worth, it confuses the bookkeeper they sell to.
>
> Serving this customer means combining three different worlds — personal, business, and property.
> None of them wants to own all three. That gap is our opening."

**Then the money — already in the product, so show it.** Click **Subscription**:
> "Nine ninety-nine a month for individuals, twenty-nine ninety-nine for business, seven-day free
> trial, about two months free if you pay annually. The plans, the trial, the billing, and the
> feature locks are all built and running. And pricing lives in the database, so we can reprice or
> repackage without touching code."

**Then the plan:**
> "Where this goes: today it is a trusted dashboard. Next is advice — an assistant built for this
> specific customer. And after that, a financial product — lending or advisory — sold to people
> whose complete financial picture only we can see.
>
> What I'm chasing right now is not more features. It's fifty to a hundred weekly active users in
> this niche. Traction in the wedge earns the next step."

**If they ask what you'd do with money:**
> "Turn on the remaining live integrations, and put the rest into reaching this customer. The
> product is already broader than the traction justifies."

---

## 5. Every feature, in one line

For when someone asks "what else does it do?"

### Personal
| Feature | Say this |
|---|---|
| **Net worth** | "Everything you own minus everything you owe, updating by itself." |
| **Accounts** | "All your bank and investment accounts in one list." |
| **Transactions** | "Every transaction, filterable, and you can re-categorize any of them." |
| **Budget** | "What you planned to spend versus what you actually spent." |
| **Debt Lab** | "Shows you the cheapest way to clear your debts versus the fastest — and what paying extra does." |
| **Goals** | "Set a target, it tells you the monthly amount to hit it." |
| **Calculators** | "Mortgage payoff, compound interest — the quick math built in." |
| **Invest** | "Holdings, brokers, and alternative investments." |
| **Cash** | "What you actually have liquid." |
| **Bill Pay** | "Schedule a payment, cancel it before it goes, never pay twice by accident." |

### Business
| Feature | Say this |
|---|---|
| **Multi-business** | "Three companies means three separate sets of books, plus a combined view." |
| **Health score** | "One score for how the business is really doing." |
| **90-day forecast** | "Warns you about a cash shortage months before it happens." |
| **AR aging** | "Everyone who owes you money, sorted by how late they are." |
| **Invoicing** | "Send an invoice, your customer gets a payment page, the payment matches back to your bank automatically." |
| **Bulk reminders** | "Chase every overdue invoice in one click." |
| **Reports** | "Profit and loss, balance sheet, cash flow — export or print." |
| **Budgets & variance** | "Business spending plan versus reality." |
| **Business goals** | "Cash reserve and tax set-aside targets." |
| **Vendors** | "Who you pay, how much, and a warning before contracts renew." |
| **Expenses** | "Every business expense, categorized and linked to the real transaction." |
| **QuickBooks** | "Already have books? It imports." |

### Property & tax
| Feature | Say this |
|---|---|
| **Properties** | "Value, mortgage, real equity, and rental yield per property." |
| **Auto-valuation** | "Property values estimated from market data, so you're not guessing." |
| **Property expenses** | "Every repair and bill, per property, all year — instead of a shoebox." |
| **Tax estimator** | "Your tax picture all year — depreciation, carried-forward rental losses, and the 20% business deduction." |
| **Documents** | "Everything in folders, one secure link to your accountant." |
| **CPA sharing** | "View-only, expires, needs a passcode, and you see when they opened it." |
| **CPA Marketplace** | "Don't have an accountant? Find one." |
| **Deal Room** | "A bulletin board of real estate listings. Informational only — we don't vet or broker anything." |
| **Fractional LLC** | "Co-invest in a property instead of buying it alone." |

### Everything else
| Feature | Say this |
|---|---|
| **AI Assistant** | "An assistant that can see your actual numbers, not generic advice." |
| **Messages** | "Your alerts in one inbox." |
| **Security** | "Two-factor, active sessions, and a full login history." |
| **Settings** | "Themes, nine languages, notification preferences." |
| **Data & privacy** | "Export everything, or delete your account entirely." |
| **Subscription** | "Two plans, seven-day free trial." |
| **Mobile** | "Same app on iPhone and Android." |

---

## 6. The short version (10 minutes)

Cut to the four **★ CORE** stops:

1. **Idea + problem** — no screen (2 min)
2. **Home** — the one number (1 min)
3. **My Business** — forecast → AR aging → bulk remind (4 min)
4. **Tax** — depreciation, suspended losses, QBI (2 min)
5. **Close** (1 min)

If you can only keep **two** things: the **cash forecast** and the **tax screen**. Those are the
two moments nobody else in the market can show.

---

## 7. Before every demo — the checklist

- [ ] **Seed the demo account with real-looking data.** More important than everything else here.
      Empty screens kill demos. You need: 3 properties with expenses, a business with ~12 invoices
      — **some deliberately overdue**, or AR aging and bulk-remind have nothing to show — and a few
      months of transactions.
- [ ] **Log in before the call and leave the tab open.** Never demo through a login or an OTP code.
- [ ] **Hard-refresh** (Cmd+Shift+R). This is a PWA — an old cached version can load instead of the
      current one.
- [ ] **Check `https://app.terravest.app` loads** the morning of.
- [ ] **Test the AI question you plan to ask.** Your local config says `mock` while the deploy notes
      say Gemini is live — confirm which is true on the VM, and test your exact question.
- [ ] **Click through the full path once** the day before, so nothing surprises you live.
- [ ] **Pre-open your closing tab** (Subscription for investors).
- [ ] **Practice STOP 7 out loud, twice.** Strongest sequence, easiest to fumble.
- [ ] **Close other tabs, turn off notifications.**

---

## 8. How to talk about sandbox-mode features

Some features run against a provider's **sandbox** rather than live production credentials —
payments, SMS, QuickBooks sync, property valuation, push notifications. The features themselves are
fully built: the screens, the flows, the data model, and the logic are all real and all yours.

**Show them. Just describe them accurately** — which is easy, because the accurate description is
also the impressive one.

### The one phrase that covers everything

> **"That's running in sandbox mode for this walkthrough — the flow is complete, and we switch the
> provider to live per customer."**

Say it once, lightly, the first time it's relevant. Don't repeat it at every screen and don't
apologize for it. Sandbox mode is completely normal for a demo — every fintech demos this way,
because nobody moves real money on a sales call.

### The one line to avoid

Don't say a payment **"just went through"** or that money **"has been sent"** when it hasn't. Say
**"scheduled"** or **"submitted"** instead. The distinction costs you nothing in the demo, and it
matters — particularly with investors, where overstating what's live is the kind of thing that
damages a deal later when it surfaces during diligence.

The same goes for the **demo account itself**: mention once that it's a demo account with test
data. Nobody expects your real net worth on a call, and saying so protects every number on screen
from being read as a live customer metric.

### If someone asks "is this real or a prototype?"

Answer with the split — it's a genuinely strong answer:

> "The product is real and it's live in production. Most of what you just saw runs entirely on our
> own logic with nothing external at all — net worth, budgets, the debt strategies, all the business
> reporting, invoicing, the tax engine, document sharing. That's the majority of the product.
>
> Where we connect to outside providers — banks, payments, accounting imports — some are live and
> some are on sandbox credentials while we finish commercial agreements. Every one of them is a
> configuration switch, not a rebuild, because they're all built behind a common interface."

That answer tells the truth and demonstrates architectural maturity at the same time.

---

## 9. The lines worth memorizing

Learn these five. Everything else you can say in your own words.

> **The idea:** "All your wealth, one place — personal, business, and property."

> **The problem:** "Every money app assumes your finances are simple. If you work for yourself,
> they never are."

> **The gap:** "Mint doesn't know you own a business. QuickBooks doesn't know you own a house.
> Nobody knows you own both."

> **The best moment:** "It warns you about a cash problem while you can still fix it. That is the
> difference between a dashboard and a decision."

> **The close:** "For the millions of people whose money life is too complicated for a budgeting
> app — and too personal for accounting software."
