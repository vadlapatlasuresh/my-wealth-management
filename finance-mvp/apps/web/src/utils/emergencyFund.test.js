import { describe, it, expect } from "vitest";
import { computeEmergencyFund, monthlyContributionFor, coverageLabel } from "./emergencyFund";

// Plaid convention: positive = a charge (money out), negative = money in.
const daysAgo = (n) => new Date(Date.now() - n * 24 * 3600 * 1000).toISOString();

const spendingProfile = (perMonth) => [
  { amount: perMonth, date: daysAgo(15) }, // one month's worth of charges
];

describe("computeEmergencyFund", () => {
  it("is not computable without a monthly expense figure", () => {
    const r = computeEmergencyFund({ accounts: [{ type: "depository", currentBalance: 5000 }], transactions: [] });
    expect(r.computable).toBe(false);
    expect(r.monthsCovered).toBe(0);
  });

  it("computes months covered, target and gap", () => {
    const r = computeEmergencyFund({
      accounts: [{ type: "depository", currentBalance: 6000 }],
      transactions: spendingProfile(2000),
      targetMonths: 6,
    });
    expect(r.computable).toBe(true);
    expect(r.monthlyExpenses).toBeCloseTo(2000, 5);
    expect(r.monthsCovered).toBeCloseTo(3, 5);
    expect(r.targetAmount).toBeCloseTo(12000, 5);
    expect(r.gap).toBeCloseTo(6000, 5);
    expect(r.pct).toBeCloseTo(0.5, 5);
  });

  it("caps pct at 1 and reports no gap when over target", () => {
    const r = computeEmergencyFund({
      accounts: [{ type: "depository", currentBalance: 50000 }],
      transactions: spendingProfile(1000),
      targetMonths: 6,
    });
    expect(r.pct).toBe(1);
    expect(r.gap).toBe(0);
  });

  it("marks milestones reached against liquid cash", () => {
    const r = computeEmergencyFund({
      accounts: [{ type: "depository", currentBalance: 3500 }],
      transactions: spendingProfile(1000),
    });
    const reached = r.milestones.filter((m) => m.reached).map((m) => m.months);
    expect(reached).toEqual([1, 3]); // 3.5 months covered → 1 and 3 reached, 6 not
  });

  it("only counts liquid (depository) cash, not investments", () => {
    const r = computeEmergencyFund({
      accounts: [
        { type: "depository", currentBalance: 1000 },
        { type: "investment", currentBalance: 90000 },
      ],
      transactions: spendingProfile(1000),
    });
    expect(r.liquidCash).toBe(1000);
    expect(r.monthsCovered).toBeCloseTo(1, 5);
  });
});

describe("monthlyContributionFor", () => {
  it("splits the gap across the horizon", () => {
    expect(monthlyContributionFor(6000, 12)).toBe(500);
  });
  it("returns 0 when there is no gap", () => {
    expect(monthlyContributionFor(0, 12)).toBe(0);
  });
});

describe("coverageLabel", () => {
  it("describes coverage honestly", () => {
    expect(coverageLabel(0)).toBe("Not started");
    expect(coverageLabel(0.5)).toBe("Less than a month");
    expect(coverageLabel(2)).toBe("Getting started");
    expect(coverageLabel(4)).toBe("Solid cushion");
    expect(coverageLabel(7)).toBe("Fully covered");
  });
});
