import { useState, useEffect, useMemo } from "react";
import { currency } from "../utils/format";
import LastRefreshed from "../components/LastRefreshed";
import { api } from "../api";

/* ============================================================
   Budgeting — built around the industry-standard 50/30/20 rule:
     • 50% Needs  • 30% Wants  • 20% Savings/Debt-payoff
   Each category is classified into one of those groups so the
   page can show your allocation vs. the recommended targets.
   ============================================================ */
const CATEGORY_LIBRARY = [
  // Needs (50%)
  { name: "Housing", group: "needs", icon: "ti ti-home", pctOfIncome: 0.25 },
  { name: "Groceries", group: "needs", icon: "ti ti-shopping-cart", pctOfIncome: 0.10 },
  { name: "Utilities", group: "needs", icon: "ti ti-bolt", pctOfIncome: 0.06 },
  { name: "Transportation", group: "needs", icon: "ti ti-car", pctOfIncome: 0.06 },
  { name: "Insurance", group: "needs", icon: "ti ti-shield", pctOfIncome: 0.03 },
  { name: "Healthcare", group: "needs", icon: "ti ti-heartbeat", pctOfIncome: 0 },
  { name: "Childcare", group: "needs", icon: "ti ti-baby-carriage", pctOfIncome: 0 },
  // Wants (30%)
  { name: "Dining", group: "wants", icon: "ti ti-tools-kitchen-2", pctOfIncome: 0.08 },
  { name: "Entertainment", group: "wants", icon: "ti ti-device-tv", pctOfIncome: 0.05 },
  { name: "Shopping", group: "wants", icon: "ti ti-shopping-bag", pctOfIncome: 0.07 },
  { name: "Subscriptions", group: "wants", icon: "ti ti-repeat", pctOfIncome: 0.03 },
  { name: "Travel", group: "wants", icon: "ti ti-plane", pctOfIncome: 0.05 },
  { name: "Personal Care", group: "wants", icon: "ti ti-massage", pctOfIncome: 0.02 },
  // Savings (20%)
  { name: "Emergency Fund", group: "savings", icon: "ti ti-umbrella", pctOfIncome: 0.05 },
  { name: "Investments", group: "savings", icon: "ti ti-chart-line", pctOfIncome: 0.10 },
  { name: "Retirement", group: "savings", icon: "ti ti-beach", pctOfIncome: 0.05 },
];

const GROUP_META = {
  needs: { label: "Needs", badge: "badge-forest", color: "var(--tv-forest)" },
  wants: { label: "Wants", badge: "badge-amber", color: "var(--tv-warning)" },
  savings: { label: "Savings", badge: "badge-green", color: "var(--tv-positive)" },
  other: { label: "Other", badge: "badge-gray", color: "var(--tv-text-muted)" },
};

/* The budgeting rule splits take-home pay across Needs / Wants / Savings.
   50/30/20 is the default; users can pick a preset or set their own split. */
const DEFAULT_RULE = { needs: 50, wants: 30, savings: 20 };
const RULE_PRESETS = [
  { needs: 50, wants: 30, savings: 20, note: "Balanced (classic)" },
  { needs: 50, wants: 20, savings: 30, note: "Aggressive saver" },
  { needs: 50, wants: 40, savings: 10, note: "Lifestyle-first" },
  { needs: 60, wants: 20, savings: 20, note: "Higher cost of living" },
  { needs: 70, wants: 20, savings: 10, note: "Tight budget" },
  { needs: 40, wants: 20, savings: 40, note: "FIRE / wealth-build" },
];

