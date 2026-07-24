// Net-worth / savings benchmarking — pure helpers (no React). Phase 4, backlog B1.
// feature_key: individual.benchmarks.
//
// THE ONE RULE THIS FILE ENFORCES: your own numbers are always real, and a peer comparison is
// only ever shown when a real dataset answered for a large-enough cohort. There is deliberately
// NO demo/sample percentile curve anywhere in this module. Every other integration in the app
// ships a realistic mock; this one must not, because "you're ahead of 68% of people like you"
// is a factual claim about the world — a made-up version of it is a lie no badge can fix, and
// it would be the most screenshot-shared number in the product.
//
// So the flag pair works differently from FLAGS.CREDIT_MONITORING:
//   • FLAGS.BENCHMARKS       → is the feature visible at all (nav + page).
//   • FLAGS.BENCHMARKS_LIVE  → call the backend for peer data. Off ⇒ own-metrics only,
//                              which is a genuinely useful screen on its own.
// The backend (financial-core BenchmarkService) applies opt-in consent and a k-anonymity floor
// before any curve reaches us; see docs/THIRD_PARTY_VENDORS.md → "Peer benchmark dataset".

import { isFlagEnabled, FLAGS } from "../config/featureFlags";
import { summarizeAccounts, monthlyCashFlow } from "./healthScore";

/** Metrics we can compare, in display order. Must match BenchmarkService.METRICS. */
export const METRICS = [
  {
    key: "netWorth",
    label: "Net worth",
    format: "currency",
    help: "Everything you own minus everything you owe.",
  },
  {
    key: "savingsRate",
    label: "Savings rate",
    format: "percent",
    help: "The share of your income you keep each month.",
  },
  {
    key: "emergencyMonths",
    label: "Emergency fund",
    format: "months",
    help: "How many months of spending your liquid cash covers.",
  },
];

/** Coarse cohort options. Deliberately wide — finer bands start to identify people. */
export const AGE_BANDS = [
  { value: "", label: "All ages" },
  { value: "18_24", label: "18–24" },
  { value: "25_34", label: "25–34" },
  { value: "35_44", label: "35–44" },
  { value: "45_54", label: "45–54" },
  { value: "55_64", label: "55–64" },
  { value: "65_plus", label: "65+" },
];

export const INCOME_BANDS = [
  { value: "", label: "All incomes" },
  { value: "under_50k", label: "Under $50k" },
  { value: "50_100k", label: "$50k–$100k" },
  { value: "100_200k", label: "$100k–$200k" },
  { value: "over_200k", label: "Over $200k" },
];

export const REGIONS = [
  { value: "", label: "Anywhere" },
  { value: "US_NORTHEAST", label: "US · Northeast" },
  { value: "US_MIDWEST", label: "US · Midwest" },
  { value: "US_SOUTH", label: "US · South" },
  { value: "US_WEST", label: "US · West" },
];

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * The user's OWN metrics, from their own linked data. Always real; never estimated from a
 * cohort. A metric we can't compute yet is returned as null rather than 0, so the page can say
 * "link an account" instead of showing a confident zero.
 *
 * Returns { netWorth, savingsRate, emergencyMonths } with null for anything uncomputable.
 */
export function computeOwnMetrics({ accounts = [], transactions = [], snapshot = null } = {}) {
  const { liquidCash, assets, debt } = summarizeAccounts(accounts);
  const { monthlyIncome, monthlySpend } = monthlyCashFlow(transactions);

  // Prefer the persisted snapshot (it includes property + private holdings the account list
  // doesn't carry); fall back to the linked-account math.
  const hasSnapshot = snapshot && Number.isFinite(Number(snapshot.netWorth));
  const netWorth = hasSnapshot ? num(snapshot.netWorth) : (accounts?.length ? assets - debt : null);

  const savingsRate =
    monthlyIncome && monthlyIncome > 0 && monthlySpend != null
      ? Math.max(-1, (monthlyIncome - monthlySpend) / monthlyIncome)
      : null;

  const emergencyMonths =
    monthlySpend && monthlySpend > 0 ? liquidCash / monthlySpend : null;

  return { netWorth, savingsRate, emergencyMonths };
}

