import { describe, it, expect } from "vitest";
import {
  computeOwnMetrics, percentileOf, percentileLabel, buildBenchmarks, METRICS,
} from "./benchmarks";

// Plaid convention (the one the API actually returns): amount > 0 is money OUT.
const daysAgo = (n) => new Date(Date.now() - n * 24 * 3600 * 1000).toISOString();

const accounts = [
  { id: 1, name: "Checking", type: "depository", currentBalance: 12000 },
  { id: 2, name: "Savings", type: "depository", currentBalance: 24000 },
  { id: 3, name: "Card", type: "credit", currentBalance: 3000 },
  { id: 4, name: "Brokerage", type: "investment", currentBalance: 90000 },
];

// ~$6,000/mo in, ~$3,000/mo out over a 60-day window.
const transactions = [
  { id: 1, amount: -6000, date: daysAgo(5), category: "income" },
  { id: 2, amount: -6000, date: daysAgo(35), category: "income" },
  { id: 3, amount: 3000, date: daysAgo(6), category: "housing" },
  { id: 4, amount: 3000, date: daysAgo(36), category: "housing" },
];

const curve = { 10: 900, 25: 14500, 50: 91300, 75: 310000, 90: 890000 };

const peerPayload = (overrides = {}) => ({
  provider: "file",
  optedIn: true,
  cohort: { ageBand: "35_44", incomeBand: "all", region: "all" },
  minCohortSize: 100,
  available: true,
  metrics: {
    netWorth: { available: true, source: "SCF 2022", sampleSize: 1340, percentiles: curve },
    savingsRate: { available: false, reason: "The dataset doesn't cover this cohort yet." },
    emergencyMonths: { available: false, reason: "The dataset doesn't cover this cohort yet." },
  },
  ...overrides,
});

describe("computeOwnMetrics", () => {
  it("computes net worth, savings rate and emergency months from real data", () => {
    const own = computeOwnMetrics({ accounts, transactions });
    // assets 12000 + 24000 + 90000 = 126000, debt 3000
    expect(own.netWorth).toBe(123000);
    expect(own.savingsRate).toBeCloseTo(0.5, 2); // 6000 in, 3000 out — scaling cancels out
    // monthlyCashFlow normalizes the observed 36-day window to 30 days, so monthly spend is
    // 6000 × (30/36) = 5000 and 36,000 of liquid cash covers 7.2 months.
    expect(own.emergencyMonths).toBeCloseTo(7.2, 1);
  });

  it("prefers the persisted snapshot for net worth (it includes property)", () => {
    const own = computeOwnMetrics({ accounts, transactions, snapshot: { netWorth: 512000 } });
    expect(own.netWorth).toBe(512000);
  });

  it("returns null rather than a confident zero when there is nothing to compute", () => {
    const own = computeOwnMetrics({ accounts: [], transactions: [] });
    expect(own.netWorth).toBeNull();
    expect(own.savingsRate).toBeNull();
    expect(own.emergencyMonths).toBeNull();
  });
});

describe("percentileOf", () => {
  it("interpolates between the bracketing percentiles", () => {
    // Exactly the median.
    expect(percentileOf(91300, curve)).toEqual({ percentile: 50, bounded: null });
    // Halfway between the 50th (91,300) and the 75th (310,000).
    const mid = percentileOf((91300 + 310000) / 2, curve);
    expect(mid.percentile).toBeGreaterThan(60);
    expect(mid.percentile).toBeLessThan(66);
  });

  it("reports the tails as bounded instead of extrapolating", () => {
    expect(percentileOf(10, curve)).toEqual({ percentile: 10, bounded: "below" });
    expect(percentileOf(5_000_000, curve)).toEqual({ percentile: 90, bounded: "above" });
  });

  it("refuses an unusable curve", () => {
    expect(percentileOf(100, null)).toBeNull();
    expect(percentileOf(100, { 50: 1000 })).toBeNull(); // one point is not a curve
    expect(percentileOf(undefined, curve)).toBeNull();
  });
});

describe("percentileLabel", () => {
  it("reads neutrally, not as a scoreboard", () => {
    expect(percentileLabel(95)).toBe("Top 10%");
    expect(percentileLabel(80)).toBe("Top quarter");
    expect(percentileLabel(60)).toBe("Above the middle");
    expect(percentileLabel(30)).toBe("Below the middle");
    expect(percentileLabel(10)).toBe("Bottom quarter");
    expect(percentileLabel(null)).toBeNull();
  });
});

describe("buildBenchmarks", () => {
  const own = { netWorth: 123000, savingsRate: 0.5, emergencyMonths: 12 };

  it("NEVER invents a comparison when there is no peer data", () => {
    const b = buildBenchmarks({ own, peer: null });
    expect(b.anyComparison).toBe(false);
    expect(b.optedIn).toBe(false);
    // The user's own real figures still come through — that is the whole point.
    expect(b.rows.map((r) => r.value)).toEqual([123000, 0.5, 12]);
    for (const row of b.rows) {
      expect(row.comparison).toBeNull();
      expect(row.unavailableReason).toBeTruthy();
    }
  });

  it("shows nothing comparative until the user has opted in", () => {
    const b = buildBenchmarks({ own, peer: peerPayload({ optedIn: false, reason: "Benchmarking is off." }) });
    expect(b.anyComparison).toBe(false);
    expect(b.rows.every((r) => r.comparison === null)).toBe(true);
    expect(b.rows[0].unavailableReason).toBe("Benchmarking is off.");
  });

  it("compares only the metrics the dataset actually answered for", () => {
    const b = buildBenchmarks({ own, peer: peerPayload() });
    expect(b.anyComparison).toBe(true);

    const netWorth = b.rows.find((r) => r.key === "netWorth");
    expect(netWorth.comparison.percentile).toBeGreaterThan(50);
    expect(netWorth.comparison.percentile).toBeLessThan(75);
    expect(netWorth.comparison.source).toBe("SCF 2022");
    expect(netWorth.comparison.sampleSize).toBe(1340);
    expect(netWorth.comparison.median).toBe(91300);

    // The two metrics the dataset couldn't answer stay uncompared, with the reason surfaced.
    const savings = b.rows.find((r) => r.key === "savingsRate");
    expect(savings.comparison).toBeNull();
    expect(savings.unavailableReason).toContain("doesn't cover this cohort");
  });

  it("holds back a comparison when the user's own figure is missing", () => {
    const b = buildBenchmarks({ own: { netWorth: null }, peer: peerPayload() });
    expect(b.rows.find((r) => r.key === "netWorth").comparison).toBeNull();
    expect(b.anyComparison).toBe(false);
  });

  it("carries the cohort and anonymity floor through for display", () => {
    const b = buildBenchmarks({ own, peer: peerPayload() });
    expect(b.cohort.ageBand).toBe("35_44");
    expect(b.minCohortSize).toBe(100);
    expect(b.provider).toBe("file");
  });

  it("returns one row per declared metric, in order", () => {
    const b = buildBenchmarks({ own, peer: null });
    expect(b.rows.map((r) => r.key)).toEqual(METRICS.map((m) => m.key));
  });
});
