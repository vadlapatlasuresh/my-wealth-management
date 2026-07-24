// Investment insights — pure, side-effect-free, unit-testable. Phase 4.
// Allocation, concentration, diversification, fee drag and drift-from-target, all
// derived from the user's REAL holdings. Nothing is advice; nothing is fabricated.
//
// Fees: we only estimate expense ratios for funds we recognize from a small table of
// PUBLIC, static expense ratios. Everything else is reported as "not covered" and a
// coverage % is surfaced, so the number is honest rather than a guess. Individual
// stocks and unknown tickers are simply excluded from the fee calc.

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Public, well-known fund expense ratios (annual %, as a fraction). Static facts.
export const EXPENSE_RATIOS = {
  VOO: 0.0003, VTI: 0.0003, IVV: 0.0003, SPY: 0.0009, VUG: 0.0004, VTV: 0.0004,
  QQQ: 0.0020, VXUS: 0.0008, VEA: 0.0005, VWO: 0.0008, SCHD: 0.0006, VIG: 0.0006,
  BND: 0.0003, AGG: 0.0003, VGT: 0.0010, VNQ: 0.0012, VYM: 0.0006, VT: 0.0007,
  ARKK: 0.0075, VBR: 0.0007, VO: 0.0004, VB: 0.0005, IJH: 0.0005, IJR: 0.0006,
};

// Default target mix (fraction). A neutral growth model; the page can override it.
export const DEFAULT_TARGET = [
  { key: "stocks", label: "Stocks & ETFs", target: 0.8 },
  { key: "alternatives", label: "Alternatives", target: 0.1 },
  { key: "cash", label: "Cash", target: 0.1 },
];

const marketValueOf = (h) =>
  h.value != null ? num(h.value) : num(h.qty) * num(h.price);

const isCash = (h) => String(h.symbol || "").toUpperCase() === "CASH";

/**
 * @param holdings  [{ symbol, name, qty, price, value?, costBasis?, broker? }]
 * @param altsTotal total market value of alternative investments (from the alts list)
 * @param target    optional target mix override (same shape as DEFAULT_TARGET)
 */
export function computeInvestmentInsights({ holdings = [], altsTotal = 0, target = DEFAULT_TARGET } = {}) {
  let stocks = 0, cash = 0;
  const positions = [];
  for (const h of holdings || []) {
    const mv = marketValueOf(h);
    if (mv <= 0) continue;
    if (isCash(h)) { cash += mv; continue; }
    stocks += mv;
    positions.push({ symbol: h.symbol || "—", name: h.name || h.symbol || "Holding", value: mv });
  }
  const alts = num(altsTotal);
  const totalValue = stocks + cash + alts;

  if (totalValue <= 0) {
    return {
      hasData: false, totalValue: 0, positions: [], positionCount: 0, effectiveHoldings: 0,
      mix: [], concentration: null, fees: null, drift: [], alerts: [],
    };
  }

  // Position weights + concentration + effective-holdings (inverse Herfindahl).
  positions.sort((a, b) => b.value - a.value);
  const invested = stocks; // concentration is about the equity sleeve you actively hold
  let hhi = 0;
  for (const p of positions) {
    p.weight = invested > 0 ? p.value / invested : 0;
    hhi += p.weight * p.weight;
  }
  const effectiveHoldings = hhi > 0 ? 1 / hhi : 0;
  const top = positions[0] || null;
  const concentration = top
    ? { topSymbol: top.symbol, topName: top.name, topWeight: top.weight, flagged: top.weight > 0.25 }
    : null;

  // Mix vs target.
  const mixValues = { stocks, alternatives: alts, cash };
  const mix = target.map((t) => ({
    key: t.key, label: t.label, value: mixValues[t.key] || 0,
    pct: totalValue > 0 ? (mixValues[t.key] || 0) / totalValue : 0,
  }));
  const drift = target.map((t) => {
    const current = totalValue > 0 ? (mixValues[t.key] || 0) / totalValue : 0;
    const diff = current - t.target;
    return { key: t.key, label: t.label, current, target: t.target, diff, flagged: Math.abs(diff) > 0.15 };
  });

  // Fees over recognized funds only, with an honest coverage %.
  let coveredValue = 0, weightedErValue = 0, knownCount = 0;
  for (const p of positions) {
    const er = EXPENSE_RATIOS[String(p.symbol).toUpperCase()];
    if (er == null) continue;
    coveredValue += p.value;
    weightedErValue += p.value * er;
    knownCount += 1;
  }
  const weightedExpenseRatio = coveredValue > 0 ? weightedErValue / coveredValue : 0;
  const fees = {
    weightedExpenseRatio,
    annualEstimate: weightedErValue, // $/yr on the covered sleeve
    coveredValue,
    coveragePct: stocks > 0 ? coveredValue / stocks : 0,
    knownCount,
  };

  // Alerts, most-severe first.
  const alerts = [];
  if (concentration?.flagged) {
    alerts.push({
      id: "concentration", severity: "high",
      title: `${concentration.topSymbol} is ${Math.round(concentration.topWeight * 100)}% of your stock holdings`,
      detail: "A large single-position stake concentrates your risk. Consider spreading it across more holdings.",
    });
  }
  if (positions.length >= 1 && effectiveHoldings > 0 && effectiveHoldings < 5) {
    alerts.push({
      id: "diversification", severity: "medium",
      title: `Only ~${effectiveHoldings.toFixed(1)} effectively-distinct holdings`,
      detail: "Your portfolio behaves like a handful of positions. Broad-market funds add diversification cheaply.",
    });
  }
  if (weightedExpenseRatio > 0.005 && fees.coveragePct > 0.3) {
    alerts.push({
      id: "fees", severity: "medium",
      title: `Your funds average ${(weightedExpenseRatio * 100).toFixed(2)}% in fees`,
      detail: `That's about ${Math.round(fees.annualEstimate)} per year on recognized funds. Lower-cost index funds can cut this.`,
    });
  }
  const cashPct = totalValue > 0 ? cash / totalValue : 0;
  if (cashPct > 0.2) {
    alerts.push({
      id: "cash-drag", severity: "low",
      title: `${Math.round(cashPct * 100)}% of your portfolio is in cash`,
      detail: "Idle cash can lag inflation. If it isn't earmarked, it may be under-invested.",
    });
  }
  for (const d of drift) {
    if (d.flagged) {
      alerts.push({
        id: `drift-${d.key}`, severity: "low",
        title: `${d.label} is ${d.diff > 0 ? "over" : "under"} target by ${Math.round(Math.abs(d.diff) * 100)}pts`,
        detail: `Currently ${Math.round(d.current * 100)}% vs a ${Math.round(d.target * 100)}% target.`,
      });
    }
  }

  return {
    hasData: true, totalValue,
    positions, positionCount: positions.length, effectiveHoldings,
    mix, concentration, fees, drift, alerts,
  };
}
