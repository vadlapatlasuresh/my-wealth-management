// Pure spending-insight helpers (no React), unit-testable in isolation. Side-effect free.
// SIGN CONVENTION (Plaid, returned unflipped by the API): amount > 0 is money OUT (a
// charge), < 0 is money IN. feature_key: individual.spendInsights.

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const DAY = 24 * 3600 * 1000;

const label = (t) => t.name || t.description || t.merchant || "Transaction";
const cat = (t) => (t.category || "Uncategorized").trim() || "Uncategorized";

/** Charges only (positive amounts) with a usable date, newest first. */
export function charges(transactions = []) {
  const out = [];
  for (const t of transactions || []) {
    const amt = num(t.amount);
    if (amt <= 0) continue;
    const ts = t.date ? new Date(t.date).getTime() : NaN;
    if (Number.isNaN(ts)) continue;
    out.push({ name: label(t), category: cat(t), amount: amt, ts });
  }
  return out.sort((a, b) => b.ts - a.ts);
}

/** Total spend within the last `days`. */
export function totalSpend(transactions = [], days = 30) {
  const cutoff = Date.now() - days * DAY;
  return charges(transactions).reduce((s, c) => (c.ts >= cutoff ? s + c.amount : s), 0);
}

/**
 * Spend grouped by category within the last `days`, largest first.
 * Returns [{ category, total, share }] where share is 0..1 of the period's spend.
 */
export function spendByCategory(transactions = [], days = 30) {
  const cutoff = Date.now() - days * DAY;
  const totals = {};
  let grand = 0;
  for (const c of charges(transactions)) {
    if (c.ts < cutoff) continue;
    totals[c.category] = (totals[c.category] || 0) + c.amount;
    grand += c.amount;
  }
  return Object.entries(totals)
    .map(([category, total]) => ({ category, total, share: grand > 0 ? total / grand : 0 }))
    .sort((a, b) => b.total - a.total);
}

/** Top merchants by spend within the last `days`. */
export function topMerchants(transactions = [], days = 30, limit = 5) {
  const cutoff = Date.now() - days * DAY;
  const acc = {};
  for (const c of charges(transactions)) {
    if (c.ts < cutoff) continue;
    const k = c.name;
    acc[k] = acc[k] || { name: k, total: 0, count: 0 };
    acc[k].total += c.amount;
    acc[k].count += 1;
  }
  return Object.values(acc).sort((a, b) => b.total - a.total).slice(0, limit);
}

function monthWindow(offset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - offset, 1).getTime();
  const end = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1).getTime();
  return { start, end };
}

/**
 * Per-category this-month vs last-month comparison, biggest mover first.
 * Only returns categories that moved meaningfully (>= minPct and >= minAbs) so the
 * screen surfaces signal, not noise. deltaPct is null when there's no prior spend.
 */
export function monthOverMonth(transactions = [], { minPct = 15, minAbs = 25 } = {}) {
  const cur = monthWindow(0);
  const prev = monthWindow(1);
  const c = {}, p = {};
  for (const ch of charges(transactions)) {
    if (ch.ts >= cur.start && ch.ts < cur.end) c[ch.category] = (c[ch.category] || 0) + ch.amount;
    else if (ch.ts >= prev.start && ch.ts < prev.end) p[ch.category] = (p[ch.category] || 0) + ch.amount;
  }
  const out = [];
  for (const category of new Set([...Object.keys(c), ...Object.keys(p)])) {
    const current = c[category] || 0;
    const previous = p[category] || 0;
    const diff = current - previous;
    if (Math.abs(diff) < minAbs) continue;
    const deltaPct = previous > 0 ? (diff / previous) * 100 : null;
    if (deltaPct !== null && Math.abs(deltaPct) < minPct) continue;
    out.push({ category, current, previous, diff, deltaPct });
  }
  return out.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}