/**
 * Where a value sits on a percentile curve, by linear interpolation between the two bracketing
 * points. Returns null when the curve is unusable — never a guess.
 *
 * Values below the lowest / above the highest published percentile are reported AT that bound
 * (e.g. "10th or below"), because the curve genuinely doesn't describe the tails.
 */
export function percentileOf(value, points) {
  if (!Number.isFinite(Number(value)) || !points) return null;
  const curve = Object.entries(points)
    .map(([p, v]) => [Number(p), Number(v)])
    .filter(([p, v]) => Number.isFinite(p) && Number.isFinite(v))
    .sort((a, b) => a[0] - b[0]);
  if (curve.length < 2) return null;

  const v = Number(value);
  if (v <= curve[0][1]) return { percentile: curve[0][0], bounded: "below" };
  const last = curve[curve.length - 1];
  if (v >= last[1]) return { percentile: last[0], bounded: "above" };

  for (let i = 1; i < curve.length; i++) {
    const [pLo, vLo] = curve[i - 1];
    const [pHi, vHi] = curve[i];
    if (v <= vHi) {
      const span = vHi - vLo;
      const t = span === 0 ? 0 : (v - vLo) / span;
      return { percentile: Math.round(pLo + t * (pHi - pLo)), bounded: null };
    }
  }
  return null;
}

/** Plain-language reading of a percentile. Neutral by design — this is not a scoreboard. */
export function percentileLabel(percentile) {
  if (percentile == null) return null;
  if (percentile >= 90) return "Top 10%";
  if (percentile >= 75) return "Top quarter";
  if (percentile >= 50) return "Above the middle";
  if (percentile >= 25) return "Below the middle";
  return "Bottom quarter";
}

/**
 * Combine the user's own metrics with whatever the backend could honestly provide.
 *
 * `peer` is the /api/v1/me/benchmarks payload (or null when the live flag is off / the call
 * failed). The result ALWAYS carries the user's own values; `comparison` is present per metric
 * only when a real, sufficiently-large cohort answered.
 */
export function buildBenchmarks({ own = {}, peer = null } = {}) {
  const optedIn = Boolean(peer?.optedIn);
  const peerMetrics = peer?.metrics || {};

  const rows = METRICS.map((m) => {
    const value = own[m.key] ?? null;
    const p = peerMetrics[m.key];

    let comparison = null;
    let unavailableReason = null;

    if (!peer) {
      unavailableReason = "Peer comparison isn't switched on.";
    } else if (!optedIn) {
      unavailableReason = peer.reason || "Turn on benchmarking to see how you compare.";
    } else if (!p || !p.available) {
      unavailableReason = p?.reason || peer.reason || "No peer data for your cohort yet.";
    } else if (value == null) {
      unavailableReason = "We need a bit more of your data to compare this one.";
    } else {
      const pos = percentileOf(value, p.percentiles);
      if (pos) {
        comparison = {
          percentile: pos.percentile,
          bounded: pos.bounded,
          label: percentileLabel(pos.percentile),
          median: Number(p.percentiles?.["50"] ?? p.percentiles?.[50]),
          source: p.source,
          sampleSize: p.sampleSize,
          percentiles: p.percentiles,
        };
      } else {
        unavailableReason = "That cohort's curve couldn't be read.";
      }
    }

    return { ...m, value, comparison, unavailableReason };
  });

  return {
    optedIn,
    provider: peer?.provider || "none",
    cohort: peer?.cohort || { ageBand: "all", incomeBand: "all", region: "all" },
    minCohortSize: peer?.minCohortSize ?? null,
    // True only when at least one metric has a REAL comparison to show.
    anyComparison: rows.some((r) => r.comparison),
    rows,
  };
}

export function benchmarksEnabled() {
  return isFlagEnabled(FLAGS.BENCHMARKS);
}

/**
 * Load peer data, if and only if the live flag is on. Never throws and never substitutes
 * sample data: a failure returns null, which the page renders as "own metrics only".
 */
export async function loadPeerBenchmarks() {
  if (!isFlagEnabled(FLAGS.BENCHMARKS_LIVE)) return null;
  try {
    const { api } = await import("../api");
    return await api.getBenchmarks();
  } catch {
    return null; // honest silence beats a fabricated curve
  }
}
