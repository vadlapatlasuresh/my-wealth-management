// Pure helpers for the Recurring & subscriptions radar (no React), unit-testable.
//
// The backend detector (account-aggregation RecurringBillDetector) infers subscriptions from
// transaction HISTORY, which needs ~3 consistent occurrences before it will claim anything. On a
// freshly linked account that is legitimately empty — but the app already KNOWS about real
// recurring obligations sitting on the linked credit cards and loans (minimum payment + next due
// date come straight from Plaid). Surfacing those means the screen is useful on day one instead
// of showing nothing until months of history accumulate.

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Account types that carry a recurring payment obligation. */
const OBLIGATION_TYPES = ["credit", "loan"];

export function isObligationAccount(a) {
  return OBLIGATION_TYPES.includes(String(a?.type || "").toLowerCase());
}

/**
 * Turn linked credit cards / loans into recurring-bill-shaped items, so they can sit alongside
 * detected subscriptions in one list. Only accounts that actually state an amount are included —
 * we never invent a payment figure.
 *
 * Shape matches the detector's: { name, amount, cadence, nextDate, occurrences, source }.
 */
export function obligationsFromAccounts(accounts = []) {
  const out = [];
  for (const a of accounts || []) {
    if (!isObligationAccount(a)) continue;
    const amount = num(a.minimumPayment ?? a.minPayment);
    if (amount <= 0) continue; // no stated minimum → nothing honest to show
    out.push({
      name: a.name || a.officialName || "Account payment",
      amount,
      cadence: "MONTHLY",
      nextDate: a.nextPaymentDueDate || a.next_payment_due_date || null,
      occurrences: null,
      source: "account",
      accountId: a.id,
      mask: a.mask || null,
      balance: num(a.currentBalance ?? a.balance),
    });
  }
  return out;
}

/**
 * Merge detected subscriptions with account obligations into one list, soonest first.
 * Detected items keep their own identity (`source: 'detected'`) so the UI can explain where each
 * row came from rather than presenting inferred and known data as the same thing.
 */
export function mergeRecurring(detected = [], obligations = []) {
  const items = [
    ...(detected || []).map((d) => ({ ...d, source: d.source || "detected" })),
    ...(obligations || []),
  ];
  const ts = (d) => {
    if (!d) return Number.MAX_SAFE_INTEGER;
    const t = new Date(d).getTime();
    return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
  };
  return items.sort((a, b) => ts(a.nextDate) - ts(b.nextDate));
}

/** Monthly-equivalent cost so weekly/yearly items can be summed honestly. */
const MONTHLY_FACTOR = { WEEKLY: 52 / 12, BIWEEKLY: 26 / 12, MONTHLY: 1, YEARLY: 1 / 12 };

export function monthlyEquivalent(amount, cadence) {
  const f = MONTHLY_FACTOR[String(cadence || "MONTHLY").toUpperCase()] ?? 1;
  return num(amount) * f;
}

export function monthlyTotal(items = []) {
  return (items || []).reduce((s, i) => s + monthlyEquivalent(i.amount, i.cadence), 0);
}
