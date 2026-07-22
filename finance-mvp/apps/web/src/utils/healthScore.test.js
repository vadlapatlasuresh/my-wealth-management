import { describe, it, expect } from "vitest";
import { computeHealthScore, summarizeAccounts, monthlyCashFlow } from "./healthScore";

const daysAgo = (n) => new Date(Date.now() - n * 24 * 3600 * 1000).toISOString();

describe("summarizeAccounts", () => {
  it("splits liquid cash, assets and debt by account type", () => {
    const { liquidCash, assets, debt } = summarizeAccounts([
      { type: "depository", currentBalance: 5000 },
      { type: "investment", currentBalance: 20000 },
      { type: "credit", currentBalance: 1500 },
      { type: "loan", currentBalance: 8000 },
    ]);
    expect(liquidCash).toBe(5000);
    expect(assets).toBe(25000);
    expect(debt).toBe(9500);
  });
});

describe("monthlyCashFlow", () => {
  it("returns nulls when there are no dated transactions", () => {
    expect(monthlyCashFlow([]).monthlyIncome).toBeNull();
  });
  // Plaid convention: positive = money OUT (charge), negative = money IN (income).
  it("treats negative as income and positive as spend", () => {
    const { monthlyIncome, monthlySpend } = monthlyCashFlow([
      { amount: -3000, date: daysAgo(20) },
      { amount: 1000, date: daysAgo(10) },
    ]);
    expect(monthlyIncome).toBeGreaterThan(0);
    expect(monthlySpend).toBeGreaterThan(0);
    expect(monthlyIncome).toBeGreaterThan(monthlySpend);
  });
});

describe("computeHealthScore", () => {
  it("is not computable with no data", () => {
    const r = computeHealthScore({ accounts: [], transactions: [], snapshot: null });
    expect(r.computable).toBe(false);
    expect(r.score).toBeNull();
  });

  it("scores a healthy profile highly", () => {
    const r = computeHealthScore({
      accounts: [
        { type: "depository", currentBalance: 30000 }, // big emergency fund
        { type: "investment", currentBalance: 100000 },
        { type: "credit", currentBalance: 500 },
      ],
      transactions: [
        { amount: -8000, date: daysAgo(30) }, // income (negative = money in)
        { amount: 3000, date: daysAgo(20) },  // spend  (positive = money out) → saving ~60%
      ],
      snapshot: { netWorth: 129500, change30d: 2000 },
    });
    expect(r.computable).toBe(true);
    expect(r.score).toBeGreaterThan(75);
    expect(r.factors.length).toBe(4);
  });

  it("only weights factors it can compute (no transactions => no savings/emergency factor)", () => {
    const r = computeHealthScore({
      accounts: [{ type: "depository", currentBalance: 1000 }, { type: "loan", currentBalance: 5000 }],
      transactions: [],
      snapshot: null,
    });
    // debt + net worth are computable from accounts alone; savings/emergency need transactions.
    const keys = r.factors.map((f) => f.key);
    expect(keys).toContain("debt");
    expect(keys).not.toContain("savings");
    expect(keys).not.toContain("emergency");
  });
});
