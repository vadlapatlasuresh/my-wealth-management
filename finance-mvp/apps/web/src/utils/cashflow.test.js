import { describe, it, expect } from "vitest";
import { monthlyBuckets, averages, safeToSpend } from "./cashflow";

const thisMonth = (day = 15) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), day).toISOString();
};

describe("monthlyBuckets", () => {
  it("returns a continuous run of months even with no data", () => {
    const b = monthlyBuckets([], 6);
    expect(b.length).toBe(6);
    expect(b.every((m) => m.income === 0 && m.spend === 0 && m.net === 0)).toBe(true);
  });

  it("buckets income and spend by month with correct sign convention", () => {
    const b = monthlyBuckets(
      [
        { amount: 4000, date: thisMonth(3) },
        { amount: -1500, date: thisMonth(10) },
        { amount: -500, date: thisMonth(20) },
      ],
      6
    );
    const cur = b[b.length - 1];
    expect(cur.income).toBe(4000);
    expect(cur.spend).toBe(2000);
    expect(cur.net).toBe(2000);
  });
});

describe("averages", () => {
  it("ignores empty months", () => {
    const b = monthlyBuckets([{ amount: 3000, date: thisMonth(5) }, { amount: -1000, date: thisMonth(6) }], 6);
    const { avgIncome, avgSpend, avgNet } = averages(b);
    expect(avgIncome).toBe(3000);
    expect(avgSpend).toBe(1000);
    expect(avgNet).toBe(2000);
  });
});

describe("safeToSpend", () => {
  it("subtracts upcoming commitments from liquid cash", () => {
    expect(safeToSpend(5000, 1200)).toBe(3800);
  });
});
