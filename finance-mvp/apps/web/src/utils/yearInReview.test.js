import { describe, it, expect } from "vitest";
import { yearInReview, availableYears } from "./yearInReview";

// Plaid convention: positive = a charge (money out), negative = money in.
const on = (y, m, d = 10) => new Date(y, m, d).toISOString();

const SAMPLE = [
  { name: "Salary", amount: -5000, date: on(2025, 0, 1) },
  { name: "Salary", amount: -5000, date: on(2025, 6, 1) },
  { name: "Rent", amount: 2000, date: on(2025, 0, 3), category: "Housing" },
  { name: "Rent", amount: 2000, date: on(2025, 6, 3), category: "Housing" },
  { name: "Whole Foods", amount: 120, date: on(2025, 0, 5), category: "Groceries" },
  { name: "Whole Foods", amount: 80, date: on(2025, 6, 5), category: "Groceries" },
  { name: "Amazon", amount: 300, date: on(2025, 6, 9), category: "Shopping" },
  { name: "Last year charge", amount: 999, date: on(2024, 5, 1), category: "Misc" },
];

describe("availableYears", () => {
  it("lists years with data, newest first, deduped", () => {
    expect(availableYears(SAMPLE)).toEqual([2025, 2024]);
  });
  it("ignores undated / bad rows", () => {
    expect(availableYears([{ amount: 5 }, { date: "not-a-date", amount: 5 }])).toEqual([]);
  });
});

describe("yearInReview", () => {
  const r = yearInReview(SAMPLE, 2025);

  it("only counts the requested year", () => {
    // 2024's $999 charge must not leak in
    expect(r.totalSpent).toBe(2000 + 2000 + 120 + 80 + 300);
    expect(r.totalIncome).toBe(10000);
    expect(r.net).toBe(10000 - 4500);
  });

  it("ranks categories by spend, largest first, with shares that sum to ~1", () => {
    expect(r.topCategories[0].category).toBe("Housing");
    const sum = r.topCategories.reduce((s, c) => s + c.share, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it("builds 12 months with stacked segments only where there was spend", () => {
    expect(r.months).toHaveLength(12);
    expect(r.months[0].total).toBe(2120); // Jan: rent + groceries
    expect(r.months[1].total).toBe(0);    // Feb: nothing
    const jan = r.months[0].segments.map((s) => s.key);
    expect(jan).toContain("Housing");
    expect(jan).toContain("Groceries");
  });

  it("identifies the biggest month and biggest single purchase", () => {
    expect(r.biggestMonth.label).toBe("Jul"); // 2000+80+300 = 2380 > Jan 2120
    expect(r.biggestPurchase.name).toBe("Rent");
    expect(r.biggestPurchase.amount).toBe(2000);
  });

  it("collapses tail categories into 'Other' beyond topN", () => {
    const many = [
      { amount: 100, date: on(2025, 0, 1), category: "A" },
      { amount: 90, date: on(2025, 0, 1), category: "B" },
      { amount: 80, date: on(2025, 0, 1), category: "C" },
      { amount: 5, date: on(2025, 0, 1), category: "Z" },
    ];
    const rr = yearInReview(many, 2025, { topN: 2 });
    const keys = rr.months[0].segments.map((s) => s.key);
    expect(keys).toContain("Other"); // C + Z collapsed
  });

  it("is honest with no data", () => {
    const empty = yearInReview([], 2025);
    expect(empty.hasData).toBe(false);
    expect(empty.totalSpent).toBe(0);
    expect(empty.biggestMonth).toBe(null);
    expect(empty.biggestPurchase).toBe(null);
  });
});
