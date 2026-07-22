// Pure emergency-fund helpers (no React), unit-testable in isolation. Side-effect free.
// Reuses summarizeAccounts + monthlyCashFlow from healthScore.js so "months of expenses"
// means exactly the same thing here as it does in the health score.
// feature_key: individual.emergencyFund.

import { summarizeAccounts, monthlyCashFlow } from "./healthScore";

/** Standard milestones people actually aim for, in months of expenses. */
export const MILESTONES = [1, 3, 6];

/**
 * Compute emergency-fund status from linked accounts + recent transactions.
 * Returns { computable, liquidCash, monthlyExpenses, monthsCovered, targetMonths,
 *           targetAmount, gap, pct, milestones:[{months, amount, reached}] }.
 * `computable` is false when we can't establish a monthly expense figure — showing a
 * "0 months" scare number off no data would be dishonest.
 */
export function computeEmergencyFund({ accounts = [], transactions = [], targetMonths = 6 } = {}) {
  const { liquidCash } = summarizeAccounts(accounts);
  const { monthlySpend } = monthlyCashFlow(transactions);

  if (!monthlySpend || monthlySpend <= 0) {
    return {
      computable: false,
      liquidCash,
      monthlyExpenses: 0,
      monthsCovered: 0,
      targetMonths,
      targetAmount: 0,
      gap: 0,
      pct: 0,
      milestones: MILESTONES.map((m) => ({ months: m, amount: 0, reached: false })),
    };
  }

  const monthsCovered = liquidCash / monthlySpend;
  const targetAmount = monthlySpend * targetMonths;
  const gap = Math.max(0, targetAmount - liquidCash);
  const pct = targetAmount > 0 ? Math.min(1, liquidCash / targetAmount) : 0;

  return {
    computable: true,
    liquidCash,
    monthlyExpenses: monthlySpend,
    monthsCovered,
    targetMonths,
    targetAmount,
    gap,
    pct,
    milestones: MILESTONES.map((m) => ({
      months: m,
      amount: monthlySpend * m,
      reached: liquidCash >= monthlySpend * m,
    })),
  };
}

/** Monthly saving needed to close `gap` within `months`. 0 when already there. */
export function monthlyContributionFor(gap, months) {
  const g = Number(gap) || 0;
  const m = Number(months) || 0;
  if (g <= 0 || m <= 0) return 0;
  return g / m;
}

/** A short, honest status line for the current coverage. */
export function coverageLabel(monthsCovered) {
  if (!Number.isFinite(monthsCovered) || monthsCovered <= 0) return "Not started";
  if (monthsCovered < 1) return "Less than a month";
  if (monthsCovered < 3) return "Getting started";
  if (monthsCovered < 6) return "Solid cushion";
  return "Fully covered";
}
