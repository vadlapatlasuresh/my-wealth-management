// Pure financial-health-score helpers (no React) so the scoring logic is unit-testable
// in isolation. Side-effect free. Feature key: individual.healthScore.
//
// SIGN CONVENTION (Plaid, stored raw — the API does not flip it): a transaction
// `amount > 0` is money OUT (a charge/debit), `< 0` is money IN (income/credit).
// Verified against the data (an Uber ride is +5.40) and the backend's own
// RecurringBillDetector, which treats amount.signum() > 0 as a recurring charge.

const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function accountBalance(a) {
  return num(a.currentBalance ?? a.balance ?? 0);
}
function accountType(a) {
  return (a.type || "").toLowerCase();
}

/**
 * Split linked accounts into liquid cash, total assets, and total debt.
 * Depository = cash/liquid + asset; investment/other-positive = asset; credit/loan = debt.
 */
export function summarizeAccounts(accounts = []) {
  let liquidCash = 0, assets = 0, debt = 0;
  for (const a of accounts || []) {
    const bal = accountBalance(a);
    const type = accountType(a);
    if (type === "credit" || type === "loan") {
      debt += Math.abs(bal);
    } else if (type === "depository") {
      liquidCash += bal;
      assets += bal;
    } else {
      // investment / other — count positive balances as assets.
      assets += Math.max(0, bal);
    }
  }
  return { liquidCash, assets, debt };
}

/**
 * Monthly income & spend from recent transactions, normalized to a month.
 * Uses the last `windowDays` of history (default 90) and scales to 30 days so a
 * partial window still yields a sensible monthly figure. Returns nulls when there
 * isn't enough signal to judge (no dated transactions).
 */
export function monthlyCashFlow(transactions = [], windowDays = 90) {
  const now = Date.now();
  const cutoff = now - windowDays * 24 * 3600 * 1000;
  let income = 0, spend = 0, earliest = now, count = 0;
  for (const t of transactions || []) {
    const ts = t.date ? new Date(t.date).getTime() : NaN;
    if (Number.isNaN(ts) || ts < cutoff) continue;
    const amt = num(t.amount);
    if (amt > 0) spend += amt; else income += -amt;
    if (ts < earliest) earliest = ts;
    count++;
  }
  if (count === 0) return { monthlyIncome: null, monthlySpend: null };
  // Scale the observed window up to a 30-day month (min 30 days to avoid over-scaling).
  const spanDays = Math.max(30, (now - earliest) / (24 * 3600 * 1000));
  const factor = 30 / spanDays;
  return { monthlyIncome: income * factor, monthlySpend: spend * factor };
}

function band(score) {
  if (score >= 80) return "Great";
  if (score >= 60) return "Good";
  if (score >= 40) return "Fair";
  return "Needs work";
}

/**
 * Compute an overall 0-100 financial health score plus a per-factor breakdown.
 * Only factors we have data for are scored; the overall is a weighted average over
 * exactly those, so a thin account (no transactions yet) doesn't get a misleading 0.
 *
 * Returns { score|null, band, factors:[{key,label,score,band,detail,action,icon,weight}],
 *           computable:boolean }.
 */
export function computeHealthScore({ accounts = [], transactions = [], snapshot = null } = {}) {
  const { liquidCash, assets, debt } = summarizeAccounts(accounts);
  const { monthlyIncome, monthlySpend } = monthlyCashFlow(transactions);
  const factors = [];

  // 1) Savings rate — (income - spend) / income. Weight 30.
  if (monthlyIncome != null && monthlyIncome > 0) {
    const rate = (monthlyIncome - monthlySpend) / monthlyIncome; // e.g. 0.18
    const s = clamp((rate / 0.2) * 100); // 20%+ savings => 100
    factors.push({
      key: "savings", label: "Savings rate", icon: "ti ti-pig-money", weight: 30, score: s, band: band(s),
      detail: `${Math.round(rate * 100)}% of income kept`,
      action: s >= 80 ? "You're saving well — keep it up." : "Aim to keep 20% of income. Trim recurring spend to get there.",
    });
  }

  // 2) Emergency fund — months of expenses in liquid cash. Weight 30.
  if (monthlySpend != null && monthlySpend > 0) {
    const months = liquidCash / monthlySpend;
    const s = clamp((months / 6) * 100); // 6 months => 100
    factors.push({
      key: "emergency", label: "Emergency fund", icon: "ti ti-umbrella", weight: 30, score: s, band: band(s),
      detail: `${months.toFixed(1)} month${months.toFixed(1) === "1.0" ? "" : "s"} of expenses saved`,
      action: s >= 80 ? "Solid cushion for surprises." : "Build toward 3–6 months of expenses in an easy-access account.",
    });
  }

  // 3) Debt load — total debt vs total assets. Weight 25.
  if (assets > 0 || debt > 0) {
    const ratio = assets > 0 ? debt / assets : 1; // 0 = debt-free, 1 = debt equals assets
    const s = clamp((1 - ratio) * 100);
    factors.push({
      key: "debt", label: "Debt load", icon: "ti ti-scale", weight: 25, score: s, band: band(s),
      detail: debt === 0 ? "No linked debt" : `Debt is ${Math.round(ratio * 100)}% of your assets`,
      action: s >= 80 ? "Debt is well under control." : "Prioritize high-interest balances — the Debt Lab can model a payoff.",
    });
  }

  // 4) Net worth — positive and, ideally, trending up. Weight 15.
  // Only when we actually have some signal (linked accounts or a snapshot); otherwise a
  // truly empty profile would still score, which is misleading.
  const netWorth = snapshot?.netWorth ?? snapshot?.totalNetWorth ?? snapshot?.total ?? (assets - debt);
  const nwChange = snapshot?.change30d ?? snapshot?.netWorthChange30d ?? null;
  if ((accounts && accounts.length > 0) || snapshot != null) {
    let s;
    if (num(netWorth) <= 0) s = 15;
    else s = nwChange != null ? (nwChange >= 0 ? 90 : 55) : 70; // growing > flat/unknown > shrinking
    factors.push({
      key: "networth", label: "Net worth", icon: "ti ti-trending-up", weight: 15, score: s, band: band(s),
      detail: num(netWorth) <= 0 ? "Below zero — assets under debts" : nwChange != null ? (nwChange >= 0 ? "Trending up" : "Trending down") : "Positive",
      action: s >= 80 ? "Your net worth is growing." : "Grow the gap between assets and debts over time.",
    });
  }

  if (factors.length === 0) {
    return { score: null, band: null, factors: [], computable: false };
  }

  const totalWeight = factors.reduce((w, f) => w + f.weight, 0);
  const score = Math.round(factors.reduce((sum, f) => sum + f.score * f.weight, 0) / totalWeight);
  return { score, band: band(score), factors, computable: true };
}
