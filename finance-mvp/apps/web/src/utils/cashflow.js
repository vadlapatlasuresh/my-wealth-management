// Pure personal cash-flow helpers (no React), unit-testable in isolation. Side-effect free.
// SIGN CONVENTION (Plaid, stored raw — the API does not flip it): amount > 0 is money OUT
// (a charge), < 0 is money IN (income). Verified against the data and the backend's
// RecurringBillDetector. feature_key: individual.cashflow.

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Bucket transactions into the last `months` calendar months (oldest → newest).
 * Returns [{ key, label, income, spend, net }]; months with no activity are included
 * as zeroes so the chart has a continuous axis.
 */
export function monthlyBuckets(transactions = [], months = 6) {
  const now = new Date();
  const buckets = [];
  const index = new Map();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const b = { key: monthKey(d), label: MONTHS[d.getMonth()], income: 0, spend: 0, net: 0 };
    buckets.push(b);
    index.set(b.key, b);
  }
  for (const t of transactions || []) {
    if (!t.date) continue;
    const d = new Date(t.date);
    if (Number.isNaN(d.getTime())) continue;
    const b = index.get(monthKey(d));
    if (!b) continue;
    const amt = num(t.amount);
    if (amt > 0) b.spend += amt; else b.income += -amt;
  }
  for (const b of buckets) b.net = b.income - b.spend;
  return buckets;
}

/** Average monthly income & spend across buckets that had any activity. */
export function averages(buckets = []) {
  const active = buckets.filter((b) => b.income > 0 || b.spend > 0);
  if (active.length === 0) return { avgIncome: 0, avgSpend: 0, avgNet: 0 };
  const sum = active.reduce(
    (a, b) => ({ income: a.income + b.income, spend: a.spend + b.spend }),
    { income: 0, spend: 0 }
  );
  const avgIncome = sum.income / active.length;
  const avgSpend = sum.spend / active.length;
  return { avgIncome, avgSpend, avgNet: avgIncome - avgSpend };
}

/**
 * Safe-to-spend: liquid cash on hand minus known upcoming commitments (scheduled bills).
 * A deliberately conservative, honest number — what's left after what you already owe soon.
 */
export function safeToSpend(liquidCash = 0, upcomingBillsTotal = 0) {
  return num(liquidCash) - num(upcomingBillsTotal);
}

const DAY = 24 * 3600 * 1000;
const txLabel = (t) => t.name || t.description || t.merchant || "Transaction";
const txCat = (t) => (t.category || "Uncategorized").trim() || "Uncategorized";

/**
 * Income grouped by source (category) within the last `days`, largest first.
 * Income is amount < 0 (see SIGN CONVENTION). Returns [{ name, total, share }].
 */
export function incomeBySource(transactions = [], days = 365) {
  const cutoff = Date.now() - days * DAY;
  const totals = {};
  let grand = 0;
  for (const t of transactions || []) {
    const amt = num(t.amount);
    if (amt >= 0) continue; // only inflows
    const ts = t.date ? new Date(t.date).getTime() : NaN;
    if (Number.isNaN(ts) || ts < cutoff) continue;
    const key = txCat(t);
    const v = -amt;
    totals[key] = (totals[key] || 0) + v;
    grand += v;
  }
  return Object.entries(totals)
    .map(([name, total]) => ({ name, total, share: grand > 0 ? total / grand : 0 }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Build a Sankey model for cash flow: income sources → an aggregate "Income" node →
 * expense categories. Matches the reference layout (money in on the left, categories on
 * the right). `spendByCategory` is passed in (from utils/spending) to avoid a cycle.
 *
 * Returns { nodes:[{id,label,value,side,color}], links:[{source,target,value}] } where
 * side ∈ 'in' | 'hub' | 'out'. Empty income or spend yields an empty model.
 */
export function cashFlowSankey({ income = [], spend = [], colorFor = () => "#8FA0AE", maxOut = 8 } = {}) {
  const inTotal = income.reduce((s, i) => s + num(i.total), 0);
  const outTotal = spend.reduce((s, i) => s + num(i.total), 0);
  if (inTotal <= 0 && outTotal <= 0) return { nodes: [], links: [], inTotal: 0, outTotal: 0, net: 0 };

  // Collapse a long expense tail into "Other" so the diagram stays readable.
  const sortedOut = [...spend].sort((a, b) => num(b.total) - num(a.total));
  const head = sortedOut.slice(0, maxOut);
  const tail = sortedOut.slice(maxOut);
  const tailTotal = tail.reduce((s, i) => s + num(i.total), 0);
  const outNodes = head.map((s) => ({ name: s.category ?? s.name, total: num(s.total) }));
  if (tailTotal > 0) outNodes.push({ name: "Other", total: tailTotal });

  const nodes = [];
  const links = [];
  income.forEach((i) => {
    const id = `in:${i.name}`;
    nodes.push({ id, label: i.name, value: num(i.total), side: "in", color: colorFor(i.name) });
    links.push({ source: id, target: "hub", value: num(i.total) });
  });
  nodes.push({ id: "hub", label: "Income", value: inTotal, side: "hub", color: "var(--tv-positive)" });
  outNodes.forEach((o) => {
    const id = `out:${o.name}`;
    nodes.push({ id, label: o.name, value: o.total, side: "out", color: colorFor(o.name) });
    links.push({ source: "hub", target: id, value: o.total });
  });
  return { nodes, links, inTotal, outTotal, net: inTotal - outTotal };
}
