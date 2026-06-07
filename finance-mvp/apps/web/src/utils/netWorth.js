// Pure net-worth helpers (no React) — extracted from HomePage so the financial
// logic can be unit-tested in isolation. All functions are side-effect free.

export const NW_ALERT_THRESHOLD = 15; // percent: a fall beyond this flags a downfall

/** Coerce a series entry (number or {value|v}) to a finite number, else NaN. */
function toNum(p) {
  return typeof p === "number" ? p : Number(p?.value ?? p?.v ?? p);
}

/**
 * Detect a significant net-worth decline over the displayed period.
 * Prefers the series (start→now); falls back to the 30d change vs. prior total.
 * Returns { declinePct, alert } where declinePct > 0 means a fall of that many %.
 */
export function computeDownfall(series, total, change, threshold = NW_ALERT_THRESHOLD) {
  const vals = (series || []).map(toNum).filter((n) => !Number.isNaN(n));
  let declinePct = 0;
  if (vals.length >= 2 && vals[0] > 0) {
    declinePct = ((vals[0] - vals[vals.length - 1]) / vals[0]) * 100;
  } else if (total != null && change != null) {
    const prev = total - change;
    if (prev > 0) declinePct = ((prev - total) / prev) * 100;
  }
  return { declinePct, alert: declinePct >= threshold };
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * Signed contribution of each account category to the net-worth change.
 * Assets (cash/investments/real estate) add; debts (credit cards/loans) subtract,
 * so a debt INCREASE is a negative contribution (it dragged net worth down).
 * Returns categories with a non-trivial change, sorted most-negative first.
 */
export function computeContributors(components = {}) {
  const c = components || {};
  return [
    { key: "cash", label: "Cash", icon: "ti ti-cash", value: num(c.cash_change_30d ?? c.cashChange30d) },
    { key: "investments", label: "Investments", icon: "ti ti-chart-line", value: num(c.investments_change_30d ?? c.investmentsChange30d) },
    { key: "real_estate", label: "Real estate", icon: "ti ti-building-estate", value: num(c.real_estate_equity_change_30d ?? c.realEstateEquityChange30d) },
    { key: "credit_cards", label: "Credit cards", icon: "ti ti-credit-card", value: -num(c.credit_cards_change_30d ?? c.creditCardsChange30d) },
    { key: "loans", label: "Loans", icon: "ti ti-businessplan", value: -num(c.loans_change_30d ?? c.loansChange30d) },
  ]
    .filter((x) => Math.abs(x.value) > 0.5)
    .sort((a, b) => a.value - b.value);
}

/**
 * Real upcoming bills derived from scheduled/pending bill-pay intents (soonest
 * first). No mock data — returns [] when nothing is scheduled.
 * `formatDate` is optional; falls back to toLocaleDateString.
 */
export function deriveUpcomingBills(paymentIntents = [], formatDate) {
  return (paymentIntents || [])
    .filter((p) => {
      const status = (p.status || "").toUpperCase();
      const due = p.scheduled_date || p.scheduledDate;
      return (status === "PENDING" || status === "SCHEDULED") && !!due;
    })
    .map((p) => {
      const due = p.scheduled_date || p.scheduledDate;
      let dueLabel = due;
      try { dueLabel = formatDate ? formatDate(new Date(due)) : new Date(due).toLocaleDateString(); } catch { /* keep raw */ }
      return {
        id: p.intent_id || p.id,
        name: p.payee || "Scheduled payment",
        dueDate: dueLabel,
        dueTs: new Date(due).getTime() || 0,
        amount: Number(p.amount) || 0,
        icon: "ti ti-receipt",
        iconClass: "icon-forest",
      };
    })
    .sort((a, b) => a.dueTs - b.dueTs);
}
