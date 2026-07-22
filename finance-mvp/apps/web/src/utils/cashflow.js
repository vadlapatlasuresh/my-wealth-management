// Pure personal cash-flow helpers (no React), unit-testable in isolation. Side-effect free.
// Sign convention matches the rest of the app (TransactionsPage): amount >= 0 is money IN,
// < 0 is money OUT. feature_key: individual.cashflow.

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
    if (amt >= 0) b.income += amt; else b.spend += -amt;
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
