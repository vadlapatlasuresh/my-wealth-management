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
        .then((res) => { if (!cancelled) { setBudgetLines(res?.lines || []); setDirty(false); } })
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
    api.getDebts().then((res) => setDebts(res || [])).catch(() => {});
  }, []);

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

  function applyTemplate() {
    if (!income || income <= 0) {
      alert(`Enter your monthly take-home income first to build a ${ruleLabel} budget.`);
      return;
    }
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
      setBudgetLines(updated?.lines || lines);
      setDirty(false);
      setSavedAt(true);
      setTimeout(() => setSavedAt(false), 2500);
    } catch (e) {
      console.error("save failed", e);
      alert("Could not save the budget. Please try again.");
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
      alert("Could not add debt.");
    }
  }

  return (
    <>
      {planTab === "budget" && (
        <div id="page-budget" className="page active">
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
                          <td className={isOver ? "amount-neg" : ""}>{currency(sp)}</td>
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
