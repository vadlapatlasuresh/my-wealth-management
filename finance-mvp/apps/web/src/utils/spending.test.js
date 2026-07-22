import { describe, it, expect } from "vitest";
import { charges, totalSpend, spendByCategory, topMerchants, monthOverMonth } from "./spending";

// Plaid convention: positive = a charge (money out), negative = money in.
const daysAgo = (n) => new Date(Date.now() - n * 24 * 3600 * 1000).toISOString();
const inMonth = (offset, day = 10) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - offset, day).toISOString();
};

describe("charges", () => {
  it("keeps only positive amounts (money out) and drops undated rows", () => {
    const c = charges([
      { name: "Salary", amount: -5000, date: daysAgo(3) }, // income → excluded
      { name: "Cafe", amount: 8, date: daysAgo(1), category: "dining" },
      { name: "Broken", amount: 20 }, // no date → excluded
    ]);
    expect(c.length).toBe(1);
    expect(c[0].name).toBe("Cafe");
  });
});

describe("totalSpend", () => {
  it("sums charges inside the window only", () => {
    const t = [
      { name: "A", amount: 100, date: daysAgo(5) },
      { name: "B", amount: 50, date: daysAgo(200) }, // outside 30d
      { name: "Pay", amount: -900, date: daysAgo(2) }, // income
    ];
    expect(totalSpend(t, 30)).toBe(100);
  });
});

describe("spendByCategory", () => {
  it("groups by category, largest first, with shares summing to ~1", () => {
    const rows = spendByCategory([
      { name: "A", amount: 300, date: daysAgo(2), category: "rent" },
      { name: "B", amount: 100, date: daysAgo(3), category: "dining" },
    ], 30);
    expect(rows[0].category).toBe("rent");
    expect(rows[0].total).toBe(300);
    const shareSum = rows.reduce((s, r) => s + r.share, 0);
    expect(shareSum).toBeCloseTo(1, 5);
  });

  it("labels missing categories as Uncategorized", () => {
    const rows = spendByCategory([{ name: "X", amount: 10, date: daysAgo(1) }], 30);
    expect(rows[0].category).toBe("Uncategorized");
  });
});

describe("topMerchants", () => {
  it("aggregates by merchant and ranks by spend", () => {
    const rows = topMerchants([
      { name: "Amazon", amount: 40, date: daysAgo(2) },
      { name: "Amazon", amount: 60, date: daysAgo(3) },
      { name: "Cafe", amount: 25, date: daysAgo(1) },
    ], 30, 5);
    expect(rows[0]).toMatchObject({ name: "Amazon", total: 100, count: 2 });
    expect(rows[1].name).toBe("Cafe");
  });
});

describe("monthOverMonth", () => {
  it("flags a category that rose meaningfully", () => {
    const rows = monthOverMonth([
      { name: "Dine", amount: 100, date: inMonth(1), category: "dining" },
      { name: "Dine", amount: 200, date: inMonth(0), category: "dining" },
    ]);
    const dining = rows.find((r) => r.category === "dining");
    expect(dining).toBeTruthy();
    expect(dining.deltaPct).toBeCloseTo(100, 5);
  });

  it("ignores small moves (noise)", () => {
    const rows = monthOverMonth([
      { name: "Dine", amount: 100, date: inMonth(1), category: "dining" },
      { name: "Dine", amount: 105, date: inMonth(0), category: "dining" },
    ]);
    expect(rows.length).toBe(0);
  });

  it("returns null deltaPct for a brand-new category", () => {
    const rows = monthOverMonth([
      { name: "Gym", amount: 80, date: inMonth(0), category: "fitness" },
    ]);
    expect(rows[0].deltaPct).toBeNull();
  });
});
