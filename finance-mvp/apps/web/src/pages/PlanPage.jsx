import { useState, useEffect } from "react";
import { currency } from "../utils/format";
import { api } from "../api";

const BUDGET_ROWS = [
  { category: "Rent", budget: 1850, spent: 1850 },
  { category: "Groceries", budget: 600, spent: 428 },
  { category: "Dining", budget: 480, spent: 612 },
  { category: "Transportation", budget: 320, spent: 245 },
  { category: "Utilities", budget: 180, spent: 165 }
];

export default function PlanPage({
  planTab,
  setPlanTab,
  strategy,
  setStrategy,
  extraPayment,
  setExtraPayment,
  debtScenarios,
  onRunAllScenarios,
  debtLoading
}) {
  const [monthLabel, setMonthLabel] = useState("2026-05");
  const [budgetLines, setBudgetLines] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadBudget() {
      try {
        const res = await api.getBudget(monthLabel);
        // res.lines: [{category,budget,spent}], res.alerts
        setBudgetLines(res.lines || []);
        setAlerts(res.alerts || []);
      } catch (err) {
        console.error(err);
      }
    }
    loadBudget();
  }, [monthLabel]);

  const totalBudget = budgetLines.reduce((s, r) => s + (r.budget || 0), 0);
  const totalSpent = budgetLines.reduce((s, r) => s + (r.spent || 0), 0);
  const pctUsed = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;

  async function saveBudget() {
    setSaving(true);
    try {
      const lines = budgetLines.map((l) => ({ category: l.category, amount: Number(l.budget) }));
      await api.putBudget(monthLabel, lines);
      const res = await api.getBudget(monthLabel);
      setBudgetLines(res.lines || []);
      setAlerts(res.alerts || []);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  function updateLine(idx, field, value) {
    setBudgetLines((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  }

  return (
    <>
      <header className="page-header row">
        <div>
          <h1>Plan</h1>
          <p className="muted">Budget and debt payoff strategies</p>
        </div>
        <div className="tab-bar">
          <button
            type="button"
            className={planTab === "budget" ? "active" : ""}
            onClick={() => setPlanTab("budget")}
          >
            Budget
          </button>
          <button
            type="button"
            className={planTab === "debt" ? "active" : ""}
            onClick={() => setPlanTab("debt")}
          >
            Debt planner
          </button>
        </div>
      </header>

      {planTab === "budget" && (
        <>
          <div className="budget-header">
            <button type="button" className="btn-ghost" onClick={() => { /* prev month*/ }}>
              ←
            </button>
            <h2>{monthLabel}</h2>
            <button type="button" className="btn-ghost" onClick={() => { /* next month */ }}>
              →
            </button>
            <span className="muted">12 days left in month</span>
            <button type="button" className="btn-secondary btn-sm push-right" onClick={saveBudget} disabled={saving}>
              {saving ? 'Saving…' : 'Save budget'}
            </button>
          </div>

          <div className="budget-top">
            <div className="card budget-donut-card">
              <h3>Spending vs budget</h3>
              <div className="donut-wrap lg">
                <div className="donut" style={{ "--pct": `${pctUsed}%` }} />
                <span className="donut-label">{pctUsed}%</span>
              </div>
            </div>
            <div className="summary-row three">
              <div className="summary-card">
                <span>Planned</span>
                <strong>{currency(totalBudget)}</strong>
              </div>
              <div className="summary-card">
                <span>Spent</span>
                <strong>{currency(totalSpent)}</strong>
              </div>
              <div className="summary-card">
                <span>Projected end</span>
                <strong>{currency(totalSpent * 1.08)}</strong>
              </div>
            </div>
          </div>

          <div className="card table-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th className="num">Budget</th>
                  <th className="num">Spent</th>
                  <th className="num">Remaining</th>
                  <th>Pace</th>
                </tr>
              </thead>
              <tbody>
                {budgetLines.map((row, idx) => {
                  const remaining = (row.budget || 0) - (row.spent || 0);
                  const behind = remaining < 0;
                  return (
                    <tr key={row.category} className={behind ? "row-warn" : ""}>
                      <td>{row.category}</td>
                      <td className="num">
                        <input type="number" value={row.budget} onChange={(e) => updateLine(idx, 'budget', Number(e.target.value))} />
                      </td>
                      <td className="num">{currency(row.spent || 0)}</td>
                      <td className="num">{currency(remaining)}</td>
                      <td>
                        <span className={`pace ${behind ? "behind" : "on-track"}`}>
                          {behind ? "Over" : "On track"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {alerts.length > 0 && (
            <div className="card">
              <h3>Overspend alerts</h3>
              <ul>
                {alerts.map((a) => (
                  <li key={a.category}>
                    <strong>{a.category}</strong>: over budget by {currency(a.over)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {planTab === "debt" && (
        <>
          <div className="card debt-inputs">
            <h3>Debt inputs</h3>
            <div className="debt-controls">
              <label>
                Extra monthly payment
                <input
                  type="number"
                  value={extraPayment}
                  onChange={(e) => setExtraPayment(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="btn-primary"
                onClick={onRunAllScenarios}
                disabled={debtLoading}
              >
                {debtLoading ? "Running…" : "Compare strategies"}
              </button>
            </div>
          </div>

          <div className="debt-compare">
            {["AVALANCHE", "SNOWBALL", "HYBRID"].map((name) => {
              const result = debtScenarios[name];
              return (
                <article key={name} className="card debt-card">
                  <h3>{name}</h3>
                  {result ? (
                    <>
                      <p>
                        Debt-free in <strong>{result.months_to_debt_free} months</strong>
                      </p>
                      <p>Interest paid: {currency(result.total_interest_paid)}</p>
                      <button
                        type="button"
                        className={`btn-secondary btn-sm ${strategy === name ? "active" : ""}`}
                        onClick={() => setStrategy(name)}
                      >
                        Set as plan
                      </button>
                    </>
                  ) : (
                    <p className="muted">Run compare to see projection</p>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
