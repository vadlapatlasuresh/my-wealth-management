import { describe, it, expect } from "vitest";
import { futureValue, projectRetirement, sustainableMonthlyIncome, contributionForTarget } from "./goalScenarios";

describe("futureValue", () => {
  it("returns the principal when the horizon is zero", () => {
    expect(futureValue(1000, 100, 0.06, 0)).toBe(1000);
  });
  it("grows a lump sum by compound interest", () => {
    // $10k at 12%/yr (1%/mo) for 1 year ≈ 10k * 1.01^12
    expect(futureValue(10000, 0, 0.12, 1)).toBeCloseTo(10000 * Math.pow(1.01, 12), 2);
  });
  it("handles a zero rate as simple accumulation of contributions", () => {
    expect(futureValue(0, 100, 0, 2)).toBe(100 * 24);
  });
});

describe("projectRetirement", () => {
  const r = projectRetirement({ currentAge: 30, retireAge: 65, currentSavings: 20000, monthlyContribution: 500, annualReturn: 0.06, volatility: 0.03 });

  it("spans the right horizon (year 0 = today)", () => {
    expect(r.years).toBe(35);
    expect(r.series).toHaveLength(36);
    expect(r.series[0].expected).toBe(20000);
  });

  it("orders the bands low ≤ expected ≤ high at the finish", () => {
    expect(r.pessimistic).toBeLessThanOrEqual(r.expected);
    expect(r.expected).toBeLessThanOrEqual(r.optimistic);
  });

  it("expected balance exceeds total contributions (growth is positive)", () => {
    expect(r.expected).toBeGreaterThan(r.totalContributions);
    expect(r.growth).toBeCloseTo(r.expected - r.totalContributions, 4);
  });

  it("retiring later yields more (age slider behaves correctly)", () => {
    const at60 = projectRetirement({ currentAge: 30, retireAge: 60, currentSavings: 20000, monthlyContribution: 500 });
    const at65 = projectRetirement({ currentAge: 30, retireAge: 65, currentSavings: 20000, monthlyContribution: 500 });
    expect(at65.expected).toBeGreaterThan(at60.expected);
  });

  it("is deterministic (no randomness)", () => {
    const a = projectRetirement({ currentAge: 40, retireAge: 67, currentSavings: 50000, monthlyContribution: 800 });
    const b = projectRetirement({ currentAge: 40, retireAge: 67, currentSavings: 50000, monthlyContribution: 800 });
    expect(a.expected).toBe(b.expected);
  });
});

describe("sustainableMonthlyIncome", () => {
  it("applies the 4% rule monthly", () => {
    expect(sustainableMonthlyIncome(1200000)).toBeCloseTo(1200000 * 0.04 / 12, 2); // $4,000/mo
  });
});

describe("contributionForTarget", () => {
  it("is zero when the target is already reachable from principal alone", () => {
    // $1M target, $1M already saved → no extra needed
    expect(contributionForTarget(1000000, 1000000, 10, 0.05)).toBe(0);
  });
  it("returns a positive monthly amount to close a gap", () => {
    const need = contributionForTarget(1000000, 100000, 30, 0.06);
    expect(need).toBeGreaterThan(0);
    // Contributing that amount should land ≈ the target
    const landed = futureValue(100000, need, 0.06, 30);
    expect(landed).toBeCloseTo(1000000, -1);
  });
});
