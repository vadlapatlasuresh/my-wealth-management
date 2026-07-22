import { describe, it, expect } from "vitest";
import { buildRecommendations, PRIORITY } from "./recommendations";

// Plaid convention: positive = a charge (money out), negative = money in.
const daysAgo = (n) => new Date(Date.now() - n * 24 * 3600 * 1000).toISOString();
const inMonth = (offset, day = 10) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - offset, day).toISOString();
};

const healthy = {
  accounts: [
    { type: "depository", currentBalance: 40000, name: "Checking" },
    { type: "investment", currentBalance: 100000 },
  ],
  transactions: [
    { amount: -8000, date: daysAgo(20) }, // income
    { amount: 2000, date: daysAgo(15) },  // spend
  ],
  snapshot: { netWorth: 140000, change30d: 1000 },
};

describe("buildRecommendations", () => {
  it("always returns actionable items with a route and label", () => {
    const recs = buildRecommendations(healthy);
    expect(recs.length).toBeGreaterThan(0);
    for (const r of recs) {
      expect(r.route).toBeTruthy();
      expect(r.actionLabel).toBeTruthy();
      expect(r.title).toBeTruthy();
    }
  });

  it("sorts urgent before important before opportunity", () => {
    const recs = buildRecommendations({
      accounts: [{ type: "depository", currentBalance: 20, name: "Checking" }], // low balance → urgent
      transactions: [
        { amount: -1000, date: daysAgo(20) },
        { amount: 3000, date: daysAgo(10) }, // spending > income → urgent
      ],
    });
    const ps = recs.map((r) => r.priority);
    expect(ps).toEqual([...ps].sort((a, b) => a - b));
    expect(ps[0]).toBe(PRIORITY.URGENT);
  });

  it("flags negative cash flow with the monthly gap", () => {
    const recs = buildRecommendations({
      accounts: [{ type: "depository", currentBalance: 5000 }],
      transactions: [
        { amount: -2000, date: daysAgo(20) }, // income 2000
        { amount: 3000, date: daysAgo(15) },  // spend 3000
      ],
    });
    const cf = recs.find((r) => r.id === "cashflow-negative");
    expect(cf).toBeTruthy();
    expect(cf.priority).toBe(PRIORITY.URGENT);
    expect(cf.route).toBe("/cash-flow");
  });

  it("escalates the emergency fund to urgent below one month of cover", () => {
    const recs = buildRecommendations({
      accounts: [{ type: "depository", currentBalance: 500 }],
      transactions: [{ amount: 2000, date: daysAgo(15) }], // 2000/mo spend → 0.25 months
    });
    const ef = recs.find((r) => r.id === "emergency-gap");
    expect(ef).toBeTruthy();
    expect(ef.priority).toBe(PRIORITY.URGENT);
  });

  it("surfaces a category that jumped month over month", () => {
    const recs = buildRecommendations({
      accounts: [{ type: "depository", currentBalance: 20000 }],
      transactions: [
        { amount: -6000, date: inMonth(0, 2) },
        { amount: 100, date: inMonth(1), category: "dining" },
        { amount: 400, date: inMonth(0), category: "dining" },
      ],
    });
    const spend = recs.find((r) => r.id === "spend-dining");
    expect(spend).toBeTruthy();
    expect(spend.route).toBe("/spending");
  });

  it("merges server AI insights as attributed items", () => {
    const recs = buildRecommendations({
      ...healthy,
      insights: [{ id: 7, title: "Refinance opportunity", suggestedAction: "Compare rates", severity: "ACTIONABLE" }],
    });
    const ai = recs.find((r) => r.source === "ai");
    expect(ai).toBeTruthy();
    expect(ai.title).toBe("Refinance opportunity");
    expect(ai.priority).toBe(PRIORITY.IMPORTANT); // ACTIONABLE ranks above plain opportunity
    expect(ai.route).toBe("/ai-assistant");
  });

  it("never invents money figures when there is no data", () => {
    const recs = buildRecommendations({ accounts: [], transactions: [] });
    // With nothing linked we still offer safe evergreen opportunities, but no
    // computed-money claims (no emergency gap, no cash-flow verdict).
    expect(recs.find((r) => r.id === "emergency-gap")).toBeUndefined();
    expect(recs.find((r) => r.id === "cashflow-negative")).toBeUndefined();
    expect(recs.every((r) => r.priority === PRIORITY.OPPORTUNITY)).toBe(true);
  });
});
