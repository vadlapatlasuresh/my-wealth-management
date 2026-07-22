// Pure smart-alert / anomaly-detection helpers (no React), unit-testable in isolation.
// Side-effect free. Sign convention matches the app (TransactionsPage): amount >= 0 is
// money IN, < 0 is money OUT (spend). feature_key: individual.smartAlerts.

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const DAY = 24 * 3600 * 1000;

function normalize(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
function median(nums) {
  const a = [...nums].sort((x, y) => x - y);
  if (!a.length) return 0;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

// Normalize the transaction list into spend events {name, key, amount(+), ts, category}.
function spendEvents(transactions = []) {
  const out = [];
  for (const t of transactions || []) {
    const amt = num(t.amount);
    if (amt >= 0) continue; // only outflows
    const ts = t.date ? new Date(t.date).getTime() : NaN;
    if (Number.isNaN(ts)) continue;
    out.push({
      name: t.name || t.description || t.merchant || "Transaction",
      key: normalize(t.name || t.description || t.merchant),
      amount: -amt,
      ts,
      category: (t.category || "").toLowerCase(),
    });
  }
  return out;
}

/**
 * Detect anomalies from linked accounts + transactions. Returns alerts sorted
 * most-severe first: { key, severity: 'high'|'medium', icon, tone, title, detail, route }.
 * Deliberately conservative thresholds so alerts stay trustworthy (few, real).
 */
export function detectAlerts({ accounts = [], transactions = [] } = {}, opts = {}) {
  const LOW_BALANCE = opts.lowBalance ?? 200;
  const DUP_WINDOW_DAYS = opts.dupWindowDays ?? 4;
  const LARGE_MULT = opts.largeMult ?? 3;
  const LARGE_MIN = opts.largeMin ?? 75;
  const HIKE_MULT = opts.hikeMult ?? 1.15;

  const alerts = [];
  const events = spendEvents(transactions);
  const now = Date.now();

  // 1) Low balance on a spending account (HIGH).
  for (const a of accounts || []) {
    if ((a.type || "").toLowerCase() !== "depository") continue;
    const bal = num(a.currentBalance ?? a.balance);
    if (bal < LOW_BALANCE) {
      alerts.push({
        key: `low-${a.id ?? a.name}`, severity: "high", tone: "red", icon: "ti ti-alert-triangle",
        title: "Low balance",
        detail: `${a.name || "An account"} is at ${fmt(bal)}.`,
        route: "/accounts",
      });
    }
  }

  // 2) Possible duplicate charge — same merchant + amount within a few days (HIGH).
  const seenDup = new Set();
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i], b = events[j];
      if (a.key && a.key === b.key && Math.abs(a.amount - b.amount) < 0.01 &&
          Math.abs(a.ts - b.ts) <= DUP_WINDOW_DAYS * DAY && a.ts !== b.ts) {
        const id = `${a.key}-${a.amount}-${Math.round(Math.min(a.ts, b.ts) / DAY)}`;
        if (seenDup.has(id)) continue;
        seenDup.add(id);
        alerts.push({
          key: `dup-${id}`, severity: "high", tone: "red", icon: "ti ti-copy",
          title: "Possible duplicate charge",
          detail: `${a.name} charged ${fmt(a.amount)} twice within ${DUP_WINDOW_DAYS} days.`,
          route: "/transactions",
        });
      }
    }
  }

  // 3) Unusually large charge vs the category norm, in the last 30 days (MEDIUM).
  const byCategory = {};
  for (const e of events) (byCategory[e.category] = byCategory[e.category] || []).push(e.amount);
  const catMedian = {};
  for (const [c, arr] of Object.entries(byCategory)) catMedian[c] = median(arr);
  for (const e of events) {
    if (now - e.ts > 30 * DAY) continue;
    const med = catMedian[e.category] || 0;
    if (med > 0 && e.amount > LARGE_MULT * med && e.amount > LARGE_MIN) {
      alerts.push({
        key: `large-${e.key}-${Math.round(e.ts / DAY)}`, severity: "medium", tone: "amber", icon: "ti ti-flame",
        title: "Unusually large charge",
        detail: `${e.name} — ${fmt(e.amount)}, well above your usual ${e.category || "spending"}.`,
        route: "/transactions",
      });
    }
  }

  // 4) Recurring price increase — merchant seen >=3 times, latest well above the norm (MEDIUM).
  const byMerchant = {};
  for (const e of events) if (e.key) (byMerchant[e.key] = byMerchant[e.key] || []).push(e);
  for (const arr of Object.values(byMerchant)) {
    if (arr.length < 3) continue;
    const sorted = [...arr].sort((x, y) => x.ts - y.ts);
    const latest = sorted[sorted.length - 1];
    const prior = sorted.slice(0, -1).map((e) => e.amount);
    const med = median(prior);
    if (med >= 5 && latest.amount >= HIKE_MULT * med && now - latest.ts <= 45 * DAY) {
      const pct = Math.round(((latest.amount - med) / med) * 100);
      alerts.push({
        key: `hike-${latest.key}`, severity: "medium", tone: "amber", icon: "ti ti-arrow-up-right",
        title: "Price went up",
        detail: `${latest.name} rose ${pct}% to ${fmt(latest.amount)} vs your usual ${fmt(med)}.`,
        route: "/recurring",
      });
    }
  }

  const rank = { high: 0, medium: 1 };
  alerts.sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9));
  return alerts;
}

function fmt(n) {
  return Number(n || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
