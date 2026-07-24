import { describe, it, expect } from "vitest";
import {
  scoreBand, factorStatus, utilizationStatus, buildFactors,
  demoCreditProfile, normalizeLiveProfile, SCALE_MIN, SCALE_MAX, FACTOR_WEIGHTS,
} from "./creditMonitoring";

describe("scoreBand", () => {
  it("maps scores to FICO bands and clamps out-of-range", () => {
    expect(scoreBand(300).label).toBe("Poor");
    expect(scoreBand(650).label).toBe("Fair");
    expect(scoreBand(700).label).toBe("Good");
    expect(scoreBand(770).label).toBe("Very Good");
    expect(scoreBand(830).label).toBe("Exceptional");
    expect(scoreBand(9999).label).toBe("Exceptional"); // clamped
    expect(scoreBand(-5).label).toBe("Poor");
  });
});

describe("factorStatus / utilizationStatus", () => {
  it("labels sub-scores", () => {
    expect(factorStatus(90).status).toBe("Excellent");
    expect(factorStatus(40).status).toBe("Needs work");
  });
  it("labels utilization tiers", () => {
    expect(utilizationStatus(0.05).status).toBe("Excellent");
    expect(utilizationStatus(0.2).status).toBe("Good");
    expect(utilizationStatus(0.4).status).toBe("Fair");
    expect(utilizationStatus(0.7).status).toBe("High");
  });
});

describe("buildFactors", () => {
  const f = buildFactors({ onTimePct: 1, utilization: 0.05, avgAgeMonths: 96, accountTypes: 4, inquiries12mo: 0 });
  it("returns all five weighted FICO factors", () => {
    expect(f.map((x) => x.key)).toEqual(["paymentHistory", "utilization", "creditAge", "accountMix", "inquiries"]);
    const totalWeight = f.reduce((s, x) => s + x.weight, 0);
    expect(totalWeight).toBeCloseTo(1, 5);
    expect(f[0].weight).toBe(FACTOR_WEIGHTS.paymentHistory);
  });
  it("penalizes high utilization", () => {
    const low = buildFactors({ onTimePct: 1, utilization: 0.05, avgAgeMonths: 96, accountTypes: 4, inquiries12mo: 0 });
    const high = buildFactors({ onTimePct: 1, utilization: 0.45, avgAgeMonths: 96, accountTypes: 4, inquiries12mo: 0 });
    const lowUtil = low.find((x) => x.key === "utilization").sub;
    const highUtil = high.find((x) => x.key === "utilization").sub;
    expect(highUtil).toBeLessThan(lowUtil);
  });
});

describe("demoCreditProfile", () => {
  it("is deterministic for the same user key", () => {
    const a = demoCreditProfile("user@example.com");
    const b = demoCreditProfile("user@example.com");
    expect(a.score).toBe(b.score);
    expect(a.history).toEqual(b.history);
  });
  it("differs across users", () => {
    const a = demoCreditProfile("alice");
    const b = demoCreditProfile("bob");
    expect(a.score === b.score && a.utilization.pct === b.utilization.pct).toBe(false);
  });
  it("produces a valid, in-range, clearly-demo profile", () => {
    const p = demoCreditProfile("x");
    expect(p.provider).toBe("demo");
    expect(p.score).toBeGreaterThanOrEqual(SCALE_MIN);
    expect(p.score).toBeLessThanOrEqual(SCALE_MAX);
    expect(p.history).toHaveLength(12);
    expect(p.history[11].score).toBe(p.score); // last point is current
    expect(p.utilization.balance).toBeLessThanOrEqual(p.utilization.limit);
    expect(p.factors).toHaveLength(5);
  });
});

describe("normalizeLiveProfile", () => {
  it("shapes a raw payload and derives the band", () => {
    const p = normalizeLiveProfile({ score: 712, delta: 4, utilization: { pct: 0.2, balance: 200, limit: 1000 } });
    expect(p.provider).toBe("live");
    expect(p.band.label).toBe("Good");
    expect(p.factors).toHaveLength(5); // derived when not supplied
  });
});
