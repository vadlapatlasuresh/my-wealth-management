import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import React from "react";

import TodayPage from "./TodayPage";
import AlertsPage from "./AlertsPage";
import CashFlowPage from "./CashFlowPage";
import HealthScorePage from "./HealthScorePage";
import SpendingInsightsPage from "./SpendingInsightsPage";
import CoachPage from "./CoachPage";
import EmergencyFundPage from "./EmergencyFundPage";

/*
 * Render smoke tests for the Phase 2/3 screens.
 *
 * These exist because "the new screens are blank" was reported repeatedly. They answer the
 * question directly and mechanically: GIVEN realistic data, do these pages render real numbers,
 * or do they fall through to their empty states? A failure here means a code bug; a pass means
 * the screens work and any blankness upstream is the data reaching them.
 *
 * Rendered with react-dom/server (no jsdom in this project). Effects don't run under SSR, so
 * pages that fetch their own data are covered separately by their util tests.
 */

const daysAgo = (n) => new Date(Date.now() - n * 24 * 3600 * 1000).toISOString();
const inMonth = (off, day = 10) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - off, day).toISOString();
};

// Plaid convention, the one the app actually receives: amount > 0 is money OUT.
const accounts = [
  { id: 1, name: "Plaid Checking", type: "depository", currentBalance: 12480 },
  { id: 2, name: "Plaid Savings", type: "depository", currentBalance: 43200 },
  { id: 3, name: "Plaid Credit Card", type: "credit", currentBalance: 2410 },
  { id: 4, name: "Brokerage", type: "investment", currentBalance: 86300 },
];

const transactions = [
  { id: 1, name: "Payroll", amount: -6000, date: inMonth(0, 2), category: "income" },
  { id: 2, name: "Payroll", amount: -6000, date: inMonth(1, 2), category: "income" },
  { id: 3, name: "Rent", amount: 2060, date: inMonth(0, 3), category: "housing" },
  { id: 4, name: "Rent", amount: 2060, date: inMonth(1, 3), category: "housing" },
  { id: 5, name: "Whole Foods", amount: 128.44, date: daysAgo(2), category: "groceries" },
  { id: 6, name: "Uber", amount: 5.4, date: daysAgo(3), category: "transport" },
  { id: 7, name: "Uber", amount: 5.4, date: daysAgo(3), category: "transport" },
  { id: 8, name: "Steakhouse", amount: 220, date: daysAgo(4), category: "dining" },
  { id: 9, name: "Cafe", amount: 12, date: daysAgo(9), category: "dining" },
  { id: 10, name: "Cafe", amount: 12, date: daysAgo(12), category: "dining" },
  { id: 11, name: "Dining", amount: 400, date: inMonth(0, 5), category: "dining" },
  { id: 12, name: "Dining", amount: 100, date: inMonth(1, 5), category: "dining" },
];

const snapshot = { netWorth: 139570, change30d: 2140 };

const render = (el) => renderToString(<MemoryRouter>{el}</MemoryRouter>);

describe("new screens render real data (not empty states)", () => {
  it("Today shows the health ring, stats and recent activity", () => {
    const html = render(
      <TodayPage
        snapshot={snapshot}
        accounts={accounts}
        transactions={transactions}
        paymentIntents={[]}
        insights={[]}
        user={{ name: "Alex" }}
        formatDate={(d) => String(d)}
      />
    );
    expect(html).not.toContain("Link an account to begin");
    expect(html).toContain("Financial health");
    expect(html).toContain("Net worth");
    expect(html).toContain("Recent activity");
    expect(html).toContain("Whole Foods");
  });

  it("Health Score computes a score rather than asking to link accounts", () => {
    const html = render(
      <HealthScorePage accounts={accounts} transactions={transactions} snapshot={snapshot} />
    );
    expect(html).not.toContain("Link accounts to see your score");
    expect(html).toContain("out of 100");
    expect(html).toContain("Savings rate");
    expect(html).toContain("Emergency fund");
  });

  it("Cash Flow shows safe-to-spend and monthly averages", () => {
    const html = render(
      <CashFlowPage accounts={accounts} transactions={transactions} paymentIntents={[]} />
    );
    expect(html).not.toContain("No cash flow yet");
    expect(html).toContain("Safe to spend right now");
    expect(html).toContain("Avg money in");
    expect(html).toContain("Last 6 months");
  });

  it("Spending shows category breakdown and top merchants", () => {
    const html = render(<SpendingInsightsPage transactions={transactions} />);
    expect(html).not.toContain("No spending to analyze yet");
    expect(html).toContain("Total spent");
    expect(html).toContain("By category");
    expect(html).toContain("Top merchants");
  });

  it("Alerts detects the duplicate Uber charge", () => {
    const html = render(<AlertsPage accounts={accounts} transactions={transactions} />);
    expect(html).not.toContain("Link accounts to enable alerts");
    expect(html).toContain("Possible duplicate charge");
  });

  it("Coach ranks real recommendations with numbers", () => {
    const html = render(
      <CoachPage
        accounts={accounts}
        transactions={transactions}
        snapshot={snapshot}
        insights={[]}
      />
    );
    expect(html).not.toContain("Link an account for personalized guidance");
    expect(html).toContain("recommendation");
    expect(html).toContain("Review your subscriptions");
  });

  it("Emergency Fund sizes a target from real expenses", () => {
    const html = render(<EmergencyFundPage accounts={accounts} transactions={transactions} />);
    expect(html).not.toContain("We need your spending first");
    expect(html).toContain("months covered");
    expect(html).toContain("Milestones");
  });
});

describe("empty states appear only when there is genuinely no data", () => {
  it("Today asks to link an account when nothing is linked", () => {
    const html = render(
      <TodayPage snapshot={null} accounts={[]} transactions={[]} paymentIntents={[]}
        insights={[]} user={{ name: "Alex" }} formatDate={(d) => String(d)} />
    );
    expect(html).toContain("Link an account to begin");
  });

  it("Health Score asks to link accounts with no data", () => {
    const html = render(<HealthScorePage accounts={[]} transactions={[]} snapshot={null} />);
    expect(html).toContain("Link accounts to see your score");
  });
});

/*
 * The theme ships `.page { display: none }` / `.page.active { display: block }` from the
 * pre-router tab switcher. A page root of `className="page"` therefore renders correct
 * markup that is invisible — the screen looks blank with no error, and every render test
 * above still passes because SSR never applies CSS. That shipped: ten Phase 2/3 screens
 * were blank in production while their APIs returned data. Assert the class on the source
 * so it can't regress.
 */
describe("page roots are visible under the theme's .page/.page.active rule", () => {
  const dir = new URL(".", import.meta.url).pathname;
  const pageFiles = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith("Page.jsx"));

  it("finds page components to check", () => {
    expect(pageFiles.length).toBeGreaterThan(10);
  });

  it.each(pageFiles)("%s never uses a bare .page root", (file) => {
    const src = fs.readFileSync(dir + file, "utf8");
    expect(src).not.toMatch(/className="page"/);
  });
});
