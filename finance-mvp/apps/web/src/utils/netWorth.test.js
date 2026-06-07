import { describe, it, expect } from "vitest";
import {
  computeDownfall,
  computeContributors,
  deriveUpcomingBills,
  NW_ALERT_THRESHOLD,
} from "./netWorth";

describe("computeDownfall", () => {
  it("flags a >15% fall over the series", () => {
    const { declinePct, alert } = computeDownfall([100000, 90000, 80000], 80000, -2000);
    expect(declinePct).toBeCloseTo(20, 5);
    expect(alert).toBe(true);
  });

  it("does not flag a rising series", () => {
    const { declinePct, alert } = computeDownfall([100000, 110000, 128430], 128430, 2140);
    expect(declinePct).toBeLessThan(0); // grew
    expect(alert).toBe(false);
  });

  it("does not flag a small (<15%) dip", () => {
    const { alert } = computeDownfall([100000, 95000], 95000, -5000);
    expect(alert).toBe(false);
  });

  it("accepts {value} series entries", () => {
    const { alert } = computeDownfall([{ value: 200000 }, { value: 150000 }], 150000, -50000);
    expect(alert).toBe(true); // 25% fall
  });

  it("falls back to 30d change when series is too short", () => {
    // prev = 100000 - (-30000) = 130000; decline = 30000/130000 = 23%
    const { alert } = computeDownfall([], 100000, -30000);
    expect(alert).toBe(true);
  });

  it("is honest (no fall) with no data", () => {
    expect(computeDownfall([], 0, 0)).toEqual({ declinePct: 0, alert: false });
  });

  it("uses the configured threshold", () => {
    expect(NW_ALERT_THRESHOLD).toBe(15);
  });
});

describe("computeContributors", () => {
  it("treats credit-card debt growth as a NEGATIVE contributor", () => {
    const rows = computeContributors({
      cash_change_30d: 2320,
      investments_change_30d: 10450,
      real_estate_equity_change_30d: 1800,
      credit_cards_change_30d: 1038, // debt grew -> should be negative
    });
    const cc = rows.find((r) => r.key === "credit_cards");
    expect(cc.value).toBe(-1038);
    // most-negative first
    expect(rows[0].key).toBe("credit_cards");
  });

  it("supports camelCase keys too", () => {
    const rows = computeContributors({ cashChange30d: 500 });
    expect(rows.find((r) => r.key === "cash").value).toBe(500);
  });

  it("drops categories with no meaningful change", () => {
    const rows = computeContributors({ cash_change_30d: 0, investments_change_30d: 0 });
    expect(rows).toHaveLength(0);
  });
});

describe("deriveUpcomingBills", () => {
  const intents = [
    { intent_id: "a", payee: "Electric", amount: 80, status: "PENDING", scheduled_date: "2026-06-20" },
    { intent_id: "b", payee: "Rent", amount: 1800, status: "SCHEDULED", scheduled_date: "2026-06-05" },
    { intent_id: "c", payee: "Old", amount: 50, status: "COMPLETED", scheduled_date: "2026-05-01" },
    { intent_id: "d", payee: "NoDate", amount: 10, status: "PENDING" },
  ];

  it("includes only scheduled/pending intents with a due date, soonest first", () => {
    const bills = deriveUpcomingBills(intents, (d) => d.toISOString().slice(0, 10));
    expect(bills.map((b) => b.id)).toEqual(["b", "a"]); // Rent (Jun 5) before Electric (Jun 20)
  });

  it("returns [] for no intents (honest empty state)", () => {
    expect(deriveUpcomingBills([])).toEqual([]);
  });
});
