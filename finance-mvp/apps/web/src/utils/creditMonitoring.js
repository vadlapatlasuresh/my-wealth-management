// Credit monitoring — pure helpers + a provider abstraction with a deterministic demo
// fallback. Phase 4. feature_key: individual.creditMonitoring.
//
// Gating (config flag + mock fallback, the app-wide integration pattern):
//   • FLAGS.CREDIT_MONITORING      → whether the feature is on at all (nav + page).
//   • FLAGS.CREDIT_MONITORING_LIVE → use a real bureau (api.getCreditProfile) vs demo data.
// With no real bureau wired, the demo provider returns a realistic, STABLE-per-user profile
// clearly labeled as demo — never presented as a real score.
//
// The score model uses the standard FICO scale (300–850) and factor weights, so both the
// live and demo paths normalize to the same shape and the UI never has to branch on source.

import { isFlagEnabled, FLAGS } from "../config/featureFlags";
// NOTE: `api` is imported lazily inside loadCreditProfile() so this module stays free of
// browser-only deps (api.js reads localStorage at load) and the pure helpers unit-test in node.

export const SCALE_MIN = 300;
export const SCALE_MAX = 850;

// FICO-style bands. Colours read on the dark glass canvas and match the app palette feel.
export const BANDS = [
  { key: "poor", label: "Poor", min: 300, max: 579, color: "#F0776B" },
  { key: "fair", label: "Fair", min: 580, max: 669, color: "#F0A03C" },
  { key: "good", label: "Good", min: 670, max: 739, color: "#E6C34B" },
  { key: "veryGood", label: "Very Good", min: 740, max: 799, color: "#5BB98C" },
  { key: "exceptional", label: "Exceptional", min: 800, max: 850, color: "#3DDC97" },
];

export function scoreBand(score) {
  const s = Math.max(SCALE_MIN, Math.min(SCALE_MAX, Number(score) || SCALE_MIN));
  return BANDS.find((b) => s >= b.min && s <= b.max) || BANDS[0];
}

// Standard FICO factor weights.
export const FACTOR_WEIGHTS = {
  paymentHistory: 0.35,
  utilization: 0.30,
  creditAge: 0.15,
  accountMix: 0.10,
  inquiries: 0.10,
};

// Map a 0..100 sub-score to a status label + impact (how much it's helping/hurting).
export function factorStatus(sub) {
  const v = Math.max(0, Math.min(100, Number(sub) || 0));
  if (v >= 85) return { status: "Excellent", impact: "High", tone: "good" };
  if (v >= 70) return { status: "Good", impact: "Medium", tone: "good" };
  if (v >= 50) return { status: "Fair", impact: "Medium", tone: "warn" };
  return { status: "Needs work", impact: "High", tone: "bad" };
}

export function utilizationStatus(pct) {
  const p = Number(pct) || 0;
  if (p < 0.10) return { status: "Excellent", tone: "good" };
  if (p < 0.30) return { status: "Good", tone: "good" };
  if (p < 0.50) return { status: "Fair", tone: "warn" };
  return { status: "High", tone: "bad" };
}

