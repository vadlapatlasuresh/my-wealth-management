import { describe, it, expect } from "vitest";
import {
  simpleInterest,
  compoundInterest,
  mortgagePayoff,
  extraPaymentImpact,
  payoffDateLabel,
  requiredMonthlyContribution,
} from "./calculators";

describe("simpleInterest", () => {
  it("computes P·r·t", () => {
    const { interest, total } = simpleInterest(1000, 5, 3);
    expect(interest).toBe(150); // 1000 * 0.05 * 3
    expect(total).toBe(1150);
  });
  it("handles zero/garbage input", () => {
    expect(simpleInterest(null, "x", undefined)).toEqual({ interest: 0, total: 0 });
  });
});

describe("compoundInterest", () => {
  it("matches the closed-form lump-sum formula (annual compounding)", () => {
    // 1000 at 10% for 2y annually = 1000*1.1^2 = 1210
    const r = compoundInterest(1000, 10, 2, 1, 0);
    expect(r.futureValue).toBeCloseTo(1210, 2);
    expect(r.totalContributions).toBe(1000);
    expect(r.totalInterest).toBeCloseTo(210, 2);
  });
  it("grows more with monthly contributions and yields a yearly schedule", () => {
    const r = compoundInterest(0, 6, 10, 12, 100); // $100/mo for 10y at 6%
    expect(r.totalContributions).toBeCloseTo(12000, 0); // 100*120
    expect(r.futureValue).toBeGreaterThan(12000); // interest earned
    expect(r.schedule).toHaveLength(10);
    expect(r.schedule[9].year).toBe(10);
  });
});

describe("mortgagePayoff", () => {
  it("amortizes a standard loan in finite time", () => {
    // 200k at 6% APR, $1500/mo -> well-known ~ a bit over 20 years
    const r = mortgagePayoff(200000, 6, 1500, 0);
    expect(r.feasible).toBe(true);
    expect(r.months).toBeGreaterThan(200);
    expect(r.months).toBeLessThan(360);
    expect(r.totalInterest).toBeGreaterThan(0);
  });
  it("flags infeasible when payment can't cover interest", () => {
    // 200k at 6% -> first-month interest = 1000; paying 900 never amortizes
    const r = mortgagePayoff(200000, 6, 900, 0);
    expect(r.feasible).toBe(false);
    expect(r.months).toBe(Infinity);
  });
  it("zero balance is already paid off", () => {
    expect(mortgagePayoff(0, 6, 1500, 0).months).toBe(0);
  });
});

describe("extraPaymentImpact", () => {
  it("extra payments shorten the term and save interest", () => {
    const { monthsSaved, interestSaved, base, withExtra } = extraPaymentImpact(200000, 6, 1500, 300);
    expect(withExtra.months).toBeLessThan(base.months);
    expect(monthsSaved).toBeGreaterThan(0);
    expect(interestSaved).toBeGreaterThan(0);
  });
});

describe("requiredMonthlyContribution", () => {
  it("splits the gap evenly with no return", () => {
    // need 12000 - 0 over 12 months at 0% => 1000/mo
    expect(requiredMonthlyContribution(12000, 0, 12, 0)).toBe(1000);
  });
  it("requires less when a return is assumed", () => {
    const withReturn = requiredMonthlyContribution(12000, 0, 12, 6);
    expect(withReturn).toBeLessThan(1000);
    expect(withReturn).toBeGreaterThan(0);
  });
  it("returns 0 when already met", () => {
    expect(requiredMonthlyContribution(5000, 5000, 12, 5)).toBe(0);
    expect(requiredMonthlyContribution(5000, 6000, 12, 5)).toBe(0);
  });
  it("returns the full gap when due now", () => {
    expect(requiredMonthlyContribution(1000, 200, 0, 5)).toBe(800);
  });
});

describe("payoffDateLabel", () => {
  it("formats a duration", () => {
    expect(payoffDateLabel(30).duration).toBe("2y 6m");
    expect(payoffDateLabel(0).duration).toBe("0m");
    expect(payoffDateLabel(Infinity).duration).toBe("—");
  });
});
