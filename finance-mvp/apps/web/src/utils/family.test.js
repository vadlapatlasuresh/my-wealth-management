import { describe, it, expect } from "vitest";
import {
  validateSplit, splitAmounts, annualizedAllowance, nextAllowanceDate,
  summarizeBalances, savingsProjection, summarizeChores, ageLabel, BUCKETS,
} from "./family";

describe("validateSplit", () => {
  it("accepts a split that adds to 100", () => {
    expect(validateSplit({ spend: 50, save: 30, give: 20 })).toEqual({ valid: true, error: null });
    expect(validateSplit({ spend: 100, save: 0, give: 0 }).valid).toBe(true);
  });

  it("rejects a split that doesn't, and says by how much", () => {
    const r = validateSplit({ spend: 50, save: 30, give: 30 });
    expect(r.valid).toBe(false);
    expect(r.error).toContain("110%");
  });

  it("rejects negative or fractional shares", () => {
    expect(validateSplit({ spend: 110, save: -10, give: 0 }).valid).toBe(false);
    expect(validateSplit({ spend: 33.5, save: 33.5, give: 33 }).valid).toBe(false);
  });
});

describe("splitAmounts", () => {
  it("splits cleanly when the percentages divide", () => {
    expect(splitAmounts(10, { spend: 50, save: 30, give: 20 }))
      .toEqual({ SPEND: 5, SAVE: 3, GIVE: 2, total: 10 });
  });

  it("matches the server's rounding: save/give round down, spend absorbs the remainder", () => {
    // Same case as FamilyServiceTest.roundingGoesToSpendSoNoCentIsLostOrInvented.
    const s = splitAmounts(10, { spend: 33, save: 33, give: 34 });
    expect(s.SAVE).toBe(3.3);
    expect(s.GIVE).toBe(3.4);
    expect(s.SPEND).toBe(3.3);
    // The invariant: the preview a parent sees sums to exactly what gets paid.
    expect(s.SPEND + s.SAVE + s.GIVE).toBeCloseTo(10, 10);
  });

  it("never loses a cent across awkward amounts", () => {
    for (const amount of [0.03, 0.07, 1.01, 7.77, 19.99, 33.33]) {
      const s = splitAmounts(amount, { spend: 33, save: 33, give: 34 });
      expect(s.SPEND + s.SAVE + s.GIVE).toBeCloseTo(amount, 10);
    }
  });

  it("returns zeros for a zero or negative allowance", () => {
    expect(splitAmounts(0, { spend: 100 })).toEqual({ SPEND: 0, SAVE: 0, GIVE: 0, total: 0 });
    expect(splitAmounts(-5, { spend: 100 }).total).toBe(0);
  });
});

describe("annualizedAllowance", () => {
  it("makes the yearly cost concrete", () => {
    expect(annualizedAllowance(10, "WEEKLY")).toBe(520);
    expect(annualizedAllowance(10, "BIWEEKLY")).toBe(260);
    expect(annualizedAllowance(40, "MONTHLY")).toBe(480);
  });
  it("falls back to weekly for an unknown cadence", () => {
    expect(annualizedAllowance(10, "NONSENSE")).toBe(520);
  });
});

describe("nextAllowanceDate", () => {
  // Wednesday 2026-07-01.
  const wed = new Date(2026, 6, 1);

  it("finds the next occurrence of a weekday, never today", () => {
    const friday = nextAllowanceDate("WEEKLY", 5, wed); // ISO 5 = Friday
    expect(friday.getDay()).toBe(5);
    expect(friday.getDate()).toBe(3);

    // Asking for today's weekday rolls to next week rather than paying twice today.
    const nextWed = nextAllowanceDate("WEEKLY", 3, wed);
    expect(nextWed.getDate()).toBe(8);
  });

  it("handles Sunday, which JS numbers as 0 and ISO as 7", () => {
    const sunday = nextAllowanceDate("WEEKLY", 7, wed);
    expect(sunday.getDay()).toBe(0);
    expect(sunday.getDate()).toBe(5);
  });

  it("rolls a monthly payout into next month once the day has passed", () => {
    const thisMonth = nextAllowanceDate("MONTHLY", 15, wed);
    expect(thisMonth.getMonth()).toBe(6); // July
    expect(thisMonth.getDate()).toBe(15);

    const nextMonth = nextAllowanceDate("MONTHLY", 1, wed); // the 1st is today
    expect(nextMonth.getMonth()).toBe(7); // August
  });

  it("clamps a monthly day to 28 so every month has one", () => {
    const d = nextAllowanceDate("MONTHLY", 31, new Date(2026, 1, 1)); // February
    expect(d.getDate()).toBe(28);
  });

  it("returns null for a cadence it can't resolve", () => {
    expect(nextAllowanceDate("YEARLY", 1, wed)).toBeNull();
  });
});

describe("summarizeBalances", () => {
  it("shapes the server's buckets and totals them", () => {
    const s = summarizeBalances({ SPEND: 12.5, SAVE: 30, GIVE: 2.5 });
    expect(s.rows.map((r) => r.key)).toEqual(BUCKETS.map((b) => b.key));
    expect(s.total).toBe(45);
  });
  it("treats a missing bucket as zero, not NaN", () => {
    const s = summarizeBalances({ SPEND: 10 });
    expect(s.total).toBe(10);
    expect(s.rows.find((r) => r.key === "SAVE").amount).toBe(0);
  });
});

describe("savingsProjection", () => {
  it("projects contributions only — no invented growth rate", () => {
    const p = savingsProjection(20, 3, "WEEKLY", 12);
    expect(p.periods).toBe(52);
    expect(p.contributed).toBe(156);
    expect(p.projected).toBe(176); // 20 + 156, with no interest assumed
  });
  it("scales with the horizon", () => {
    expect(savingsProjection(0, 10, "MONTHLY", 6).periods).toBe(6);
  });
});

describe("summarizeChores", () => {
  const chores = [
    { id: 1, title: "Dishes", rewardAmount: 2.5, completedAt: null },
    { id: 2, title: "Bins", rewardAmount: 1.5, completedAt: null },
    { id: 3, title: "Homework", rewardAmount: 5, completedAt: "2026-07-01T10:00:00" },
  ];
  it("separates outstanding from done and totals both", () => {
    const s = summarizeChores(chores);
    expect(s.openCount).toBe(2);
    expect(s.openReward).toBe(4);
    expect(s.earned).toBe(5);
  });
  it("handles no chores at all", () => {
    expect(summarizeChores([]).openCount).toBe(0);
    expect(summarizeChores(undefined).openReward).toBe(0);
  });
});

describe("ageLabel", () => {
  it("reads an age from a birth year", () => {
    expect(ageLabel(2015, new Date(2026, 0, 1))).toBe("11 years old");
  });
  it("says nothing rather than something wrong", () => {
    expect(ageLabel(null)).toBeNull();
    expect(ageLabel(1800)).toBeNull();
    expect(ageLabel(2099, new Date(2026, 0, 1))).toBeNull();
  });
});
