import { describe, it, expect } from "vitest";
import {
  buildPayeeCategories,
  categoryForAccount,
  toPayee,
  CATEGORY_CREDIT_CARD,
  CATEGORY_MORTGAGE,
  CATEGORY_STUDENT_LOAN,
  CATEGORY_AUTO_LOAN,
  CATEGORY_OTHER,
} from "./payees";

const acct = (over = {}) => ({
  id: 1,
  name: "Account",
  officialName: "Big Bank",
  mask: "1234",
  type: "credit",
  subtype: "credit card",
  currentBalance: 100,
  ...over,
});

describe("categoryForAccount", () => {
  it("maps credit accounts to Credit Cards", () => {
    expect(categoryForAccount(acct())).toBe(CATEGORY_CREDIT_CARD);
  });

  it("maps loan subtypes to their own categories", () => {
    const loan = (subtype) => categoryForAccount(acct({ type: "loan", subtype }));
    expect(loan("mortgage")).toBe(CATEGORY_MORTGAGE);
    expect(loan("home equity")).toBe(CATEGORY_MORTGAGE);
    expect(loan("student")).toBe(CATEGORY_STUDENT_LOAN);
    expect(loan("auto")).toBe(CATEGORY_AUTO_LOAN);
  });

  it("falls back to Other for unrecognized loan subtypes", () => {
    expect(categoryForAccount(acct({ type: "loan", subtype: "line of credit" })))
      .toBe(CATEGORY_OTHER);
  });

  it("returns null for accounts that can't be paid", () => {
    expect(categoryForAccount(acct({ type: "depository", subtype: "checking" }))).toBeNull();
    expect(categoryForAccount(acct({ type: "investment", subtype: "401k" }))).toBeNull();
  });

  it("is case-insensitive on type and subtype", () => {
    expect(categoryForAccount(acct({ type: "LOAN", subtype: "Student" })))
      .toBe(CATEGORY_STUDENT_LOAN);
  });
});

describe("toPayee", () => {
  it("suggests the minimum payment when present", () => {
    const p = toPayee(acct({ minimumPayment: 35, lastStatementBalance: 900 }));
    expect(p.suggestedAmount).toBe(35);
  });

  it("falls back to the statement balance, then the current balance", () => {
    expect(toPayee(acct({ lastStatementBalance: 900 })).suggestedAmount).toBe(900);
    expect(toPayee(acct({ currentBalance: 250 })).suggestedAmount).toBe(250);
  });

  it("leaves a loan with no payment data without a suggested amount", () => {
    const p = toPayee(acct({ type: "loan", subtype: "auto", currentBalance: 18000 }));
    expect(p.suggestedAmount).toBeNull();
    expect(p.balance).toBe(18000);
  });

  it("returns null for non-payable accounts", () => {
    expect(toPayee(acct({ type: "depository", subtype: "savings" }))).toBeNull();
  });
});

describe("buildPayeeCategories", () => {
  const accounts = [
    acct({ id: 1, type: "credit", subtype: "credit card", minimumPayment: 35 }),
    acct({ id: 2, type: "loan", subtype: "mortgage", minimumPayment: 2100 }),
    acct({ id: 3, type: "loan", subtype: "student", minimumPayment: 310 }),
    acct({ id: 4, type: "depository", subtype: "checking" }),
  ];

  it("omits categories with no linked accounts", () => {
    const ids = buildPayeeCategories(accounts).map((c) => c.id);
    expect(ids).toEqual([CATEGORY_CREDIT_CARD, CATEGORY_MORTGAGE, CATEGORY_STUDENT_LOAN]);
    expect(ids).not.toContain(CATEGORY_AUTO_LOAN);
    expect(ids).not.toContain(CATEGORY_OTHER);
  });

  it("excludes funding accounts from the payable list", () => {
    const all = buildPayeeCategories(accounts).flatMap((c) => c.payees);
    expect(all.map((p) => p.id)).not.toContain(4);
  });

  it("orders payees within a category by soonest due date", () => {
    const cards = buildPayeeCategories([
      acct({ id: 10, nextPaymentDueDate: "2026-09-01" }),
      acct({ id: 11, nextPaymentDueDate: "2026-08-01" }),
      acct({ id: 12, nextPaymentDueDate: null }),
    ])[0];
    expect(cards.payees.map((p) => p.id)).toEqual([11, 10, 12]);
  });

  it("tags each payee with the payeeType its category submits", () => {
    const [cards, mortgage] = buildPayeeCategories(accounts);
    expect(cards.payees[0].payeeType).toBe("CREDIT_CARD");
    expect(mortgage.payees[0].payeeType).toBe("LOAN");
  });

  it("returns an empty list when nothing is linked", () => {
    expect(buildPayeeCategories([])).toEqual([]);
  });
});
