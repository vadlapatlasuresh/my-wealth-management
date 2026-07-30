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
 * Portfolio "lenses" for the net-worth chart filter. Each lens is derived from
 * the real snapshot — no fabricated numbers. `id` matches the <select> value;
 * `metricLabel` is the summary-grid headline; `color` recolors the chart; the
 * asset/liability breakdown drives sentiment (a debt rise is a fall).
 *
 * Only lenses backed by real data are returned: `business` appears solely when
 * the snapshot actually carries business net assets, so no empty tile is shown.
 *
 * `opts.realEstateEquity` / `opts.realEstateEquityChange` let the caller pass
 * the property-derived equity it already computes (more precise than the
 * snapshot component when properties are loaded).
 */
export function derivePortfolios(snapshot = {}, opts = {}) {
  const s = snapshot || {};
  const c = s.components || {};
  const nwTotal = num(s.net_worth?.total ?? s.netWorth?.total);
  const nwChange = num(s.net_worth?.change_30d ?? s.netWorth?.change30d);

  const reEquity = opts.realEstateEquity != null
    ? num(opts.realEstateEquity)
    : num(c.real_estate_equity ?? c.realEstateEquity);
  const reEquityChange = opts.realEstateEquityChange != null
    ? num(opts.realEstateEquityChange)
    : num(c.real_estate_equity_change_30d ?? c.realEstateEquityChange30d);

  const businessValue = num(c.business_net_assets ?? c.businessNetAssets);

  const lenses = [
    { id: "all", label: "All (Net Worth)", metricLabel: "Current net worth", color: "var(--tv-forest)", value: nwTotal, change: nwChange, liability: false },
    { id: "investments", label: "Investments Only", metricLabel: "Portfolio value (investments)", color: "#6B46C1", value: num(c.investments), change: num(c.investments_change_30d ?? c.investmentsChange30d), liability: false },
    { id: "cash", label: "Cash & Liquid", metricLabel: "Cash & liquid balances", color: "#1E5FAD", value: num(c.cash), change: num(c.cash_change_30d ?? c.cashChange30d), liability: false },
    { id: "realestate", label: "Real Estate Equity", metricLabel: "Real estate equity", color: "#C9973A", value: reEquity, change: reEquityChange, liability: false },
    { id: "business", label: "Business Financials", metricLabel: "Business net assets", color: "#2E7D5B", value: businessValue, change: num(c.business_net_assets_change_30d ?? c.businessNetAssetsChange30d), liability: false, requiresData: true },
    { id: "debt", label: "Credit & Debt (Liabilities)", metricLabel: "Total credit & debt (liabilities)", color: "#E05252", value: num(c.credit_cards ?? c.creditCards), change: num(c.credit_cards_change_30d ?? c.creditCardsChange30d), liability: true },
  ];

  return lenses.filter((l) => !l.requiresData || Math.abs(l.value) > 0.5);
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
