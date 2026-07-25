import { describe, it, expect } from "vitest";
import { monthlyBuckets, averages, safeToSpend, incomeBySource, cashFlowSankey } from "./cashflow";

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

  // Plaid convention: positive = money OUT (charge), negative = money IN (income).
  it("buckets income and spend by month with correct sign convention", () => {
    const b = monthlyBuckets(
      [
        { amount: -4000, date: thisMonth(3) },
        { amount: 1500, date: thisMonth(10) },
        { amount: 500, date: thisMonth(20) },
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
    const b = monthlyBuckets([{ amount: -3000, date: thisMonth(5) }, { amount: 1000, date: thisMonth(6) }], 6);
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

describe("incomeBySource", () => {
  it("groups inflows (amount < 0) by category, largest first", () => {
    const tx = [
      { amount: -4000, category: "Paycheck", date: thisMonth(2) },
      { amount: -1000, category: "Business income", date: thisMonth(3) },
      { amount: 500, category: "Groceries", date: thisMonth(4) }, // outflow — ignored
    ];
    const src = incomeBySource(tx, 365);
    expect(src.map((s) => s.name)).toEqual(["Paycheck", "Business income"]);
    expect(src[0].total).toBe(4000);
    expect(src[0].share).toBeCloseTo(0.8, 5);
  });
});

describe("cashFlowSankey", () => {
  const income = [{ name: "Paycheck", total: 6000 }, { name: "Business income", total: 2000 }];
  const spend = [{ category: "Housing", total: 3000 }, { category: "Groceries", total: 800 }];

  it("wires income → hub → expenses with a conserved hub total", () => {
    const m = cashFlowSankey({ income, spend });
    const hub = m.nodes.find((n) => n.side === "hub");
    expect(hub.value).toBe(8000);
    expect(m.inTotal).toBe(8000);
    expect(m.outTotal).toBe(3800);
    expect(m.net).toBe(4200);
    // Every inflow links to the hub, and the hub links to every expense.
    expect(m.links.filter((l) => l.target === "hub").length).toBe(2);
    expect(m.links.filter((l) => l.source === "hub").length).toBe(2);
  });

  it("collapses a long expense tail into a single Other node", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ category: `C${i}`, total: 12 - i }));
    const m = cashFlowSankey({ income, spend: many, maxOut: 8 });
    const outs = m.nodes.filter((n) => n.side === "out");
    expect(outs.length).toBe(9); // 8 head + Other
    expect(outs.some((n) => n.label === "Other")).toBe(true);
  });

  it("returns an empty model when there is no money movement", () => {
    expect(cashFlowSankey({ income: [], spend: [] }).nodes).toEqual([]);
  });
});
