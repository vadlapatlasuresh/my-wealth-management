# Replace ALL mock/placeholder data with real data — execution checklist

Goal: every screen shows data computed from real sources (user-entered, linked
accounts, or persisted history) — no hardcoded/synthetic/mock values.

**Key reality:** a finance app's "real" data comes from one of two places:
1. **Linked institutions via Plaid** — needs `PLAID_CLIENT_ID`/`PLAID_SECRET`
   (Plaid *sandbox* keys are free and give real-shaped test data), **or**
2. **Manual entry** by the user (accounts, properties, businesses).
Everything else (net worth, budgets, debt, charts) is *derived* from those two.

Legend:  ⬜ todo   🔑 needs a credential you provide   🛠 pure code (no key)

---

## PHASE 1 — Stop faking the math (pure code, real inputs already exist) 🛠

These compute from data already in the system; today they return hardcoded or
zero values. Highest impact, no external keys.

- ⬜ **1. Net-worth components are real, not zero/hardcoded**
  `financial-core-service/FinancialCoreService.java` hardcodes
  `change30dNetWorth=15732, change30dCash=2320, …` and sets
  `investments/loans/realEstate = BigDecimal.ZERO`.
  → Pull investments + loans from account-aggregation accounts (by type), real
  estate from real-estate-service, and compute each component from real balances.

- ⬜ **2. Real 30-day change + net-worth history (the chart)**
  `generateTimeSeriesPoints(...)` returns a synthetic curve; `change30d` is a
  constant. → Add a `net_worth_snapshot` table + a daily job that persists the
  computed net worth; serve the chart series and `change30d` from real history.
  (Until enough history exists, label it honestly as "building history".)

- ⬜ **3. Budget alerts are computed, not empty**
  `BudgetService` returns `Collections.emptyList()` for alerts.
  → Compute over/under-budget alerts from real budget lines vs. real spend.

- ⬜ **4. Upcoming bills are real**
  `HomePage.jsx` `upcomingBills = []` (was hardcoded).
  → Derive from real recurring/scheduled payment intents (payment-service) and
  detected recurring transactions; show an honest empty state when none.

- ⬜ **5. Stock holdings are real**
  `InvestPage` "Stocks" + `snapshot.holdings` are empty because investments=0.
  → Surface real investment-account holdings from account-aggregation; if none
  linked, show an empty state (not fake tickers).

---

## PHASE 2 — Frontend pages on local hardcoded data → real endpoints 🛠

- ⬜ **6. Investments → Alternatives** — `InvestPage MOCK_OFFERINGS` is a static
  array. → Back with a real offerings/holdings endpoint, or empty state.
- ⬜ **7. Deal Room** — `DealRoomPage.jsx` is fully hardcoded. → Real deals
  endpoint (or honest empty state + "add deal").
- ⬜ **8. Fractional LLC** — `FractionalLLCPage.jsx` self-contained mock. → Real
  endpoint or empty state.
- ⬜ **9. Security** — `SecurityPage.jsx` mocked 2FA + no events. → Wire real
  login/security events from **audit-service**; make 2FA real (or hide it).
- ⬜ **10. Broker "sync"** — `InvestPage.syncBroker` just stamps a timestamp.
  → Real refresh via the linked-account sync, or remove the fake button.

---

## PHASE 3 — Provider integrations (mock until you add credentials) 🔑

Each already has a real provider implementation that auto-activates when its key
is present; otherwise it falls back to a mock. Supply keys in `.env`
(see `.env.cross-platform.example`).

- ⬜ **11. Plaid (bank accounts + transactions)** 🔑 `PLAID_CLIENT_ID`,
  `PLAID_SECRET` (sandbox is fine to start). Without this, accounts/transactions
  are only what the user enters manually.
- ⬜ **12. AI insights + assistant** 🔑 `ANTHROPIC_API_KEY` (+ `AI_PROVIDER=anthropic`).
  Falls back to `MockAiProvider` today.
- ⬜ **13. Notifications: SMS / Email / Push** 🔑 Twilio (or SNS) / SendGrid (or
  SES) / FCM-APNs. `notification-service` uses Mock*Provider until set.
- ⬜ **14. Signup SMS OTP** 🔑 real SMS (Twilio) — `OtpService` returns the code
  in dev today.
- ⬜ **15. Payments / Bill Pay** 🔑 Stripe (or Plaid Transfer) — payment-service
  is mock without keys.
- ⬜ **16. Business financials (My Business)** 🔑 QuickBooks Online OAuth —
  `MockBusinessDataProvider` until connected.

---

## PHASE 4 — Cleanup 🛠

- ⬜ **17. Delete dead mock path** — `api.js` `MOCK` object + `USE_MOCK` (already
  `false`); remove so it can't drift back on.
- ⬜ **18. Remove legacy mock route** — `api-gateway` route to `integrator-java`
  (`getMockAccounts`, not deployed to prod).

---

### Suggested execution order
Do **Phase 1 (1→5)** first — biggest visible win, no keys. Then **Phase 2 (6→10)**.
Then **Phase 3** as you supply each key (Plaid first — it feeds everything).
**Phase 4** cleanup last.