function loadRule() {
  try {
    const r = JSON.parse(localStorage.getItem("tv_budget_rule"));
    if (r && ["needs", "wants", "savings"].every((k) => Number.isFinite(Number(r[k])))) {
      return { needs: Number(r.needs), wants: Number(r.wants), savings: Number(r.savings) };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_RULE };
}

function groupForCategory(name) {
  const found = CATEGORY_LIBRARY.find((c) => c.name.toLowerCase() === (name || "").toLowerCase());
  return found ? found.group : "other";
}
function iconForCategory(name) {
  const found = CATEGORY_LIBRARY.find((c) => c.name.toLowerCase() === (name || "").toLowerCase());
  return found ? found.icon : "ti ti-tag";
}

/* Plain-language explainer for each payoff strategy. */
const STRATEGY_INFO = {
  AVALANCHE: { icon: "ti ti-flame", tagline: "Highest interest rate first", blurb: "Mathematically cheapest — pays the least total interest." },
  SNOWBALL: { icon: "ti ti-snowflake", tagline: "Smallest balance first", blurb: "Quick wins build momentum and motivation." },
  HYBRID: { icon: "ti ti-scale", tagline: "Balanced approach", blurb: "Clears small balances among your highest-rate debts." },
};

/* 35 -> "2 yr 11 mo" */
function fmtMonths(m) {
  const n = Number(m) || 0;
  if (n <= 0) return "—";
  const y = Math.floor(n / 12), mo = n % 12;
  return [y ? `${y} yr` : null, mo ? `${mo} mo` : null].filter(Boolean).join(" ") || `${n} mo`;
}

export default function PlanPage({
  planTab, setPlanTab, strategy, setStrategy, extraPayment, setExtraPayment,
  debtScenarios, onRunAllScenarios, debtLoading, formatDate,
}) {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`
  );
  const [budgetLines, setBudgetLines] = useState([]);
  const [notice, setNotice] = useState(""); // inline error/notice banner (replaces blocking alert())
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [filter, setFilter] = useState("all");
  const [income, setIncome] = useState(() => Number(localStorage.getItem("tv_budget_income")) || 0);
  const [adding, setAdding] = useState(false);
  const [newCat, setNewCat] = useState({ category: "", amount: "" });
  const [rule, setRule] = useState(loadRule);
  const [editingRule, setEditingRule] = useState(false);
  const [period, setPeriod] = useState("month"); // month | ytd | year

  // Persisted auto-fill preferences (Phase 3): default apply mode, account scope, always-excluded
  // categories, and category renames/combines. Stored locally so the user sets them once.
  const [afSettings, setAfSettings] = useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem("tv_budget_autofill") || "{}");
      return {
        mode: ["replace", "merge", "ask"].includes(s.mode) ? s.mode : "merge",
        excluded: Array.isArray(s.excluded) ? s.excluded : [],
        accounts: Array.isArray(s.accounts) ? s.accounts : null, // null = all accounts
        map: s.map && typeof s.map === "object" ? s.map : {},     // { "<lowercase raw cat>": "Label" }
      };
    } catch {
      return { mode: "merge", excluded: [], accounts: null, map: {} };
    }
  });
  const [accountsList, setAccountsList] = useState([]);   // linked accounts, for scope checkboxes
  const [showAfSettings, setShowAfSettings] = useState(false);
  const [newExcluded, setNewExcluded] = useState("");
  const [newMap, setNewMap] = useState({ from: "", to: "" });
  const saveAfSettings = (next) => {
    setAfSettings(next);
    try { localStorage.setItem("tv_budget_autofill", JSON.stringify(next)); } catch { /* non-fatal */ }
  };
  // Account scope helpers (settings.accounts: null = all; otherwise the included ids).
  const allAcctIds = accountsList.map((a) => a.id);
  const includedAccts = afSettings.accounts == null ? allAcctIds : afSettings.accounts;
  const toggleAccount = (id) => {
    const next = includedAccts.includes(id) ? includedAccts.filter((x) => x !== id) : [...includedAccts, id];
    saveAfSettings({ ...afSettings, accounts: next.length === allAcctIds.length ? null : next });
  };
  const addExcluded = (c) => {
    const v = (c || "").trim();
    if (!v || afSettings.excluded.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    saveAfSettings({ ...afSettings, excluded: [...afSettings.excluded, v] });
  };
  const removeExcluded = (c) => saveAfSettings({ ...afSettings, excluded: afSettings.excluded.filter((x) => x !== c) });
  const addMapping = (from, to) => {
    const f = (from || "").trim().toLowerCase();
    const t = (to || "").trim();
    if (!f || !t) return;
    saveAfSettings({ ...afSettings, map: { ...afSettings.map, [f]: t } });
  };
  const removeMapping = (from) => {
    const m = { ...afSettings.map };
    delete m[from];
    saveAfSettings({ ...afSettings, map: m });
  };
  // Closing settings re-scans an open review so the new filters apply to the preview.
  const closeAfSettings = () => { setShowAfSettings(false); if (review) autoFillFromAccounts(); };
  const [aggLoading, setAggLoading] = useState(false);
  const isAggregate = period !== "month";

  const ruleSum = rule.needs + rule.wants + rule.savings;
  const ruleValid = ruleSum === 100;
  const ruleLabel = `${rule.needs}/${rule.wants}/${rule.savings}`;

  function setRulePart(key, value) {
    setRule((prev) => ({ ...prev, [key]: Math.max(0, Math.min(100, Number(value) || 0)) }));
  }
  function applyRule(next) {
    setRule(next);
    localStorage.setItem("tv_budget_rule", JSON.stringify(next));
  }
  function saveRule() {
    if (!ruleValid) return;
    applyRule(rule);
    setEditingRule(false);
  }

  const [debts, setDebts] = useState([]);
  const [addingDebt, setAddingDebt] = useState(false);
  const [newDebt, setNewDebt] = useState({ name: "", balance: "", apr: "", minPayment: "" });

  const monthLabel = useMemo(() => {
    const [y, m] = currentMonth.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
  }, [currentMonth]);

  // The set of YYYY-MM months covered by the current period selection.
  function monthsForPeriod() {
    const [y, m] = currentMonth.split("-").map(Number);
    const fmt = (yy, mm) => `${yy}-${String(mm).padStart(2, "0")}`;
    if (period === "ytd") {
      const out = [];
      for (let mm = 1; mm <= m; mm++) out.push(fmt(y, mm));
      return out;
    }
    if (period === "year") {
      const out = [];
      const start = new Date(y, m - 1, 1);
      for (let i = 11; i >= 0; i--) {
        const d = new Date(start.getFullYear(), start.getMonth() - i, 1);
        out.push(fmt(d.getFullYear(), d.getMonth() + 1));
      }
      return out;
    }
    return [currentMonth];
  }

  const periodLabel = useMemo(() => {
    if (period === "ytd") return `Year to date · ${currentMonth.slice(0, 4)}`;
    if (period === "year") return "Last 12 months";
    return monthLabel;
  }, [period, currentMonth, monthLabel]);

  // Days elapsed / left for pace projection
  const { daysInMonth, daysPassed, daysLeft } = useMemo(() => {
    const [y, m] = currentMonth.split("-").map(Number);
    const dim = new Date(y, m, 0).getDate();
    const isCurrent = today.getFullYear() === y && today.getMonth() + 1 === m;
    const isPast = new Date(y, m, 0) < new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const passed = isCurrent ? today.getDate() : isPast ? dim : 0;
    return { daysInMonth: dim, daysPassed: passed, daysLeft: dim - passed };
  }, [currentMonth]);

  useEffect(() => {
    let cancelled = false;
    if (!isAggregate) {
      api.getBudget(currentMonth)
        .then(async (res) => {
          const withActuals = await applyLiveActuals(res?.lines || []);
          if (!cancelled) { setBudgetLines(withActuals); setDirty(false); }
        })
        .catch((e) => console.error("budget load failed", e));
      return () => { cancelled = true; };
    }
    // Aggregate view: fetch every month in the period and sum per category.
    setAggLoading(true);
    Promise.all(monthsForPeriod().map((m) => api.getBudget(m).catch(() => ({ lines: [] }))))
      .then((results) => {
        if (cancelled) return;
        const byCat = {};
        results.forEach((res) => {
          (res?.lines || []).forEach((l) => {
            const key = l.category;
            if (!byCat[key]) byCat[key] = { category: key, amount: 0, spent: 0 };
            byCat[key].amount += Number(l.amount) || 0;
            byCat[key].spent += Number(l.spent) || 0;
          });
        });
        setBudgetLines(Object.values(byCat));
        setDirty(false);
      })
      .finally(() => { if (!cancelled) setAggLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonth, period]);

  useEffect(() => {
    // Linked accounts power the auto-fill "account scope" setting.
    api.getAccounts().then((r) => setAccountsList(Array.isArray(r) ? r : [])).catch(() => {});
  }, []);

  useEffect(() => {
    api.getDebts().then((res) => setDebts(res || [])).catch(() => {});
  }, []);

  // Phase 5 — detect when live spending has drifted from the saved budget and nudge to re-sync.
  // Runs when a budget is loaded for a real month; quiet unless the drift is meaningful.
  useEffect(() => {
    if (isAggregate || dirty || driftDismissed || budgetLines.length === 0) { setDrift(null); return; }
    let cancelled = false;
    api.getTransactions().then((txns) => {
      if (cancelled) return;
      const { byCat } = liveSpend(Array.isArray(txns) ? txns : []);
      if (Object.keys(byCat).length === 0) return;
      const budgetKeys = new Set(budgetLines.map((l) => l.category.toLowerCase()));
      const newCats = Object.values(byCat).filter((v) => v.spent >= 50 && !budgetKeys.has(v.label.toLowerCase())).map((v) => v.label);
      const changed = budgetLines.filter((l) => {
        const live = byCat[l.category.toLowerCase()]?.spent || 0;
        const budgeted = Number(l.amount) || 0;
        return budgeted > 0 && Math.abs(live - budgeted) >= 50 && Math.abs(live - budgeted) / budgeted >= 0.25;
      });
      // Only nudge for meaningful drift (a new category, or several changed) to avoid noise.
      if (newCats.length >= 1 || changed.length >= 2) setDrift({ newCats, changed });
      else setDrift(null);
    }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgetLines, currentMonth, isAggregate, dirty, driftDismissed, afSettings]);

  const totalBudget = useMemo(() => budgetLines.reduce((s, r) => s + (Number(r.amount) || 0), 0), [budgetLines]);
  const totalSpent = useMemo(() => budgetLines.reduce((s, r) => s + (Number(r.spent) || 0), 0), [budgetLines]);
  const pctUsed = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
  const projectedEnd = daysPassed > 0 ? (totalSpent / daysPassed) * daysInMonth : totalSpent;

  // Allocation by 50/30/20 group
  const byGroup = useMemo(() => {
    const g = { needs: 0, wants: 0, savings: 0, other: 0 };
    budgetLines.forEach((l) => { g[groupForCategory(l.category)] += Number(l.amount) || 0; });
    return g;
  }, [budgetLines]);

  function shiftMonth(delta) {
    const [y, m] = currentMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  function updateLine(idx, value) {
    setBudgetLines((prev) => prev.map((r, i) => (i === idx ? { ...r, amount: value } : r)));
    setDirty(true);
  }
  function removeLine(idx) {
    setBudgetLines((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  }
  function addCategory() {
    const name = newCat.category.trim();
    if (!name) return;
    if (budgetLines.some((l) => l.category.toLowerCase() === name.toLowerCase())) return;
    setBudgetLines((prev) => [...prev, { category: name, amount: Number(newCat.amount) || 0, spent: 0 }]);
    setNewCat({ category: "", amount: "" });
    setAdding(false);
    setDirty(true);
  }

  // Build income + spending categories automatically from the user's linked bank/card
  // transactions, so they don't have to enter everything by hand. Only changes local state
  // (nothing is saved until they click Save), so it's safe to re-run / undo by reloading.
  const [autoFilling, setAutoFilling] = useState(false);
  // The auto-fill REVIEW sheet: a proposal the user edits before it touches the budget.
  // null = closed. { income, periodLabel, accounts, lines:[{id,category,amount,spent,count,include}] }
  const [review, setReview] = useState(null);
  const [reviewMode, setReviewMode] = useState("merge"); // "replace" | "merge"
  const [expandedLine, setExpandedLine] = useState(null); // review line id whose transactions are shown
<<<<<<< Updated upstream
  // Phase 5 — keep-it-current: when live spending drifts from the saved budget, nudge to re-sync.
  const [drift, setDrift] = useState(null);             // { newCats:[], changed:[] } or null
  const [driftDismissed, setDriftDismissed] = useState(false);
=======
  // Transactions viewer — let the user see exactly what was spent (all of it, or one category).
  const [txnModal, setTxnModal] = useState(null);   // null = closed | { category: "all" | <name> }
  const [allTxns, setAllTxns] = useState([]);        // raw transactions, fetched lazily on first open
  const [txnsLoaded, setTxnsLoaded] = useState(false);
  const [txnsLoading, setTxnsLoading] = useState(false);
  const [txnSearch, setTxnSearch] = useState("");
  const [txnSort, setTxnSort] = useState("recent"); // "recent" | "amount"
>>>>>>> Stashed changes

  // Lightweight categorized spend for the current period, honoring the auto-fill filters
  // (account scope, excludes, renames). Used by the drift check + "Refresh actuals". Keep the
  // filtering in sync with autoFillFromAccounts.
  function liveSpend(all) {
    const inMonth = all.filter((t) => String(t.date || "").startsWith(currentMonth));
    let use = inMonth.length ? inMonth : all;
    if (Array.isArray(afSettings.accounts) && afSettings.accounts.length) {
      use = use.filter((t) => afSettings.accounts.includes(t.accountId));
    }
    const excluded = new Set((afSettings.excluded || []).map((c) => c.toLowerCase()));
    let income = 0;
    const byCat = {}; // lowercase category -> { label, spent }
    for (const t of use) {
      const amt = Number(t.amount) || 0;
      const raw = (t.category || "Uncategorized").trim() || "Uncategorized";
      const cat = afSettings.map[raw.toLowerCase()] || raw;
      if (/transfer|payment|credit card|loan/i.test(raw) || excluded.has(cat.toLowerCase()) || excluded.has(raw.toLowerCase())) continue;
      if (amt < 0) income += -amt;
      else { (byCat[cat.toLowerCase()] = byCat[cat.toLowerCase()] || { label: cat, spent: 0 }).spent += amt; }
    }
    return { income, byCat };
  }

  // Overlay live "spent" (from the latest transactions, same categorization as auto-fill) onto a
  // set of budget lines. The backend only persists category + target amount, so without this the
  // spent shown after a save/reload would come from a different source and look like it "reset".
  async function applyLiveActuals(lines) {
    try {
      const txns = await api.getTransactions();
      const { byCat } = liveSpend(Array.isArray(txns) ? txns : []);
      return lines.map((l) => ({ ...l, spent: Math.round(byCat[l.category.toLowerCase()]?.spent || 0) }));
    } catch {
      return lines;
    }
  }

  // Refresh just the actuals (the "spent" on each line) from the latest transactions — the light
  // alternative to a full re-sync. Doesn't change budget targets, so it never marks the budget dirty.
  async function refreshActuals() {
    setBudgetLines(await applyLiveActuals(budgetLines));
    setDrift(null);
    setNotice("Actuals refreshed from your latest transactions.");
  }

  // Map a raw transaction category to the label shown in the budget (honors the rename map).
  function txnCategory(t) {
    const raw = (t.category || "Uncategorized").trim() || "Uncategorized";
    return afSettings.map[raw.toLowerCase()] || raw;
  }

  // Transactions for the selected period (single month, or the YTD / 12-mo range), honoring the
  // account-scope filter so the list matches what the budget is built from.
  function periodTxns() {
    const months = monthsForPeriod();
    let use = allTxns.filter((t) => months.some((mo) => String(t.date || "").startsWith(mo)));
    if (Array.isArray(afSettings.accounts) && afSettings.accounts.length) {
      use = use.filter((t) => afSettings.accounts.includes(t.accountId));
    }
    return use;
  }

  // Open the transactions viewer (optionally pre-filtered to one category). Transactions are
  // fetched lazily on first open and cached for the session.
  async function openTransactions(category = "all") {
    setTxnModal({ category });
    setTxnSearch("");
    if (txnsLoaded) return;
    setTxnsLoading(true);
    try {
      const txns = await api.getTransactions();
      setAllTxns(Array.isArray(txns) ? txns : []);
      setTxnsLoaded(true);
    } catch (e) {
      setNotice(e?.message || "Couldn't load transactions — please try again.");
      setTxnModal(null);
    } finally {
      setTxnsLoading(false);
    }
  }

  // Read linked transactions, build a proposal, and OPEN the review sheet (nothing is applied
  // to the budget yet — the user adjusts and confirms first).
  async function autoFillFromAccounts() {
    setAutoFilling(true);
    setNotice("");
    try {
      // Fetch transactions + the user's detected recurring bills (to tag recurring spend).
      const [txnsRes, recurringRes] = await Promise.allSettled([api.getTransactions(), api.getRecurringBills()]);
      const all = txnsRes.status === "fulfilled" && Array.isArray(txnsRes.value) ? txnsRes.value : [];
      if (all.length === 0) {
        setNotice("No linked transactions yet — link a bank or card on the Accounts page first.");
        return;
      }
      const recurringNames = (recurringRes.status === "fulfilled" && Array.isArray(recurringRes.value) ? recurringRes.value : [])
        .map((b) => (b.name || "").trim().toLowerCase()).filter((n) => n.length > 2);
      const isRecurring = (name) => {
        const n = (name || "").toLowerCase();
        return recurringNames.some((r) => n.includes(r) || r.includes(n));
      };
      // Prefer transactions in the selected month; fall back to all recent ones.
      const inMonth = all.filter((t) => String(t.date || "").startsWith(currentMonth));
      let use = inMonth.length ? inMonth : all;
      // Account scope: restrict to the user's chosen accounts when set.
      if (Array.isArray(afSettings.accounts) && afSettings.accounts.length) {
        use = use.filter((t) => afSettings.accounts.includes(t.accountId));
      }
      // Skip transfers / credit-card payments (money movement) and any user-excluded category.
      const isTransfer = (c) => /transfer|payment|credit card|loan/i.test(c || "");
      const excluded = new Set((afSettings.excluded || []).map((c) => c.toLowerCase()));
      let inflow = 0;
      const byCat = {};
      for (const t of use) {
        const amt = Number(t.amount) || 0;
        const raw = (t.category || "Uncategorized").trim() || "Uncategorized";
        // Apply the user's rename/combine map (raw category -> custom label).
        const cat = afSettings.map[raw.toLowerCase()] || raw;
        if (isTransfer(raw) || excluded.has(cat.toLowerCase()) || excluded.has(raw.toLowerCase())) continue;
        if (amt < 0) inflow += -amt;                       // Plaid: negative = money in (income)
        else {
          const e = (byCat[cat] = byCat[cat] || { spent: 0, count: 0, txns: [] });
          e.spent += amt; e.count += 1;
          e.txns.push({ name: t.name || "—", date: t.date || "", amount: amt, recurring: isRecurring(t.name) });
        }
      }
      const lines = Object.entries(byCat)
        .filter(([, v]) => v.spent > 0)
        .sort((a, b) => b[1].spent - a[1].spent)
        .map(([category, v], i) => {
          // Flag a dominant one-off (≥50% of the category and ≥$200) so it doesn't distort the
          // monthly target; "typical" is the spend without it. Count recurring (subscription) txns.
          const sorted = [...v.txns].sort((a, b) => b.amount - a.amount);
          const top = sorted[0];
          const outlier = (v.txns.length >= 2 && top && top.amount >= 0.5 * v.spent && top.amount >= 200) ? top : null;
          const typical = outlier ? Math.max(0, Math.round(v.spent - top.amount)) : null;
          const recurringCount = v.txns.filter((t) => t.recurring).length;
          return {
            id: `af-${i}`, category, amount: Math.round(v.spent), spent: Math.round(v.spent),
            count: v.count, include: true, txns: sorted, outlier, typical, recurringCount,
          };
        });
      if (!lines.length && inflow <= 0) {
        setNotice("Found transactions but nothing to categorize as income or spending yet.");
        return;
      }
      setReviewMode(afSettings.mode === "ask" ? (budgetLines.length ? "merge" : "replace") : afSettings.mode);
      setReview({
        income: Math.round(inflow),
        periodLabel: inMonth.length ? monthLabel : "the last 30 days",
        accounts: new Set(use.map((t) => t.accountId)).size,
        lines,
      });
    } catch (e) {
      setNotice(e?.message || "Couldn't read your transactions — please try again.");
    } finally {
      setAutoFilling(false);
    }
  }

  // Per-line edits inside the review sheet — fix a wrong category, amount, exclude, or remove.
  const updateReviewLine = (id, patch) =>
    setReview((r) => (r ? { ...r, lines: r.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) } : r));
  const removeReviewLine = (id) =>
    setReview((r) => (r ? { ...r, lines: r.lines.filter((l) => l.id !== id) } : r));

  // Apply the (edited) proposal to the WORKING budget. Replace swaps the lines; Merge keeps
  // existing categories/targets, refreshes their actual spend, and adds new ones. Nothing is
  // saved server-side until the user clicks Save, so this is fully reversible by reloading.
  function applyReview() {
    if (!review) return;
    // Only included lines with a name; combine any the user renamed to the same category.
    const merged = {};
    review.lines
      .filter((l) => l.include && l.category.trim())
      .forEach((l) => {
        const name = l.category.trim();
        const k = name.toLowerCase();
        if (!merged[k]) merged[k] = { category: name, amount: 0, spent: 0 };
        merged[k].amount += Number(l.amount) || 0;
        merged[k].spent += Number(l.spent) || 0;
      });
    const detected = Object.values(merged);

    if (reviewMode === "replace") {
      setBudgetLines(detected);
    } else {
      setBudgetLines((prev) => {
        const out = prev.map((l) => ({ ...l }));
        const byKey = {};
        out.forEach((l) => { byKey[l.category.toLowerCase()] = l; });
        detected.forEach((d) => {
          const k = d.category.toLowerCase();
          if (byKey[k]) { byKey[k].spent = d.spent; }     // keep the user's target, refresh actuals
          else { const nl = { category: d.category, amount: d.amount, spent: d.spent }; out.push(nl); byKey[k] = nl; }
        });
        return out;
      });
    }
    if (review.income > 0) saveIncome(review.income);
    setDirty(true);
    const n = detected.length;
    setNotice(
      `${reviewMode === "replace" ? "Replaced your budget with" : "Merged in"} ${n} categor${n === 1 ? "y" : "ies"}` +
      `${review.income > 0 ? ` and set income to ${currency(review.income)}` : ""} — review and click Save to keep it.`
    );
    setReview(null);
  }

  function applyTemplate() {
    if (!income || income <= 0) {
      setNotice(`Enter your monthly take-home income first to build a ${ruleLabel} budget.`);
      return;
    }
    setNotice("");
    // The library's pctOfIncome sums to the classic 50/30/20 within each group.
    // Scale each group so its total matches the user's chosen rule split.
    const baseGroupSum = { needs: 0, wants: 0, savings: 0 };
    CATEGORY_LIBRARY.forEach((c) => {
      if (baseGroupSum[c.group] != null) baseGroupSum[c.group] += c.pctOfIncome;
    });
    const lines = CATEGORY_LIBRARY
      .filter((c) => c.pctOfIncome > 0 && baseGroupSum[c.group] > 0)
      .map((c) => {
        const groupShare = rule[c.group] / 100; // target fraction of income for this group
        const scale = groupShare / baseGroupSum[c.group];
        return { category: c.name, amount: Math.round(income * c.pctOfIncome * scale), spent: 0 };
      });
    setBudgetLines(lines);
    setDirty(true);
  }

  async function saveBudget() {
    setSaving(true);
    setSavedAt(false);
    try {
      const lines = budgetLines.map((l) => ({ category: l.category, amount: Number(l.amount) || 0 }));
      const updated = await api.putBudget(currentMonth, lines);
      // The backend stores only category + amount; re-overlay live actuals so "spent" sticks
      // (consistent with what auto-fill showed) instead of appearing to reset after Save.
      setBudgetLines(await applyLiveActuals(updated?.lines || lines));
      setDirty(false);
      setSavedAt(true);
      setTimeout(() => setSavedAt(false), 2500);
    } catch (e) {
      console.error("save failed", e);
      setNotice("Could not save the budget. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function exportCsv() {
    const rows = [["Category", "Group", "Budget", "Spent", "Remaining"]];
    budgetLines.forEach((l) => {
      const amt = Number(l.amount) || 0, sp = Number(l.spent) || 0;
      rows.push([l.category, GROUP_META[groupForCategory(l.category)].label, amt, sp, amt - sp]);
    });
    const csv = rows.map((r) => r.join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `budget-${currentMonth}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function saveIncome(v) {
    setIncome(v);
    localStorage.setItem("tv_budget_income", String(v));
  }

  const visibleLines = budgetLines
    .map((l, idx) => ({ ...l, _idx: idx }))
    .filter((l) => filter === "all" || groupForCategory(l.category) === filter);

  const totalDebtBalance = useMemo(() => debts.reduce((s, d) => s + Number(d.balance || 0), 0), [debts]);
  const totalMinPayment = useMemo(() => debts.reduce((s, d) => s + Number(d.minPayment || 0), 0), [debts]);
  // Balance-weighted average APR across all debts.
  const weightedApr = useMemo(() => {
    if (!totalDebtBalance) return 0;
    return debts.reduce((s, d) => s + Number(d.apr || 0) * Number(d.balance || 0), 0) / totalDebtBalance;
  }, [debts, totalDebtBalance]);
  const highestAprDebt = useMemo(() => {
    if (!debts.length) return null;
    return debts.reduce((hi, d) => (Number(d.apr || 0) > Number(hi.apr || 0) ? d : hi), debts[0]);
  }, [debts]);
  // Pick the strategy with the lowest total interest among the ones that have results.
  const recommendedStrategy = useMemo(() => {
    const entries = Object.entries(debtScenarios).filter(([, r]) => r && r.total_interest_paid != null);
    if (!entries.length) return null;
    const best = entries.reduce((b, e) => (e[1].total_interest_paid < b[1].total_interest_paid ? e : b));
    return { name: best[0], date: best[1].debt_free_date || "—", interest: best[1].total_interest_paid };
  }, [debtScenarios]);

  // Cross-strategy comparison stats (winners + min/max) for the comparison cards.
  const debtCompare = useMemo(() => {
    const names = ["AVALANCHE", "SNOWBALL", "HYBRID"];
    const ran = names.map((n) => ({ name: n, r: debtScenarios[n] })).filter((x) => x.r);
    if (!ran.length) return null;
    const interestOf = (x) => Number(x.r.total_interest_paid) || 0;
    const monthsOf = (x) => Number(x.r.months_to_debt_free) || 0;
    const interests = ran.map(interestOf);
    const monthsArr = ran.map(monthsOf);
    const minInterest = Math.min(...interests);
    const maxInterest = Math.max(...interests);
    const minMonths = Math.min(...monthsArr);
    const maxMonths = Math.max(...monthsArr);
    return {
      count: ran.length,
      minInterest, maxInterest, minMonths, maxMonths,
      allEqual: minInterest === maxInterest && minMonths === maxMonths,
      bestInterestName: ran.find((x) => interestOf(x) === minInterest)?.name,
      fastestName: ran.find((x) => monthsOf(x) === minMonths)?.name,
    };
  }, [debtScenarios]);
  const getDeltaClass = (v) => (v >= 0 ? "pos" : "neg");

  async function addDebt() {
    if (!newDebt.name.trim()) return;
    try {
      await api.addDebt({
        name: newDebt.name.trim(),
        balance: Number(newDebt.balance) || 0,
        apr: Number(newDebt.apr) || 0,
        minPayment: Number(newDebt.minPayment) || 0,
      });
      const res = await api.getDebts();
      setDebts(res || []);
      setNewDebt({ name: "", balance: "", apr: "", minPayment: "" });
      setAddingDebt(false);
    } catch (e) {
      console.error("add debt failed", e);
      setNotice("Could not add debt. Please try again.");
    }
  }

  return (
    <>
      {notice && (
        <div
          role="alert"
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
            background: "var(--tv-negative-bg)", color: "var(--tv-negative)",
            border: "1px solid var(--tv-negative)", borderRadius: "var(--radius-md)",
            padding: "10px 14px", marginBottom: 16, fontSize: 14,
          }}
        >
          <span><i className="ti ti-alert-circle" style={{ marginRight: 6 }}></i>{notice}</span>
          <button
            type="button" aria-label="Dismiss" onClick={() => setNotice("")}
            style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", fontSize: 16 }}
          >
            <i className="ti ti-x"></i>
          </button>
        </div>
      )}
      {planTab === "budget" && (
        <div id="page-budget" className="page active">
          {drift && !isAggregate && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 14px", marginBottom: 14, background: "var(--tv-sage-pale)", border: "1px solid var(--tv-forest)", borderRadius: "var(--radius-md)" }}>
              <i className="ti ti-refresh" style={{ color: "var(--tv-forest)" }}></i>
              <span style={{ flex: 1, minWidth: 200, fontSize: 13 }}>
                Your recent spending has shifted since you set this budget
                {drift.newCats.length > 0 && ` — ${drift.newCats.length} new categor${drift.newCats.length === 1 ? "y" : "ies"}`}
                {drift.changed.length > 0 && `${drift.newCats.length ? "," : " —"} ${drift.changed.length} changed`}. Keep it current?
              </span>
              <button className="btn btn-secondary btn-sm" onClick={refreshActuals}><i className="ti ti-refresh"></i> Refresh actuals</button>
              <button className="btn btn-primary btn-sm" onClick={autoFillFromAccounts}><i className="ti ti-building-bank"></i> Re-sync</button>
              <button className="icon-btn" title="Dismiss" onClick={() => { setDrift(null); setDriftDismissed(true); }}><i className="ti ti-x"></i></button>
            </div>
          )}
          <div className="page-header">
            <div>
              <div className="page-title">Budget</div>
              <div className="page-subtitle">
                {isAggregate
                  ? `${periodLabel} · aggregated across ${monthsForPeriod().length} months`
                  : (daysLeft > 0 ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left in ${monthLabel}` : `${monthLabel} complete`)}
              </div>
            </div>
            <div className="page-actions" style={{ alignItems: "center", flexWrap: "wrap" }}>
              <LastRefreshed onRefresh={() => setPeriod((p) => p)} label="Updated" />
              {/* Period selector */}
              <div className="seg-control">
                {[["month", "Month"], ["ytd", "YTD"], ["year", "12 mo"]].map(([val, lbl]) => (
                  <button key={val} className={`seg-btn ${period === val ? "active" : ""}`} onClick={() => setPeriod(val)}>{lbl}</button>
                ))}
              </div>
              {/* Month navigator (only in single-month mode) */}
              {!isAggregate && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--tv-card)", border: "1px solid var(--tv-border)", borderRadius: "var(--radius-md)", padding: "4px 8px" }}>
                  <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => shiftMonth(-1)} title="Previous month"><i className="ti ti-chevron-left"></i></button>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: 15, color: "var(--tv-forest)", minWidth: 120, textAlign: "center" }}>{monthLabel}</span>
                  <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => shiftMonth(1)} title="Next month"><i className="ti ti-chevron-right"></i></button>
                </div>
              )}
              <button className="btn btn-secondary btn-sm" onClick={() => openTransactions("all")}
                title="See every transaction behind your spending"><i className="ti ti-list-search"></i> View transactions</button>
              <button className="btn btn-secondary btn-sm" onClick={exportCsv}><i className="ti ti-download"></i> Export CSV</button>
              <button className="btn btn-primary btn-sm" onClick={saveBudget} disabled={saving || !dirty || isAggregate}>
                <i className={`ti ${saving ? "ti-loader spin" : savedAt ? "ti-check" : "ti-device-floppy"}`}></i>
                {saving ? "Saving…" : savedAt ? "Saved" : "Save budget"}
              </button>
            </div>
          </div>

          {isAggregate && (
            <div className="card" style={{ marginBottom: 16, borderLeft: "4px solid var(--tv-forest-light)", display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
              <i className="ti ti-info-circle" style={{ color: "var(--tv-forest-light)" }}></i>
              <span>Showing a read-only <strong>{periodLabel}</strong> roll-up{aggLoading ? " (loading…)" : ""}. Switch to <strong>Month</strong> to edit a specific month.</span>
            </div>
          )}

          {/* Budgeting-rule method card (default 50/30/20, fully customizable) */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="section-header">
              <div className="section-title">
                <i className="ti ti-scale" style={{ color: "var(--tv-forest-light)", marginRight: 6 }}></i>
                {ruleLabel} Method
                {ruleLabel === "50/30/20" && (
                  <span style={{ fontSize: 11.5, fontWeight: 400, color: "var(--tv-text-muted)", marginLeft: 8 }}>default</span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditingRule((s) => !s)}>
                  <i className={`ti ${editingRule ? "ti-x" : "ti-adjustments"}`}></i> {editingRule ? "Close" : "Customize rule"}
                </button>
                <label className="form-label" style={{ margin: 0 }}>Monthly take-home</label>
                <input type="number" className="form-input" style={{ width: 140, height: 34 }} placeholder="e.g. 6000"
                  value={income || ""} onChange={(e) => saveIncome(Number(e.target.value))} />
                <button className="btn btn-secondary btn-sm" onClick={applyTemplate}><i className="ti ti-wand"></i> Apply template</button>
                {!isAggregate && (
                  <>
                    <button className="btn btn-primary btn-sm" onClick={autoFillFromAccounts} disabled={autoFilling}
                      title="Pull income & spending from your linked bank and card transactions">
                      <i className={`ti ${autoFilling ? "ti-loader spin" : "ti-building-bank"}`}></i>
                      {autoFilling ? "Reading accounts…" : "Auto-fill from accounts"}
                    </button>
                    <button className="icon-btn" onClick={() => setShowAfSettings(true)} title="Auto-fill settings — accounts, excluded categories, renames, default mode">
                      <i className="ti ti-adjustments-horizontal"></i>
                    </button>
                  </>
                )}
              </div>
            </div>

            {editingRule && (
              <div style={{ padding: 14, background: "var(--tv-bg)", borderRadius: "var(--radius-md)", marginBottom: 16 }}>
                <div style={{ fontSize: 12.5, color: "var(--tv-text-muted)", marginBottom: 10 }}>
                  Pick a preset or set your own split. The three shares must add up to 100%.
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                  {RULE_PRESETS.map((p) => {
                    const label = `${p.needs}/${p.wants}/${p.savings}`;
                    const active = label === ruleLabel;
                    return (
                      <button key={label} type="button"
                        className={`btn btn-sm ${active ? "btn-primary" : "btn-secondary"}`}
                        onClick={() => applyRule({ needs: p.needs, wants: p.wants, savings: p.savings })}
                        title={p.note}>
                        {label} <span style={{ opacity: 0.7, marginLeft: 4 }}>· {p.note}</span>
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
                  {["needs", "wants", "savings"].map((gk) => (
                    <div key={gk}>
                      <label className="form-label" style={{ margin: 0 }}>
                        <span className={`badge ${GROUP_META[gk].badge}`} style={{ marginRight: 6 }}>{GROUP_META[gk].label}</span>%
                      </label>
                      <input type="number" min="0" max="100" className="form-input" style={{ width: 90, height: 34 }}
                        value={rule[gk]} onChange={(e) => setRulePart(gk, e.target.value)} />
                    </div>
                  ))}
                  <div style={{ fontSize: 13, fontWeight: 600, color: ruleValid ? "var(--tv-positive)" : "var(--tv-negative)" }}>
                    <i className={`ti ${ruleValid ? "ti-circle-check" : "ti-alert-circle"}`}></i> Total: {ruleSum}%
                    {!ruleValid && <span style={{ fontWeight: 400, marginLeft: 4 }}>(must equal 100%)</span>}
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={saveRule} disabled={!ruleValid}>
                    <i className="ti ti-check"></i> Save rule
                  </button>
                </div>
              </div>
            )}

            <div className="grid-3" style={{ gap: 14 }}>
              {["needs", "wants", "savings"].map((gk) => {
                const meta = GROUP_META[gk];
                const targetFrac = rule[gk] / 100;
                const target = income * targetFrac;
                const actual = byGroup[gk];
                const pct = target > 0 ? Math.round((actual / target) * 100) : 0;
                const over = target > 0 && actual > target;
                return (
                  <div key={gk} className="stat-tile">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span className={`badge ${meta.badge}`}>{meta.label} · {rule[gk]}%</span>
                      <span style={{ fontSize: 12, color: "var(--tv-text-muted)" }}>target {currency(target)}</span>
                    </div>
                    <div className="stat-tile-value">{currency(actual)}</div>
                    <div className="progress-bar" style={{ marginTop: 8 }}>
                      <div className="progress-fill" style={{ width: `${Math.min(pct, 100)}%`, background: over ? "var(--tv-negative)" : meta.color }}></div>
                    </div>
                    <div style={{ fontSize: 11.5, color: over ? "var(--tv-negative)" : "var(--tv-text-muted)", marginTop: 4 }}>
                      {income > 0 ? (over ? `${pct}% — over target` : `${pct}% of target`) : "Set income to see targets"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid-3" style={{ marginBottom: 16 }}>
            <div className="card" style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <svg width="80" height="80" viewBox="0 0 80 80" style={{ flexShrink: 0 }}>
                <circle cx="40" cy="40" r="30" fill="none" stroke="var(--tv-border)" strokeWidth="10" />
                <circle cx="40" cy="40" r="30" fill="none" stroke={pctUsed > 100 ? "var(--tv-negative)" : "var(--tv-forest)"} strokeWidth="10"
                  strokeDasharray={`${(Math.min(pctUsed, 100) / 100) * 188.5} 188.5`} strokeDashoffset="47" strokeLinecap="round" />
                <text x="40" y="37" textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--tv-text-primary)" fontFamily="var(--font-display)">{pctUsed}%</text>
                <text x="40" y="50" textAnchor="middle" fontSize="8" fill="var(--tv-text-muted)">used</text>
              </svg>
              <div>
                <div style={{ fontSize: 12, color: "var(--tv-text-muted)", marginBottom: 4 }}>Spending vs Budget</div>
                <div style={{ fontSize: 13.5 }}>Spent: <strong>{currency(totalSpent)}</strong></div>
                <div style={{ fontSize: 13, color: "var(--tv-text-muted)" }}>Remaining: {currency(totalBudget - totalSpent)}</div>
                <div style={{ fontSize: 12, color: "var(--tv-text-muted)" }}>Budget: {currency(totalBudget)}</div>
              </div>
            </div>
            <div className="card">
              <div className="kpi-label"><i className="ti ti-calendar" style={{ fontSize: 13, color: "var(--tv-forest-light)" }}></i> Planned Spend</div>
              <div className="kpi-value">{currency(totalBudget)}</div>
              <div style={{ fontSize: 12, color: "var(--tv-text-muted)", marginTop: 4 }}>for {periodLabel}</div>
            </div>
            <div className="card">
              <div className="kpi-label"><i className="ti ti-trending-up" style={{ fontSize: 13, color: "var(--tv-warning)" }}></i> Projected End</div>
              <div className="kpi-value" style={{ color: projectedEnd > totalBudget ? "var(--tv-negative)" : "var(--tv-forest)" }}>{currency(projectedEnd)}</div>
              <div style={{ fontSize: 12, color: "var(--tv-text-muted)", marginTop: 4 }}>
                {totalBudget > 0 ? `${Math.round((projectedEnd / totalBudget) * 100)}% of budget at current pace` : "—"}
              </div>
            </div>
          </div>

          {/* Budget table */}
          <div className="card">
            <div className="section-header" style={{ marginBottom: 0 }}>
              <div className="section-title">Category breakdown</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <div className="seg-control">
                  {["all", "needs", "wants", "savings"].map((f) => (
                    <button key={f} className={`seg-btn ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
                      {f === "all" ? "All" : GROUP_META[f].label}
                    </button>
                  ))}
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => setAdding((s) => !s)} disabled={isAggregate}><i className="ti ti-plus"></i> Add category</button>
              </div>
            </div>

            {adding && (
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14, padding: 12, background: "var(--tv-bg)", borderRadius: "var(--radius-md)" }}>
                <input list="cat-library" className="form-input" style={{ flex: 1, height: 36 }} placeholder="Category (e.g. Groceries)"
                  value={newCat.category} onChange={(e) => setNewCat((p) => ({ ...p, category: e.target.value }))} />
                <datalist id="cat-library">
                  {CATEGORY_LIBRARY.map((c) => <option key={c.name} value={c.name} />)}
                </datalist>
                <input type="number" className="form-input" style={{ width: 120, height: 36 }} placeholder="Amount"
                  value={newCat.amount} onChange={(e) => setNewCat((p) => ({ ...p, amount: e.target.value }))} />
                <button className="btn btn-primary btn-sm" onClick={addCategory}>Add</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setAdding(false)}>Cancel</button>
              </div>
            )}

            {budgetLines.length === 0 ? (
              <div className="empty-state">
                <i className="ti ti-chart-pie"></i>
                <p style={{ fontWeight: 600, color: "var(--tv-text-primary)", marginBottom: 4 }}>No budget yet for {monthLabel}</p>
                <p style={{ marginBottom: 16 }}>Start with the {ruleLabel} template, or add categories one by one.</p>
                <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                  <button className="btn btn-primary" onClick={applyTemplate}><i className="ti ti-wand"></i> Apply {ruleLabel} template</button>
                  <button className="btn btn-secondary" onClick={() => setAdding(true)}><i className="ti ti-plus"></i> Add category</button>
                </div>
              </div>
            ) : (
              <div className="table-scroll">
                <table className="tv-table" style={{ marginTop: 14 }}>
                  <thead>
                    <tr><th>Category</th><th>Group</th><th>Budget</th><th>Spent</th><th>Remaining</th><th>Pace</th><th></th></tr>
                  </thead>
                  <tbody>
                    {visibleLines.map((row) => {
                      const amt = Number(row.amount) || 0, sp = Number(row.spent) || 0;
                      const remaining = amt - sp;
                      const pacePct = amt > 0 ? Math.round((sp / amt) * 100) : 0;
                      const isOver = remaining < 0;
                      const meta = GROUP_META[groupForCategory(row.category)];
                      return (
                        <tr key={row.category} style={isOver ? { background: "var(--tv-negative-bg)" } : {}}>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div className={`item-icon ${isOver ? "icon-red" : "icon-forest"}`} style={{ width: 30, height: 30, fontSize: 14 }}>
                                <i className={iconForCategory(row.category)}></i>
                              </div>
                              {row.category}
                            </div>
                          </td>
                          <td><span className={`badge ${meta.badge}`}>{meta.label}</span></td>
                          <td>
                            {isAggregate ? (
                              <span style={{ fontWeight: 500 }}>{currency(amt)}</span>
                            ) : (
                              <input type="number" value={amt}
                                onChange={(e) => updateLine(row._idx, Number(e.target.value))}
                                style={{ border: "1px solid var(--tv-border)", borderRadius: "var(--radius-sm)", padding: "5px 8px", width: 90 }} />
                            )}
                          </td>
                          <td className={isOver ? "amount-neg" : ""}>
                            {sp > 0 ? (
                              <button type="button" onClick={() => openTransactions(row.category)}
                                title={`See the transactions behind ${currency(sp)} in ${row.category}`}
                                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit", font: "inherit", textDecoration: "underline", textUnderlineOffset: 2, textDecorationStyle: "dotted" }}>
                                {currency(sp)}
                              </button>
                            ) : currency(sp)}
                          </td>
                          <td style={{ color: isOver ? "var(--tv-negative)" : "var(--tv-positive)", fontWeight: 500 }}>{currency(remaining)}</td>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div className="progress-bar" style={{ width: 90 }}>
                                <div className="progress-fill" style={{ width: `${Math.min(pacePct, 100)}%`, background: isOver ? "var(--tv-negative)" : "var(--tv-forest)" }}></div>
                              </div>
                              <span style={{ fontSize: 12, color: isOver ? "var(--tv-negative)" : "var(--tv-text-muted)" }}>{pacePct}%</span>
                            </div>
                          </td>
                          <td>
                            {!isAggregate && (
                              <button className="icon-btn" style={{ width: 28, height: 28, color: "var(--tv-text-muted)" }}
                                onClick={() => removeLine(row._idx)} title="Remove category"><i className="ti ti-trash"></i></button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {dirty && budgetLines.length > 0 && (
              <div style={{ marginTop: 12, textAlign: "right" }}>
                <span style={{ fontSize: 12, color: "var(--tv-warning)", marginRight: 10 }}><i className="ti ti-alert-circle"></i> Unsaved changes</span>
                <button className="btn btn-primary btn-sm" onClick={saveBudget} disabled={saving}>
                  <i className={`ti ${saving ? "ti-loader spin" : "ti-device-floppy"}`}></i> {saving ? "Saving…" : "Save budget"}
                </button>
              </div>
            )}
          </div>

          {/* Transactions viewer — the receipts behind the numbers, all of them or one category. */}
          {txnModal && (() => {
            const cats = ["all", ...budgetLines.map((l) => l.category)];
            let rows = periodTxns();
            if (txnModal.category !== "all") {
              rows = rows.filter((t) => txnCategory(t).toLowerCase() === txnModal.category.toLowerCase());
            }
            const q = txnSearch.trim().toLowerCase();
            if (q) rows = rows.filter((t) => (t.name || "").toLowerCase().includes(q) || txnCategory(t).toLowerCase().includes(q));
            rows = [...rows].sort((a, b) => txnSort === "amount"
              ? Math.abs(Number(b.amount) || 0) - Math.abs(Number(a.amount) || 0)
              : String(b.date || "").localeCompare(String(a.date || "")));
            const spent = rows.reduce((s, t) => s + Math.max(0, Number(t.amount) || 0), 0);
            const income = rows.reduce((s, t) => s + Math.max(0, -(Number(t.amount) || 0)), 0);
            const close = () => setTxnModal(null);
            return (
              <div onClick={close}
                style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex",
                  alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 16 }}>
                <div onClick={(e) => e.stopPropagation()} className="card"
                  style={{ width: "min(640px, 100%)", maxHeight: "88vh", display: "flex", flexDirection: "column", padding: 0 }}>
                  <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--tv-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div className="section-title" style={{ marginBottom: 2 }}>
                        <i className="ti ti-list-search" style={{ color: "var(--tv-forest)", marginRight: 6 }}></i>
                        Transactions{txnModal.category !== "all" ? ` · ${txnModal.category}` : ""}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--tv-text-muted)" }}>{periodLabel}</div>
                    </div>
                    <button className="icon-btn" onClick={close} title="Close"><i className="ti ti-x"></i></button>
                  </div>

                  {/* Totals */}
                  <div style={{ display: "flex", gap: 18, flexWrap: "wrap", padding: "12px 18px", borderBottom: "1px solid var(--tv-border)", background: "var(--tv-bg)" }}>
                    <div><div style={{ fontSize: 11, color: "var(--tv-text-muted)" }}>Transactions</div><div style={{ fontWeight: 600 }}>{rows.length}</div></div>
                    <div><div style={{ fontSize: 11, color: "var(--tv-text-muted)" }}>Spent</div><div style={{ fontWeight: 600, color: "var(--tv-negative)" }}>{currency(Math.round(spent))}</div></div>
                    {income > 0 && <div><div style={{ fontSize: 11, color: "var(--tv-text-muted)" }}>Income</div><div style={{ fontWeight: 600, color: "var(--tv-positive)" }}>{currency(Math.round(income))}</div></div>}
                  </div>

                  {/* Controls */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: "12px 18px", borderBottom: "1px solid var(--tv-border)" }}>
                    <input className="form-input" style={{ flex: 1, minWidth: 160, height: 34 }} placeholder="Search by name or category…"
                      value={txnSearch} onChange={(e) => setTxnSearch(e.target.value)} />
                    <select className="form-input" style={{ width: 150, height: 34 }}
                      value={txnModal.category} onChange={(e) => setTxnModal({ category: e.target.value })}>
                      {cats.map((c) => <option key={c} value={c}>{c === "all" ? "All categories" : c}</option>)}
                    </select>
                    <div className="seg-control">
                      {[["recent", "Recent"], ["amount", "Amount"]].map(([val, lbl]) => (
                        <button key={val} className={`seg-btn ${txnSort === val ? "active" : ""}`} onClick={() => setTxnSort(val)}>{lbl}</button>
                      ))}
                    </div>
                  </div>

                  {/* List */}
                  <div style={{ overflowY: "auto", padding: "6px 0" }}>
                    {txnsLoading ? (
                      <div style={{ padding: 28, textAlign: "center", color: "var(--tv-text-muted)" }}><i className="ti ti-loader spin"></i> Loading transactions…</div>
                    ) : rows.length === 0 ? (
                      <div className="empty-state" style={{ padding: 28 }}>
                        <i className="ti ti-receipt-off"></i>
                        <p>{txnsLoaded ? "No transactions match this view." : "No linked transactions yet — link a bank or card on the Accounts page."}</p>
                      </div>
                    ) : rows.map((t, i) => {
                      const amt = Number(t.amount) || 0;
                      const isIncome = amt < 0;
                      return (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", borderBottom: "1px solid var(--tv-border-light, var(--tv-border))" }}>
                          <div className={`item-icon ${isIncome ? "icon-forest" : "icon-red"}`} style={{ width: 30, height: 30, fontSize: 14, flexShrink: 0 }}>
                            <i className={isIncome ? "ti ti-arrow-down-left" : iconForCategory(txnCategory(t))}></i>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name || "—"}</div>
                            <div style={{ fontSize: 12, color: "var(--tv-text-muted)" }}>{t.date || ""} · {txnCategory(t)}</div>
                          </div>
                          <div style={{ fontWeight: 600, whiteSpace: "nowrap", color: isIncome ? "var(--tv-positive)" : "var(--tv-text-primary)" }}>
                            {isIncome ? "+" : "−"}{currency(Math.abs(Math.round(amt)))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}

          {showAfSettings && (
            <div onClick={closeAfSettings}
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex",
                alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 16 }}>
              <div onClick={(e) => e.stopPropagation()} className="card"
                style={{ width: "min(560px, 100%)", maxHeight: "88vh", display: "flex", flexDirection: "column", padding: 0 }}>
                <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--tv-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div className="section-title" style={{ marginBottom: 0 }}>
                    <i className="ti ti-adjustments-horizontal" style={{ color: "var(--tv-forest)", marginRight: 6 }}></i> Auto-fill settings
                  </div>
                  <button className="icon-btn" onClick={closeAfSettings} title="Done"><i className="ti ti-x"></i></button>
                </div>
                <div style={{ padding: "14px 18px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 18 }}>
                  <div>
                    <label className="form-label">Default apply mode</label>
                    <div className="seg-control">
                      {["replace", "merge", "ask"].map((m) => (
                        <button key={m} className={`seg-btn ${afSettings.mode === m ? "active" : ""}`}
                          onClick={() => saveAfSettings({ ...afSettings, mode: m })}>
                          {m === "replace" ? "Replace" : m === "merge" ? "Merge" : "Ask each time"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="form-label">Accounts to include</label>
                    {accountsList.length === 0 ? (
                      <div className="item-sub" style={{ fontSize: 12 }}>No linked accounts found — link one on the Accounts page.</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {accountsList.map((a) => (
                          <label key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                            <input type="checkbox" checked={includedAccts.includes(a.id)} onChange={() => toggleAccount(a.id)} />
                            {a.officialName || a.name}{a.mask ? <span style={{ color: "var(--tv-text-muted)" }}> ····{a.mask}</span> : null}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="form-label">Always exclude these categories</label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                      <span className="badge badge-gray" title="Always excluded by default">Transfers &amp; payments</span>
                      {afSettings.excluded.map((c) => (
                        <span key={c} className="badge badge-amber" style={{ cursor: "pointer" }} onClick={() => removeExcluded(c)} title="Remove">{c} ✕</span>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input className="form-input" style={{ flex: 1, padding: "5px 8px" }} placeholder="e.g. Shopping"
                        value={newExcluded} onChange={(e) => setNewExcluded(e.target.value)} />
                      <button className="btn btn-secondary btn-sm" onClick={() => { addExcluded(newExcluded); setNewExcluded(""); }}>Add</button>
                    </div>
                  </div>
                  <div>
                    <label className="form-label">Rename / combine categories</label>
                    <div className="item-sub" style={{ fontSize: 11.5, marginBottom: 8 }}>
                      Map a transaction category to your own label (e.g. “Food &amp; Drink” → “Groceries”). Two mapped to the same label combine.
                    </div>
                    {Object.entries(afSettings.map).map(([from, to]) => (
                      <div key={from} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontSize: 12.5 }}>
                        <span style={{ flex: 1, color: "var(--tv-text-muted)" }}>{from}</span>
                        <i className="ti ti-arrow-right" style={{ color: "var(--tv-text-muted)" }}></i>
                        <span style={{ flex: 1, fontWeight: 600 }}>{to}</span>
                        <button className="icon-btn" style={{ color: "var(--tv-negative)" }} onClick={() => removeMapping(from)} title="Remove"><i className="ti ti-trash"></i></button>
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                      <input className="form-input" style={{ flex: 1, padding: "5px 8px" }} placeholder="From (e.g. Food & Drink)"
                        value={newMap.from} onChange={(e) => setNewMap((p) => ({ ...p, from: e.target.value }))} />
                      <input className="form-input" style={{ flex: 1, padding: "5px 8px" }} placeholder="To (e.g. Groceries)"
                        value={newMap.to} onChange={(e) => setNewMap((p) => ({ ...p, to: e.target.value }))} />
                      <button className="btn btn-secondary btn-sm" onClick={() => { addMapping(newMap.from, newMap.to); setNewMap({ from: "", to: "" }); }}>Add</button>
                    </div>
                  </div>
                </div>
                <div style={{ padding: "14px 18px", borderTop: "1px solid var(--tv-border)", display: "flex", justifyContent: "flex-end" }}>
                  <button className="btn btn-primary btn-sm" onClick={closeAfSettings}><i className="ti ti-check"></i> Done</button>
                </div>
              </div>
            </div>
          )}
          {review && (
            <div onClick={() => setReview(null)}
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex",
                alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
              <div onClick={(e) => e.stopPropagation()} className="card"
                style={{ width: "min(620px, 100%)", maxHeight: "88vh", display: "flex", flexDirection: "column", padding: 0 }}>
                {/* Header */}
                <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--tv-border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div className="section-title" style={{ marginBottom: 2 }}>
                      <i className="ti ti-building-bank" style={{ color: "var(--tv-forest)", marginRight: 6 }}></i> Auto-fill your budget
                    </div>
                    <button className="icon-btn" onClick={() => setReview(null)} title="Cancel"><i className="ti ti-x"></i></button>
                  </div>
                  <div className="item-sub" style={{ fontSize: 12.5 }}>
                    From {review.periodLabel} · {review.accounts} linked account{review.accounts === 1 ? "" : "s"}. Fix anything
                    that's miscategorized below — nothing is saved until you Apply, then Save.{" "}
                    <button onClick={() => setShowAfSettings(true)}
                      style={{ background: "none", border: "none", padding: 0, color: "var(--tv-forest-light)", fontWeight: 600, cursor: "pointer" }}>
                      Customize filters ▸
                    </button>
                  </div>
                </div>
                {/* Body */}
                <div style={{ padding: "14px 18px", overflowY: "auto" }}>
                  <div style={{ marginBottom: 14 }}>
                    <label className="form-label">Apply as</label>
                    <div className="seg-control">
                      <button className={`seg-btn ${reviewMode === "replace" ? "active" : ""}`} onClick={() => setReviewMode("replace")}>Replace my budget</button>
                      <button className={`seg-btn ${reviewMode === "merge" ? "active" : ""}`} onClick={() => setReviewMode("merge")}>Merge into it</button>
                    </div>
                    <div className="item-sub" style={{ fontSize: 11.5, marginTop: 4 }}>
                      {reviewMode === "replace"
                        ? "Swaps your current categories for the detected ones."
                        : "Keeps your existing categories & targets, refreshes their actual spend, and adds new ones."}
                    </div>
                  </div>
                  <div className="form-group" style={{ maxWidth: 220 }}>
                    <label className="form-label">Detected income (monthly)</label>
                    <input type="number" className="form-input" value={review.income || ""} placeholder="0"
                      onChange={(e) => setReview((r) => ({ ...r, income: Number(e.target.value) || 0 }))} />
                  </div>
                  <label className="form-label" style={{ marginTop: 6 }}>Spending categories ({review.lines.length})</label>
                  {review.lines.length === 0 ? (
                    <div className="item-sub" style={{ fontSize: 12.5 }}>No spending detected — set income above, or add categories after applying.</div>
                  ) : review.lines.map((l) => (
                    <div key={l.id} style={{ borderBottom: "1px solid var(--tv-border-light)", padding: "6px 0" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input type="checkbox" checked={l.include} title="Include this category"
                          onChange={(e) => updateReviewLine(l.id, { include: e.target.checked })} />
                        <input className="form-input" style={{ flex: 1, padding: "5px 8px", opacity: l.include ? 1 : 0.5 }}
                          value={l.category} onChange={(e) => updateReviewLine(l.id, { category: e.target.value })} />
                        <button className="icon-btn" title={`${l.count} transactions — show them`} style={{ whiteSpace: "nowrap", fontSize: 11 }}
                          onClick={() => setExpandedLine((id) => (id === l.id ? null : l.id))}>
                          {l.count} <i className={`ti ti-chevron-${expandedLine === l.id ? "up" : "down"}`} style={{ fontSize: 12 }}></i>
                        </button>
                        <div style={{ position: "relative", width: 108 }}>
                          <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--tv-text-muted)", fontSize: 13 }}>$</span>
                          <input type="number" className="form-input" style={{ padding: "5px 8px 5px 18px", opacity: l.include ? 1 : 0.5 }}
                            value={l.amount} onChange={(e) => updateReviewLine(l.id, { amount: Number(e.target.value) || 0 })} />
                        </div>
                        <button className="icon-btn" title="Remove this category" style={{ color: "var(--tv-negative)" }}
                          onClick={() => removeReviewLine(l.id)}><i className="ti ti-trash"></i></button>
                      </div>
                      {/* Smart-detection chips */}
                      {(l.outlier || l.recurringCount > 0) && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "4px 0 2px 26px", alignItems: "center" }}>
                          {l.outlier && (
                            <>
                              <span className="badge badge-amber" title={`${l.outlier.name} on ${l.outlier.date}`}>
                                <i className="ti ti-alert-triangle" style={{ fontSize: 10 }}></i> 1 large one-off · {currency(Math.round(l.outlier.amount))}
                              </span>
                              <button onClick={() => updateReviewLine(l.id, { amount: l.typical })}
                                style={{ background: "none", border: "none", padding: 0, color: "var(--tv-forest-light)", fontWeight: 600, fontSize: 11.5, cursor: "pointer" }}>
                                use typical {currency(l.typical)} ▸
                              </button>
                            </>
                          )}
                          {l.recurringCount > 0 && (
                            <span className="badge badge-forest" title="Recurring bills / subscriptions detected">
                              <i className="ti ti-repeat" style={{ fontSize: 10 }}></i> {l.recurringCount} recurring
                            </span>
                          )}
                        </div>
                      )}
                      {/* Drill-down: the transactions behind this category */}
                      {expandedLine === l.id && (
                        <div style={{ margin: "4px 0 4px 26px", padding: "6px 10px", background: "var(--tv-bg)", borderRadius: "var(--radius-md)" }}>
                          {l.txns.map((t, ti) => (
                            <div key={ti} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11.5, padding: "2px 0", color: "var(--tv-text-muted)" }}>
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {t.recurring && <i className="ti ti-repeat" style={{ fontSize: 10, color: "var(--tv-forest-light)", marginRight: 4 }}></i>}
                                {t.name}<span style={{ marginLeft: 6 }}>{t.date}</span>
                              </span>
                              <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{currency(Math.round(t.amount))}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {/* Footer */}
                <div style={{ padding: "14px 18px", borderTop: "1px solid var(--tv-border)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <span className="item-sub" style={{ fontSize: 11.5 }}>{review.lines.filter((l) => l.include).length} of {review.lines.length} included</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => setReview(null)}>Cancel</button>
                    <button className="btn btn-primary btn-sm" onClick={applyReview}><i className="ti ti-check"></i> Apply to budget</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {planTab === "debt" && (
        <div id="page-debt" className="page active">
          <div className="page-header">
            <div><div className="page-title">Debt Payoff Lab</div><div className="page-subtitle">Compare strategies and build your plan</div></div>
            <div className="page-actions" style={{ alignItems: "center" }}>
              <LastRefreshed onRefresh={() => api.getDebts().then((r) => setDebts(r || [])).catch(() => {})} />
            </div>
          </div>

          {/* Debt summary KPIs */}
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-label"><i className="ti ti-credit-card" style={{ color: "var(--tv-negative)" }}></i> Total Debt</div>
              <div className="kpi-value">{currency(totalDebtBalance)}</div>
              <div className="kpi-delta neg"><i className="ti ti-list"></i> {debts.length} account{debts.length === 1 ? "" : "s"}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label"><i className="ti ti-percentage" style={{ color: "var(--tv-warning)" }}></i> Weighted Avg APR</div>
              <div className="kpi-value">{weightedApr.toFixed(1)}%</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label"><i className="ti ti-calendar-dollar" style={{ color: "var(--tv-forest-light)" }}></i> Min Payments / mo</div>
              <div className="kpi-value">{currency(totalMinPayment)}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label"><i className="ti ti-flame" style={{ color: "var(--tv-negative)" }}></i> Highest APR</div>
              <div className="kpi-value">{highestAprDebt ? `${Number(highestAprDebt.apr).toFixed(1)}%` : "—"}</div>
              {highestAprDebt && <div className="kpi-delta neg"><i className="ti ti-target"></i> {highestAprDebt.name}</div>}
            </div>
          </div>

          {recommendedStrategy && (
            <div className="card" style={{ marginBottom: 20, borderLeft: "4px solid var(--tv-forest)", display: "flex", alignItems: "center", gap: 12 }}>
              <i className="ti ti-bulb" style={{ color: "var(--tv-forest)", fontSize: 22 }}></i>
              <div style={{ fontSize: 13.5 }}>
                Recommended: <strong>{recommendedStrategy.name}</strong> — debt-free by <strong>{recommendedStrategy.date}</strong>,
                saving the most interest of the strategies you compared.
                <button className="btn btn-secondary btn-sm" style={{ marginLeft: 12 }} onClick={() => setStrategy(recommendedStrategy.name)}>Use this plan</button>
              </div>
            </div>
          )}

          <div className="card" style={{ marginBottom: 20 }}>
            <div className="section-header">
              <div className="section-title">Your debts</div>
              <button className="btn btn-secondary btn-sm" onClick={() => setAddingDebt((s) => !s)}><i className="ti ti-plus"></i> Add debt</button>
            </div>

            {addingDebt && (
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, padding: 12, background: "var(--tv-bg)", borderRadius: "var(--radius-md)", flexWrap: "wrap" }}>
                <input className="form-input" style={{ flex: 1, minWidth: 140, height: 36 }} placeholder="Debt name (e.g. Visa)"
                  value={newDebt.name} onChange={(e) => setNewDebt((p) => ({ ...p, name: e.target.value }))} />
                <input type="number" className="form-input" style={{ width: 120, height: 36 }} placeholder="Balance"
                  value={newDebt.balance} onChange={(e) => setNewDebt((p) => ({ ...p, balance: e.target.value }))} />
                <input type="number" className="form-input" style={{ width: 90, height: 36 }} placeholder="APR %"
                  value={newDebt.apr} onChange={(e) => setNewDebt((p) => ({ ...p, apr: e.target.value }))} />
                <input type="number" className="form-input" style={{ width: 120, height: 36 }} placeholder="Min payment"
                  value={newDebt.minPayment} onChange={(e) => setNewDebt((p) => ({ ...p, minPayment: e.target.value }))} />
                <button className="btn btn-primary btn-sm" onClick={addDebt}>Add</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setAddingDebt(false)}>Cancel</button>
              </div>
            )}

            {debts.length === 0 ? (
              <div className="empty-state">
                <i className="ti ti-mood-happy"></i>
                <p>No debts tracked. Add one above to model a payoff plan.</p>
              </div>
            ) : (
              <div className="table-scroll">
                <table className="tv-table">
                  <thead><tr><th>Debt name</th><th>Balance</th><th>APR</th><th>Min payment</th></tr></thead>
                  <tbody>
                    {debts.map((debt, idx) => (
                      <tr key={debt.id || idx}>
                        <td>{debt.name}</td>
                        <td>{currency(debt.balance)}</td>
                        <td><span style={{ color: debt.apr > 15 ? "var(--tv-negative)" : debt.apr > 8 ? "var(--tv-warning)" : "var(--tv-positive)", fontWeight: 600 }}>{debt.apr}%</span></td>
                        <td>{currency(debt.minPayment)}</td>
                      </tr>
                    ))}
                    <tr style={{ background: "var(--tv-bg)", fontWeight: 600 }}>
                      <td>Total</td><td>{currency(totalDebtBalance)}</td><td></td><td>{currency(totalMinPayment)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ marginTop: 16, display: "flex", alignItems: "flex-end", gap: 10 }}>
              <div>
                <label className="form-label">Extra monthly payment</label>
                <input type="number" className="form-input" value={extraPayment} onChange={(e) => setExtraPayment(Number(e.target.value))} style={{ width: 150 }} />
              </div>
              <button type="button" className="btn btn-primary" onClick={onRunAllScenarios} disabled={debtLoading}>
                {debtLoading ? "Running…" : "Compare strategies"}
              </button>
            </div>
          </div>

          <div className="section-header" style={{ marginBottom: 4 }}>
            <div className="section-title" style={{ marginBottom: 0 }}>Strategy comparison</div>
            {debtCompare && (
              <span style={{ fontSize: 12, color: "var(--tv-text-muted)" }}>
                <i className="ti ti-arrow-down" style={{ color: "var(--tv-positive)" }}></i> lower interest is cheaper ·
                <i className="ti ti-clock" style={{ marginLeft: 6 }}></i> fewer months is faster
              </span>
            )}
          </div>

          {!debtCompare ? (
            <div className="card">
              <div className="empty-state">
                <i className="ti ti-scale"></i>
                <p style={{ fontWeight: 600, color: "var(--tv-text-primary)", marginBottom: 4 }}>Compare your payoff strategies</p>
                <p>Add your debts and an extra monthly payment above, then hit <strong>Compare strategies</strong> to see which gets you debt-free soonest and cheapest.</p>
              </div>
            </div>
          ) : (
          <div className="grid-3">
            {["AVALANCHE", "SNOWBALL", "HYBRID"].map((name) => {
              const result = debtScenarios[name];
              const info = STRATEGY_INFO[name];
              const isCurrent = strategy === name;
              const interest = Number(result?.total_interest_paid) || 0;
              const months = Number(result?.months_to_debt_free) || 0;
              const isCheapest = debtCompare && name === debtCompare.bestInterestName;
              const isFastest = debtCompare && name === debtCompare.fastestName;
              // Interest "cost" bar relative to the costliest strategy (shorter = better).
              const costPct = debtCompare && debtCompare.maxInterest > 0
                ? Math.round((interest / debtCompare.maxInterest) * 100) : 0;
              const savedVsWorst = debtCompare ? debtCompare.maxInterest - interest : 0;
              return (
                <div className="card" key={name} style={{
                  borderLeft: `4px solid ${isCheapest ? "var(--tv-gold)" : isCurrent ? "var(--tv-forest)" : "var(--tv-border)"}`,
                  background: isCurrent ? "var(--tv-sage-pale)" : "var(--tv-card)",
                  display: "flex", flexDirection: "column",
                }}>
                  {/* Header + winner badges */}
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div className="item-icon icon-forest" style={{ width: 32, height: 32, fontSize: 16 }}><i className={info.icon}></i></div>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 600, textTransform: "capitalize" }}>{name.toLowerCase()}</div>
                        <div style={{ fontSize: 11, color: "var(--tv-text-muted)" }}>{info.tagline}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                      {isCheapest && <span className="badge badge-gold" title="Lowest total interest"><i className="ti ti-star"></i> Cheapest</span>}
                      {isFastest && !isCheapest && <span className="badge badge-forest" title="Debt-free soonest"><i className="ti ti-bolt"></i> Fastest</span>}
                    </div>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--tv-text-secondary)", margin: "6px 0 14px", lineHeight: 1.5 }}>{info.blurb}</p>

                  {/* Total interest — the key differentiator, with a relative cost bar */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ fontSize: 11, color: "var(--tv-text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>Total interest</span>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: 18, color: isCheapest ? "var(--tv-positive)" : "var(--tv-text-primary)" }}>{currency(interest)}</span>
                    </div>
                    <div className="progress-bar" style={{ marginTop: 6 }}>
                      <div className="progress-fill" style={{ width: `${Math.max(costPct, 4)}%`, background: isCheapest ? "var(--tv-positive)" : "var(--tv-gold)" }}></div>
                    </div>
                    {savedVsWorst > 0 ? (
                      <div style={{ fontSize: 11.5, color: "var(--tv-positive)", marginTop: 4 }}>
                        <i className="ti ti-arrow-down-right"></i> Saves {currency(savedVsWorst)} vs the costliest option
                      </div>
                    ) : (
                      <div style={{ fontSize: 11.5, color: "var(--tv-text-muted)", marginTop: 4 }}>Most expensive of the three</div>
                    )}
                  </div>

                  {/* Time + debt-free + liquidity */}
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "10px 0", borderTop: "1px solid var(--tv-border-light)", borderBottom: "1px solid var(--tv-border-light)", marginBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: 10.5, color: "var(--tv-text-muted)", fontWeight: 600, textTransform: "uppercase" }}>Time</div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{fmtMonths(months)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10.5, color: "var(--tv-text-muted)", fontWeight: 600, textTransform: "uppercase" }}>Debt-free</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--tv-forest)" }}>{result?.debt_free_date || "—"}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10.5, color: "var(--tv-text-muted)", fontWeight: 600, textTransform: "uppercase" }}>Liquidity</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--tv-warning)" }}>{result?.liquidity || "Medium"}</div>
                    </div>
                  </div>

                  <button className={`btn ${isCurrent ? "btn-primary" : "btn-secondary"}`} style={{ width: "100%", justifyContent: "center", marginTop: "auto" }} onClick={() => setStrategy(name)}>
                    {isCurrent ? <><i className="ti ti-check"></i> Current plan</> : "Set as plan"}
                  </button>
                </div>
              );
            })}
          </div>
          )}

          {debtCompare && debtCompare.allEqual && (
            <p style={{ fontSize: 12.5, color: "var(--tv-text-muted)", marginTop: 12, textAlign: "center" }}>
              <i className="ti ti-info-circle"></i> All three strategies give the same result for your current debts — they happen to prioritize the same one. Differences appear as your debts vary in balance and rate.
            </p>
          )}
          <p style={{ fontSize: 12.5, color: "var(--tv-text-muted)", marginTop: 14, textAlign: "center" }}><i className="ti ti-info-circle"></i> Assumes on-time payments and no new debt.</p>
        </div>
      )}
    </>
  );
}
