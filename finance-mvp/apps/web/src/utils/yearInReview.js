// Year-in-Review ("Wrapped for your money") — pure, side-effect-free, unit-testable.
// Phase 4. Computes a shareable annual recap entirely client-side from transactions,
// mirroring the retention utils (spending.js / cashflow.js). Money figures are our own
// math, never a model.
//
// SIGN CONVENTION (Plaid, stored raw): amount > 0 is money OUT (a charge),
// amount < 0 is money IN (income). Consistent with spending.js / cashflow.js.

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const label = (t) => t.name || t.description || t.merchant || "Transaction";
const cat = (t) => String(t.category || "Uncategorized").trim() || "Uncategorized";

/** Distinct years present in the data that have at least one charge, newest first. */
export function availableYears(transactions = []) {
  const years = new Set();
  for (const t of transactions || []) {
    if (!t.date) continue;
    const d = new Date(t.date);
    if (Number.isNaN(d.getTime())) continue;
    years.add(d.getFullYear());
  }
  return [...years].sort((a, b) => b - a);
}

/**
 * Full recap for one calendar `year`.
 * @param topN how many named categories to keep before collapsing the rest into "Other".
 * Returns:
 *   { year, hasData, transactionCount, totalSpent, totalIncome, net,
 *     topCategories: [{ category, total, share }],           // largest first
 *     months: [{ label, monthIndex, total, segments:[{key,value}] }],  // Jan..Dec, stacked-ready
 *     topMerchants: [{ name, total, count }],
 *     biggestMonth: { label, total } | null,
 *     avgPerMonth, biggestPurchase: { name, amount, category } | null }
 */
export function yearInReview(transactions = [], year, { topN = 6 } = {}) {
  const inYear = [];
  for (const t of transactions || []) {
    if (!t.date) continue;
    const d = new Date(t.date);
    if (Number.isNaN(d.getTime()) || d.getFullYear() !== year) continue;
    inYear.push({ t, d });
  }

  let totalSpent = 0, totalIncome = 0;
  const catTotals = {};
  const merchants = {};
  let biggestPurchase = null;

  for (const { t } of inYear) {
    const amt = num(t.amount);
    if (amt > 0) {
      totalSpent += amt;
      const c = cat(t);
      catTotals[c] = (catTotals[c] || 0) + amt;
      const name = label(t);
      merchants[name] = merchants[name] || { name, total: 0, count: 0 };
      merchants[name].total += amt;
      merchants[name].count += 1;
      if (!biggestPurchase || amt > biggestPurchase.amount) {
        biggestPurchase = { name, amount: amt, category: c };
      }
    } else if (amt < 0) {
      totalIncome += -amt;
    }
  }

  const topCategories = Object.entries(catTotals)
    .map(([category, total]) => ({ category, total, share: totalSpent > 0 ? total / totalSpent : 0 }))
    .sort((a, b) => b.total - a.total);

  const named = new Set(topCategories.slice(0, topN).map((c) => c.category));

  // Per-month stacked segments over the top-N categories (+ Other), Jan..Dec.
  const months = MONTHS.map((lab, mi) => ({ label: lab, monthIndex: mi, total: 0, _seg: {} }));
  for (const { t, d } of inYear) {
    const amt = num(t.amount);
    if (amt <= 0) continue;
    const m = months[d.getMonth()];
    const key = named.has(cat(t)) ? cat(t) : "Other";
    m._seg[key] = (m._seg[key] || 0) + amt;
    m.total += amt;
  }
  // Order segments consistently: top categories first, then Other.
  const order = [...named, "Other"];
  for (const m of months) {
    m.segments = order
      .filter((k) => m._seg[k] > 0)
      .map((k) => ({ key: k, value: m._seg[k] }));
    delete m._seg;
  }

  const activeMonths = months.filter((m) => m.total > 0);
  const biggestMonth = activeMonths.length
    ? activeMonths.reduce((a, b) => (b.total > a.total ? b : a))
    : null;

  const topMerchants = Object.values(merchants)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  return {
    year,
    hasData: totalSpent > 0 || totalIncome > 0,
    transactionCount: inYear.length,
    totalSpent,
    totalIncome,
    net: totalIncome - totalSpent,
    topCategories,
    months,
    topMerchants,
    biggestMonth: biggestMonth ? { label: biggestMonth.label, total: biggestMonth.total } : null,
    avgPerMonth: activeMonths.length ? totalSpent / activeMonths.length : 0,
    biggestPurchase,
  };
}
