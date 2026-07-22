// Pure "next best action" engine (no React), unit-testable in isolation. Side-effect free.
//
// This is the proactive layer: it composes the signals the app already computes —
// health-score factors, emergency-fund gap, anomaly alerts, cash flow, spending movers,
// debt load — into a RANKED list of concrete actions, each with a number and a destination.
//
// Deliberately deterministic: the money figures come from our own math, never from a model,
// so a recommendation can't hallucinate a number. Server-side AI insights are merged in as
// lower-priority "opportunities" and clearly attributed.
// feature_key: individual.aiProactive.

import { computeHealthScore, summarizeAccounts } from "./healthScore";
import { computeEmergencyFund, monthlyContributionFor } from "./emergencyFund";
import { detectAlerts } from "./alerts";
import { monthlyBuckets, averages } from "./cashflow";
import { monthOverMonth } from "./spending";

/** Priority bands — lower sorts first. */
export const PRIORITY = { URGENT: 1, IMPORTANT: 2, OPPORTUNITY: 3 };

const money = (n) =>
  Number(n || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/**
 * Build a ranked list of recommendations.
 * Returns [{ id, priority, tone, icon, title, detail, actionLabel, route, source }].
 * `source` is 'computed' for our own math or 'ai' for a server insight.
 */
export function buildRecommendations({
  accounts = [],
  transactions = [],
  snapshot = null,
  insights = [],
} = {}) {
  const recs = [];
  const { debt } = summarizeAccounts(accounts);

  // ---- URGENT: anomalies that cost money if ignored -------------------------
  for (const a of detectAlerts({ accounts, transactions }).filter((x) => x.severity === "high")) {
    recs.push({
      id: `alert-${a.key}`,
      priority: PRIORITY.URGENT,
      tone: "red",
      icon: a.icon,
      title: a.title,
      detail: a.detail,
      actionLabel: "Review",
      route: a.route || "/alerts",
      source: "computed",
    });
  }

  // ---- URGENT: spending more than you earn ---------------------------------
  const buckets = monthlyBuckets(transactions, 6);
  const { avgIncome, avgSpend, avgNet } = averages(buckets);
  if (avgIncome > 0 && avgNet < 0) {
    recs.push({
      id: "cashflow-negative",
      priority: PRIORITY.URGENT,
      tone: "red",
      icon: "ti ti-trending-down",
      title: "You're spending more than you earn",
      detail: `Averaging ${money(avgSpend)}/mo out vs ${money(avgIncome)}/mo in — a gap of ${money(Math.abs(avgNet))}/mo.`,
      actionLabel: "See cash flow",
      route: "/cash-flow",
      source: "computed",
    });
  }

  // ---- IMPORTANT: emergency fund gap ---------------------------------------
  const fund = computeEmergencyFund({ accounts, transactions, targetMonths: 6 });
  if (fund.computable && fund.gap > 0) {
    const perMonth = monthlyContributionFor(fund.gap, 12);
    recs.push({
      id: "emergency-gap",
      priority: fund.monthsCovered < 1 ? PRIORITY.URGENT : PRIORITY.IMPORTANT,
      tone: fund.monthsCovered < 1 ? "red" : "amber",
      icon: "ti ti-umbrella",
      title: fund.monthsCovered < 1 ? "You have less than a month of savings" : "Build your emergency fund",
      detail: `${fund.monthsCovered.toFixed(1)} months covered. Save ${money(perMonth)}/mo to reach 6 months within a year.`,
      actionLabel: "Open coach",
      route: "/emergency-fund",
      source: "computed",
    });
  }

  // ---- IMPORTANT: weak health-score factors --------------------------------
  const health = computeHealthScore({ accounts, transactions, snapshot });
  if (health.computable) {
    for (const f of health.factors.filter((x) => x.score < 60 && x.key !== "emergency")) {
      recs.push({
        id: `health-${f.key}`,
        priority: PRIORITY.IMPORTANT,
        tone: "amber",
        icon: f.icon,
        title: `Improve your ${f.label.toLowerCase()}`,
        detail: `${f.detail}. ${f.action}`,
        actionLabel: f.key === "debt" ? "Open Debt Lab" : "See score",
        route: f.key === "debt" ? "/debt" : "/health-score",
        source: "computed",
      });
    }
  }

  // ---- IMPORTANT: a category that jumped -----------------------------------
  const risers = monthOverMonth(transactions).filter((m) => m.diff > 0);
  if (risers.length) {
    const top = risers[0];
    recs.push({
      id: `spend-${top.category}`,
      priority: PRIORITY.IMPORTANT,
      tone: "amber",
      icon: "ti ti-arrow-up-right",
      title: `${cap(top.category)} spending jumped`,
      detail: top.deltaPct === null
        ? `${cap(top.category)} is new this month at ${money(top.current)}.`
        : `Up ${Math.round(top.deltaPct)}% — ${money(top.current)} vs ${money(top.previous)} last month.`,
      actionLabel: "See spending",
      route: "/spending",
      source: "computed",
    });
  }

  // ---- OPPORTUNITY: trim recurring / pay down debt -------------------------
  if (debt > 0) {
    recs.push({
      id: "debt-payoff",
      priority: PRIORITY.OPPORTUNITY,
      tone: "forest",
      icon: "ti ti-trending-down",
      title: "Model a faster debt payoff",
      detail: `You carry ${money(debt)} in linked debt. Compare avalanche vs snowball and see the interest saved.`,
      actionLabel: "Open Debt Lab",
      route: "/debt",
      source: "computed",
    });
  }
  recs.push({
    id: "recurring-review",
    priority: PRIORITY.OPPORTUNITY,
    tone: "forest",
    icon: "ti ti-repeat",
    title: "Review your subscriptions",
    detail: "Recurring charges are the easiest money to get back — check for ones you forgot.",
    actionLabel: "Open radar",
    route: "/recurring",
    source: "computed",
  });

  // ---- OPPORTUNITY: server-side AI insights (attributed) -------------------
  for (const ins of insights || []) {
    const title = typeof ins === "string" ? ins : ins.title;
    if (!title) continue;
    const detail = typeof ins === "string" ? "" : ins.suggestedAction || ins.reason || "";
    recs.push({
      id: `ai-${ins.id ?? title}`,
      priority: (typeof ins !== "string" && ins.severity === "ACTIONABLE")
        ? PRIORITY.IMPORTANT
        : PRIORITY.OPPORTUNITY,
      tone: "forest",
      icon: "ti ti-sparkles",
      title,
      detail,
      actionLabel: "Ask AI",
      route: "/ai-assistant",
      source: "ai",
    });
  }

  return recs.sort((a, b) => a.priority - b.priority);
}

function cap(s) {
  const t = String(s || "");
  return t.charAt(0).toUpperCase() + t.slice(1);
}
