import { describe, it, expect } from "vitest";
import { optimizeDueDates, dueDay } from "./billOptimizer";

const on = (day) => new Date(2026, 0, day).toISOString();
const bill = (name, amount, day) => ({ name, amount, cadence: "MONTHLY", nextDate: on(day) });

describe("dueDay", () => {
  it("extracts the day of month", () => {
    expect(dueDay(on(14))).toBe(14);
    expect(dueDay(null)).toBe(null);
    expect(dueDay("nope")).toBe(null);
  });
});

describe("optimizeDueDates", () => {
  it("is honest when there are too few bills", () => {
    const r = optimizeDueDates([bill("Rent", 2000, 1), bill("Phone", 60, 3)]);
    expect(r.hasData).toBe(false);
    expect(r.reason).toBe("few-bills");
    expect(r.suggestions).toEqual([]);
  });

  it("reports no suggestions when the spread is already even", () => {
    const r = optimizeDueDates([
      bill("Rent", 1000, 2),
      bill("Card", 500, 5),
      bill("Loan", 1500, 20),
    ]);
    expect(r.hasData).toBe(true);
    // 1500 vs 1500 → perfectly even
    expect(r.imbalance).toBeCloseTo(0, 5);
    expect(r.suggestions).toEqual([]);
  });

  it("suggests moving bills off a bunched-up window to smooth cash flow", () => {
    const r = optimizeDueDates([
      bill("Rent", 2000, 1),
      bill("Card", 400, 3),
      bill("Internet", 100, 5),
      bill("Gym", 50, 7),
      // nothing in the second half → heavy first half
    ]);
    expect(r.hasData).toBe(true);
    expect(r.heavyWindow).toBe("1st–15th");
    expect(r.lightWindow).toBe("16th–end");
    expect(r.suggestions.length).toBeGreaterThan(0);
    // Every suggestion moves a real bill from heavy → light
    for (const s of r.suggestions) {
      expect(s.fromWindow).toBe("1st–15th");
      expect(s.toWindow).toBe("16th–end");
      expect(s.amount).toBeGreaterThan(0);
    }
    // Projected spread must be tighter than the original
    const projSpread = Math.abs(r.projected[0].total - r.projected[1].total);
    const origSpread = Math.abs(r.windows[0].total - r.windows[1].total);
    expect(projSpread).toBeLessThan(origSpread);
  });

  it("moves smallest bills first to minimize disruption", () => {
    const r = optimizeDueDates([
      bill("Rent", 2000, 2),
      bill("Card", 300, 4),
      bill("Gym", 40, 6),
      bill("Water", 60, 8),
    ]);
    // Rent (biggest) should be the last thing it wants to move, if at all.
    const movedNames = r.suggestions.map((s) => s.name);
    if (movedNames.length) expect(movedNames[0]).not.toBe("Rent");
  });
});
