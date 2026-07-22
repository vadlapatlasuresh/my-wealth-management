import { describe, it, expect } from "vitest";
import { detectAlerts } from "./alerts";

const daysAgo = (n) => new Date(Date.now() - n * 24 * 3600 * 1000).toISOString();

describe("detectAlerts", () => {
  it("returns nothing for clean data", () => {
    const a = detectAlerts({
      accounts: [{ type: "depository", currentBalance: 5000, name: "Checking" }],
      transactions: [{ name: "Coffee", amount: -4, date: daysAgo(2), category: "dining" }],
    });
    expect(a).toEqual([]);
  });

  it("flags a low balance (high severity, first)", () => {
    const a = detectAlerts({
      accounts: [{ type: "depository", currentBalance: 40, name: "Checking" }],
      transactions: [],
    });
    expect(a.length).toBe(1);
    expect(a[0].severity).toBe("high");
    expect(a[0].title).toBe("Low balance");
  });

  it("flags a possible duplicate charge", () => {
    const a = detectAlerts({
      accounts: [],
      transactions: [
        { name: "Amazon", amount: -59.99, date: daysAgo(3), category: "shopping" },
        { name: "Amazon", amount: -59.99, date: daysAgo(1), category: "shopping" },
      ],
    });
    expect(a.some((x) => x.title === "Possible duplicate charge")).toBe(true);
  });

  it("flags an unusually large charge vs the category norm", () => {
    const txns = [];
    // 6 small dining charges establish the norm…
    for (let i = 0; i < 6; i++) txns.push({ name: `Cafe ${i}`, amount: -12, date: daysAgo(10 + i), category: "dining" });
    // …then one huge one.
    txns.push({ name: "Steakhouse", amount: -220, date: daysAgo(2), category: "dining" });
    const a = detectAlerts({ accounts: [], transactions: txns });
    expect(a.some((x) => x.title === "Unusually large charge")).toBe(true);
  });

  it("flags a recurring price increase", () => {
    const a = detectAlerts({
      accounts: [],
      transactions: [
        { name: "Spotify", amount: -10, date: daysAgo(90), category: "entertainment" },
        { name: "Spotify", amount: -10, date: daysAgo(60), category: "entertainment" },
        { name: "Spotify", amount: -13, date: daysAgo(5), category: "entertainment" },
      ],
    });
    expect(a.some((x) => x.title === "Price went up")).toBe(true);
  });

  it("orders high severity before medium", () => {
    const a = detectAlerts({
      accounts: [{ type: "depository", currentBalance: 10, name: "Checking" }],
      transactions: [
        { name: "Spotify", amount: -10, date: daysAgo(90), category: "entertainment" },
        { name: "Spotify", amount: -10, date: daysAgo(60), category: "entertainment" },
        { name: "Spotify", amount: -13, date: daysAgo(5), category: "entertainment" },
      ],
    });
    expect(a[0].severity).toBe("high");
  });
});
