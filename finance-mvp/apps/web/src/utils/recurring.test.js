import { describe, it, expect } from "vitest";
import { obligationsFromAccounts, mergeRecurring, monthlyTotal, isObligationAccount } from "./recurring";

const accounts = [
  { id: 1, name: "Plaid Checking", type: "depository", currentBalance: 1200 },
  { id: 2, name: "Plaid Credit Card", type: "credit", currentBalance: 410,
    minimumPayment: 25, nextPaymentDueDate: "2026-08-05", mask: "3333" },
  { id: 3, name: "Student Loan", type: "loan", currentBalance: 12000,
    minimumPayment: 180, nextPaymentDueDate: "2026-08-01" },
  { id: 4, name: "Card no minimum", type: "credit", currentBalance: 50 }, // no stated minimum
];

describe("obligationsFromAccounts", () => {
  it("includes only credit/loan accounts that state a minimum payment", () => {
    const o = obligationsFromAccounts(accounts);
    expect(o.map((x) => x.name)).toEqual(["Plaid Credit Card", "Student Loan"]);
  });

  it("never invents an amount when the account has no stated minimum", () => {
    expect(obligationsFromAccounts([{ id: 9, name: "X", type: "credit" }])).toEqual([]);
  });

  it("marks them as coming from the account, not inferred", () => {
    expect(obligationsFromAccounts(accounts)[0].source).toBe("account");
  });

  it("ignores depository accounts", () => {
    expect(isObligationAccount({ type: "depository" })).toBe(false);
    expect(isObligationAccount({ type: "credit" })).toBe(true);
  });
});

describe("mergeRecurring", () => {
  it("combines detected subscriptions with account obligations, soonest first", () => {
    const detected = [{ name: "Spotify", amount: 10.99, cadence: "MONTHLY", nextDate: "2026-08-03" }];
    const merged = mergeRecurring(detected, obligationsFromAccounts(accounts));
    expect(merged.map((m) => m.name)).toEqual(["Student Loan", "Spotify", "Plaid Credit Card"]);
    expect(merged.find((m) => m.name === "Spotify").source).toBe("detected");
  });

  it("puts undated items last rather than dropping them", () => {
    const merged = mergeRecurring([{ name: "No date", amount: 5, cadence: "MONTHLY", nextDate: null }],
      obligationsFromAccounts(accounts));
    expect(merged[merged.length - 1].name).toBe("No date");
  });
});

describe("monthlyTotal", () => {
  it("normalizes cadences before summing", () => {
    const total = monthlyTotal([
      { amount: 10, cadence: "MONTHLY" },
      { amount: 120, cadence: "YEARLY" },   // = 10/mo
    ]);
    expect(total).toBeCloseTo(20, 5);
  });
});
