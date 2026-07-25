import { describe, it, expect } from "vitest";
import { goalVisual, goalGradient, goalStatus } from "./goalVisuals";

describe("goalVisuals", () => {
  it("maps predefined goal categories to their thematic thumbnail", () => {
    expect(goalVisual({ name: "Emergency fund" }).emoji).toBe("🧯");
    expect(goalVisual({ name: "Home down payment" }).emoji).toBe("🏡");
    expect(goalVisual({ name: "Summer vacation" }).emoji).toBe("🏖️");
    expect(goalVisual({ name: "New car" }).emoji).toBe("🚗");
    expect(goalVisual({ name: "Our wedding" }).emoji).toBe("💍");
  });

  it("falls back to a generic target for unknown goals", () => {
    expect(goalVisual({ name: "Quokka figurine" }).emoji).toBe("🎯"); // matches nothing specific → default
    expect(goalVisual({}).emoji).toBe("🎯");
  });

  it("builds a two-stop gradient string", () => {
    expect(goalGradient({ name: "Vacation" })).toMatch(/^linear-gradient\(135deg, #[0-9A-Fa-f]{6}, #[0-9A-Fa-f]{6}\)$/);
  });

  it("marks a goal completed when saved meets target", () => {
    expect(goalStatus({ targetAmount: 1000, savedAmount: 1000 }).id).toBe("completed");
    expect(goalStatus({ targetAmount: 1000, savedAmount: 1200 }).tone).toBe("green");
  });

  // Deadline windows are computed relative to "now" so the test is clock-independent.
  const DAY = 24 * 3600 * 1000;
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

  it("flags a goal at risk when behind the pace to its deadline", () => {
    const createdAt = iso(Date.now() - 60 * DAY); // window is ~75% elapsed…
    const targetDate = iso(Date.now() + 20 * DAY);
    const s = goalStatus({ targetAmount: 1000, savedAmount: 100, createdAt, targetDate }); // …but only 10% saved
    expect(s.id).toBe("at_risk");
    expect(s.tone).toBe("amber");
  });

  it("treats on-pace goals as on track", () => {
    const createdAt = iso(Date.now() - 60 * DAY);
    const targetDate = iso(Date.now() + 20 * DAY);
    const s = goalStatus({ targetAmount: 1000, savedAmount: 800, createdAt, targetDate });
    expect(s.id).toBe("on_track");
    expect(s.tone).toBe("green");
  });
});