// ---- deterministic PRNG so the demo profile is stable per user ----
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < String(s).length; i++) { h ^= String(s).charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Build the factor list from underlying metrics (used by both demo + live normalization). */
export function buildFactors({ onTimePct, utilization, avgAgeMonths, accountTypes, inquiries12mo }) {
  const paySub = Math.round(onTimePct * 100);
  const utilSub = Math.round(Math.max(0, 100 - utilization * 200)); // 0% util → 100, 50% → 0
  const ageSub = Math.round(Math.min(100, (avgAgeMonths / 96) * 100)); // 8yr avg ≈ 100
  const mixSub = Math.round(Math.min(100, (accountTypes / 4) * 100));
  const inqSub = Math.round(Math.max(0, 100 - inquiries12mo * 20));
  const F = (key, label, sub, detail) => ({ key, label, weight: FACTOR_WEIGHTS[key], sub, detail, ...factorStatus(sub) });
  return [
    F("paymentHistory", "Payment history", paySub, `${Math.round(onTimePct * 100)}% of payments on time`),
    F("utilization", "Credit utilization", utilSub, `${Math.round(utilization * 100)}% of available credit used`),
    F("creditAge", "Age of credit", ageSub, `${(avgAgeMonths / 12).toFixed(1)} yr average account age`),
    F("accountMix", "Account mix", mixSub, `${accountTypes} type${accountTypes === 1 ? "" : "s"} of credit`),
    F("inquiries", "New inquiries", inqSub, `${inquiries12mo} hard inquir${inquiries12mo === 1 ? "y" : "ies"} in 12 months`),
  ];
}

/** Deterministic demo profile for a given user key. Stable across reloads; clearly demo. */
export function demoCreditProfile(userKey = "demo") {
  const rnd = mulberry32(hashStr(userKey));
  const pick = (min, max) => min + Math.floor(rnd() * (max - min + 1));

  const current = pick(648, 806);
  // 12-month history drifting up to `current` with small wobble.
  const history = [];
  const now = new Date();
  let s = current - pick(6, 34);
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const step = (current - s) / (i + 1) + (rnd() - 0.5) * 8;
    s = Math.max(SCALE_MIN, Math.min(SCALE_MAX, Math.round(s + step)));
    history.push({ month: MONTHS[d.getMonth()], score: i === 0 ? current : s });
  }
  const prev = history[history.length - 2]?.score ?? current;
  const delta = current - prev;

  const limit = pick(8, 42) * 1000;
  const utilization = pick(4, 46) / 100;
  const balance = Math.round(limit * utilization);

  const factors = buildFactors({
    onTimePct: pick(94, 100) / 100,
    utilization,
    avgAgeMonths: pick(28, 132),
    accountTypes: pick(2, 4),
    inquiries12mo: pick(0, 4),
  });

  // A few recent changes for the timeline.
  const changes = [];
  const ago = (days) => new Date(now.getTime() - days * 864e5).toISOString();
  if (delta !== 0) changes.push({ type: "score", direction: delta > 0 ? "up" : "down", title: `Score ${delta > 0 ? "rose" : "dropped"} ${Math.abs(delta)} pts`, detail: "Since your last report", date: ago(pick(1, 6)) });
  changes.push({ type: "utilization", direction: utilization < 0.3 ? "up" : "down", title: `Utilization at ${Math.round(utilization * 100)}%`, detail: `${balance.toLocaleString()} of ${limit.toLocaleString()} used`, date: ago(pick(2, 10)) });
  if (factors.find((f) => f.key === "inquiries").sub < 100) changes.push({ type: "inquiry", direction: "down", title: "New hard inquiry reported", detail: "A recent credit application", date: ago(pick(8, 40)) });

  return {
    provider: "demo",
    score: current,
    band: scoreBand(current),
    delta,
    asOf: now.toISOString(),
    scaleMin: SCALE_MIN,
    scaleMax: SCALE_MAX,
    history,
    utilization: { pct: utilization, balance, limit },
    factors,
    changes,
  };
}

/** Normalize a raw live-provider payload into the same shape as demoCreditProfile. */
export function normalizeLiveProfile(raw = {}) {
  const score = Number(raw.score) || SCALE_MIN;
  return {
    // Honour the provider the backend reports: the stub returns "demo" (so the UI keeps its
    // demo banner even via the live flag) until a real bureau returns "live".
    provider: raw.provider || "live",
    score,
    band: scoreBand(score),
    delta: Number(raw.delta) || 0,
    asOf: raw.asOf || new Date().toISOString(),
    scaleMin: SCALE_MIN,
    scaleMax: SCALE_MAX,
    history: Array.isArray(raw.history) ? raw.history : [],
    utilization: raw.utilization || { pct: 0, balance: 0, limit: 0 },
    factors: Array.isArray(raw.factors) && raw.factors.length ? raw.factors : buildFactors({
      onTimePct: raw.onTimePct ?? 1, utilization: raw.utilization?.pct ?? 0,
      avgAgeMonths: raw.avgAgeMonths ?? 0, accountTypes: raw.accountTypes ?? 0, inquiries12mo: raw.inquiries12mo ?? 0,
    }),
    changes: Array.isArray(raw.changes) ? raw.changes : [],
  };
}

export function creditMonitoringEnabled() {
  return isFlagEnabled(FLAGS.CREDIT_MONITORING);
}

/**
 * Load the credit profile. When the LIVE flag is on we try the real bureau endpoint and
 * only fall back to the demo profile on failure; otherwise we return the demo profile
 * directly. Never throws — the page always has something honest to render.
 */
export async function loadCreditProfile(userKey = "demo") {
  if (isFlagEnabled(FLAGS.CREDIT_MONITORING_LIVE)) {
    try {
      const { api } = await import("../api");
      const raw = await api.getCreditProfile();
      if (raw) return normalizeLiveProfile(raw);
    } catch { /* fall through to demo */ }
  }
  return demoCreditProfile(userKey);
}
