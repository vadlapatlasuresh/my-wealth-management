import { describe, it, expect } from "vitest";
import { computeInvestmentInsights } from "./investmentInsights";

const h = (symbol, qty, price, extra = {}) => ({ symbol, name: symbol, qty, price, ...extra });

describe("computeInvestmentInsights", () => {
  it("is honest with an empty portfolio", () => {
    const r = computeInvestmentInsights({ holdings: [] });
    expect(r.hasData).toBe(false);
    expect(r.totalValue).toBe(0);
    expect(r.alerts).toEqual([]);
  });

  it("computes total value, position weights and separates cash", () => {
    const r = computeInvestmentInsights({
      holdings: [h("VOO", 10, 100), h("AAPL", 5, 100), h("CASH", 1, 500)],
    });
    expect(r.hasData).toBe(true);
    expect(r.totalValue).toBe(2000); // 1000 + 500 stocks + 500 cash
    // Weights are relative to the equity sleeve (1500), not total
    const voo = r.positions.find((p) => p.symbol === "VOO");
    expect(voo.weight).toBeCloseTo(1000 / 1500, 5);
    const cashMix = r.mix.find((m) => m.key === "cash");
    expect(cashMix.value).toBe(500);
  });

  it("flags single-position concentration", () => {
    const r = computeInvestmentInsights({
      holdings: [h("TSLA", 100, 100), h("VTI", 1, 100)], // TSLA ~99% of equity
    });
    expect(r.concentration.topSymbol).toBe("TSLA");
    expect(r.concentration.flagged).toBe(true);
    expect(r.alerts.some((a) => a.id === "concentration")).toBe(true);
  });

  it("estimates fees only for recognized funds and reports coverage", () => {
    const r = computeInvestmentInsights({
      holdings: [h("VOO", 10, 100), h("SOMEUNKNOWN", 10, 100)],
    });
    // Only VOO is recognized → coverage is half of the equity sleeve
    expect(r.fees.knownCount).toBe(1);
    expect(r.fees.coveragePct).toBeCloseTo(0.5, 5);
    expect(r.fees.weightedExpenseRatio).toBeCloseTo(0.0003, 6);
  });

  it("does not fabricate fees when nothing is recognized", () => {
    const r = computeInvestmentInsights({ holdings: [h("RANDOMCO", 10, 100)] });
    expect(r.fees.knownCount).toBe(0);
    expect(r.fees.weightedExpenseRatio).toBe(0);
    expect(r.fees.annualEstimate).toBe(0);
  });

  it("measures drift vs the target mix", () => {
    // All stocks, no alts/cash → over target on stocks, under on the rest
    const r = computeInvestmentInsights({ holdings: [h("VTI", 100, 100)] });
    const stocks = r.drift.find((d) => d.key === "stocks");
    expect(stocks.current).toBeCloseTo(1, 5);
    expect(stocks.diff).toBeCloseTo(0.2, 5); // 1.0 - 0.8 → over target by 20pts (flagged)
    expect(stocks.flagged).toBe(true);
    expect(r.alerts.some((a) => a.id === "drift-stocks")).toBe(true);
    // A 10pt cash underweight is within tolerance and must NOT flag
    expect(r.drift.find((d) => d.key === "cash").flagged).toBe(false);
  });

  it("counts alternatives toward the mix and total", () => {
    const r = computeInvestmentInsights({ holdings: [h("VTI", 10, 100)], altsTotal: 1000 });
    expect(r.totalValue).toBe(2000);
    const alt = r.mix.find((m) => m.key === "alternatives");
    expect(alt.value).toBe(1000);
  });
});
