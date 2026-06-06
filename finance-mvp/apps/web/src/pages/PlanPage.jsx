import { useState, useEffect, useMemo } from "react";
import { currency } from "../utils/format";
import { api } from "../api";

export default function PlanPage({
  planTab,
  setPlanTab,
  strategy,
  setStrategy,
  extraPayment,
  setExtraPayment,
  debtScenarios,
  onRunAllScenarios,
  debtLoading,
  formatDate, // Passed from AppLayout
}) {
  const [monthLabel, setMonthLabel] = useState("June 2026"); // Display label
  const [currentMonth, setCurrentMonth] = useState("2026-06"); // YYYY-MM for API
  const [budgetLines, setBudgetLines] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [debts, setDebts] = useState([]); // Will be fetched from API

  useEffect(() => {
    async function loadBudgetAndDebts() {
      try {
        // Load Budget
        const budgetRes = await api.getBudget(currentMonth);
        setBudgetLines(budgetRes.lines || []);
        setAlerts(budgetRes.alerts || []);

        // Load Debts
        const debtsRes = await api.getDebts();
        setDebts(debtsRes || []);
      } catch (err) {
        console.error("Failed to load planning data:", err);
      }
    }
    loadBudgetAndDebts();
  }, [currentMonth]);

  const totalBudget = useMemo(() => budgetLines.reduce((s, r) => s + (r.amount || 0), 0), [budgetLines]);
  const totalSpent = useMemo(() => budgetLines.reduce((s, r) => s + (r.spent || 0), 0), [budgetLines]);
  const pctUsed = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
  const projectedEnd = totalSpent * (30 / (30 - 12)); // Simple projection based on days left (12 days left in month)

  async function saveBudget() {
    setSaving(true);
    try {
      const lines = budgetLines.map((l) => ({ category: l.category, amount: Number(l.amount) }));
      const updatedBudget = await api.putBudget(currentMonth, lines);
      setBudgetLines(updatedBudget.lines || []);
      setAlerts(updatedBudget.alerts || []);
    } catch (err) {
      console.error("Failed to save budget:", err);
    } finally {
      setSaving(false);
    }
  }

  function updateLine(idx, field, value) {
    setBudgetLines((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  }

  const totalDebtBalance = useMemo(() => debts.reduce((sum, d) => sum + d.balance, 0), [debts]);
  const totalMinPayment = useMemo(() => debts.reduce((sum, d) => sum + d.minPayment, 0), [debts]);

  const getDeltaClass = (value) => (value >= 0 ? "pos" : "neg"); // Re-using from HomePage

  return (
    <>
      {planTab === "budget" && (
        <div id="page-budget" className="page active">
          <div className="page-header">
            <div>
              <div className="page-title">Monthly Budget</div>
              <div className="page-subtitle">12 days left in month</div> {/* Hardcoded for now */}
            </div>
            <div className="page-actions">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--tv-card)', border: '1px solid var(--tv-border)', borderRadius: 'var(--radius-md)', padding: '5px 12px' }}>
                <button className="btn-secondary" style={{ background: 'none', border: 'none', fontSize: '18px', color: 'var(--tv-text-muted)', cursor: 'pointer', padding: '0' }}>&lsaquo;</button>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '16px', color: 'var(--tv-forest)', minWidth: '90px', textAlign: 'center' }}>{monthLabel}</span>
                <button className="btn-secondary" style={{ background: 'none', border: 'none', fontSize: '18px', color: 'var(--tv-text-muted)', cursor: 'pointer', padding: '0' }}>&rsaquo;</button>
              </div>
              <button className="btn btn-secondary btn-sm"><i className="ti ti-download"></i> Export CSV</button>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid-3" style={{ marginBottom: '20px' }}>
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <svg width="80" height="80" viewBox="0 0 80 80" style={{ flexShrink: 0 }}>
                <circle cx="40" cy="40" r="30" fill="none" stroke="var(--tv-border)" strokeWidth="10" />
                <circle cx="40" cy="40" r="30" fill="none" stroke="var(--tv-forest)" strokeWidth="10"
                  strokeDasharray={`${(pctUsed / 100) * 188.5} ${188.5 - (pctUsed / 100) * 188.5}`} strokeDashoffset="47" strokeLinecap="round" />
                <text x="40" y="37" textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--tv-text-primary)" fontFamily="var(--font-display)">{pctUsed}%</text>
                <text x="40" y="50" textAnchor="middle" fontSize="8" fill="var(--tv-text-muted)" fontFamily="var(--font-body)">used</text>
              </svg>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--tv-text-muted)', marginBottom: '4px' }}>Spending vs Budget</div>
                <div style={{ fontSize: '13.5px', fontWeight: '500' }}>Spent: <strong>{currency(totalSpent)}</strong></div>
                <div style={{ fontSize: '13px', color: 'var(--tv-text-muted)' }}>Remaining: {currency(totalBudget - totalSpent)}</div>
                <div style={{ fontSize: '12px', color: 'var(--tv-text-muted)' }}>Budget: {currency(totalBudget)}</div>
              </div>
            </div>
            <div className="card">
              <div className="kpi-label"><i className="ti ti-calendar" style={{ fontSize: '13px', color: 'var(--tv-forest-light)' }}></i> Planned Spend</div>
              <div className="kpi-value">{currency(totalBudget)}</div>
              <div style={{ fontSize: '12px', color: 'var(--tv-text-muted)', marginTop: '4px' }}>for {monthLabel}</div>
            </div>
            <div className="card">
              <div className="kpi-label"><i className="ti ti-trending-up" style={{ fontSize: '13px', color: 'var(--tv-warning)' }}></i> Projected End</div>
              <div className="kpi-value" style={{ color: pctUsed > 100 ? 'var(--tv-negative)' : 'var(--tv-forest)' }}>{currency(projectedEnd)}</div>
              <div style={{ fontSize: '12px', color: pctUsed > 100 ? 'var(--tv-negative)' : 'var(--tv-text-muted)', marginTop: '4px' }}>{Math.round(projectedEnd / totalBudget * 100)}% of budget</div>
            </div>
          </div>

          {/* Budget table */}
          <div className="card">
            <div className="section-header" style={{ marginBottom: '0' }}>
              <div className="section-title">Category breakdown</div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button className="btn btn-primary btn-sm" style={{ padding: '5px 12px' }}>All</button>
                <button className="btn btn-secondary btn-sm" style={{ padding: '5px 12px' }}>Essentials</button>
                <button className="btn btn-secondary btn-sm" style={{ padding: '5px 12px' }}>Discretionary</button>
              </div>
            </div>
            <table className="tv-table" style={{ marginTop: '14px' }}>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Budget</th>
                  <th>Spent</th>
                  <th>Remaining</th>
                  <th>Pace</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {budgetLines.map((row, idx) => {
                  const remaining = (row.amount || 0) - (row.spent || 0);
                  const pacePct = row.amount > 0 ? Math.round((row.spent / row.amount) * 100) : 0;
                  const isOver = remaining < 0;
                  const paceColor = isOver ? 'var(--tv-negative)' : 'var(--tv-forest)';

                  return (
                    <tr key={row.category} style={isOver ? { background: 'var(--tv-negative-bg)' } : {}}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div className={`item-icon ${isOver ? 'icon-red' : 'icon-green'}`} style={{ width: '30px', height: '30px', fontSize: '14px' }}>
                            <i className={`ti ti-${row.category.toLowerCase().replace(' ', '-')}`}></i> {/* Placeholder icons */}
                          </div>
                          {row.category}
                        </div>
                      </td>
                      <td>
                        <input
                          type="number"
                          value={row.amount}
                          onChange={(e) => updateLine(idx, 'amount', Number(e.target.value))}
                          style={{ border: '1px solid var(--tv-border)', borderRadius: 'var(--radius-sm)', padding: '4px 8px', width: '80px' }}
                        />
                      </td>
                      <td className={isOver ? 'amount-neg' : ''}>{currency(row.spent || 0)}</td>
                      <td style={{ color: isOver ? 'var(--tv-negative)' : 'var(--tv-positive)', fontWeight: '500' }}>{currency(remaining)}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div className="progress-bar" style={{ width: '90px' }}>
                            <div className="progress-fill" style={{ width: `${Math.min(pacePct, 100)}%`, background: paceColor }}></div>
                          </div>
                          <span style={{ fontSize: '12px', color: isOver ? 'var(--tv-negative)' : 'var(--tv-text-muted)' }}>{pacePct}%</span>
                        </div>
                      </td>
                      <td><button className="btn btn-secondary btn-sm" style={{ padding: '3px 8px', fontSize: '11px' }}><i className="ti ti-pencil"></i></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ fontSize: '12px', color: 'var(--tv-text-muted)', marginTop: '12px', textAlign: 'center' }}><i className="ti ti-info-circle" style={{ verticalAlign: 'middle', marginRight: '4px' }}></i>Click any <i className="ti ti-pencil" style={{ verticalAlign: 'middle' }}></i> to edit values</div>
          </div>
        </div>
      )}

      {planTab === "debt" && (
        <div id="page-debt" className="page active">
          <div className="page-header">
            <div><div className="page-title">Debt Payoff Lab</div><div className="page-subtitle">Compare strategies and build your plan</div></div>
          </div>

          {/* Debt inputs */}
          <div className="card" style={{ marginBottom: '20px' }}>
            <div className="section-header">
              <div className="section-title">Your debts</div>
              <button className="btn btn-secondary btn-sm"><i className="ti ti-plus"></i> Add debt</button>
            </div>
            <table className="tv-table">
              <thead><tr><th>Debt name</th><th>Balance</th><th>APR</th><th>Min payment</th><th></th></tr></thead>
              <tbody>
                {debts.map((debt, idx) => (
                  <tr key={idx}>
                    <td>{debt.name}</td>
                    <td>{currency(debt.balance)}</td>
                    <td><span style={{ color: debt.apr > 15 ? 'var(--tv-negative)' : debt.apr > 8 ? 'var(--tv-warning)' : 'var(--tv-positive)', fontWeight: '600' }}>{debt.apr}%</span></td>
                    <td>{currency(debt.minPayment)}</td>
                    <td><button className="btn btn-secondary btn-sm" style={{ padding: '3px 8px' }}><i className="ti ti-dots-vertical"></i></button></td>
                  </tr>
                ))}
                <tr style={{ background: 'var(--tv-bg)', fontWeight: '600' }}>
                  <td>Total</td>
                  <td>{currency(totalDebtBalance)}</td>
                  <td></td>
                  <td>{currency(totalMinPayment)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
            <div style={{marginTop: '16px'}}>
              <label className="form-label">Extra monthly payment</label>
              <input
                type="number"
                className="form-input"
                value={extraPayment}
                onChange={(e) => setExtraPayment(Number(e.target.value))}
                style={{width: '150px'}}
              />
              <button
                type="button"
                className="btn btn-primary"
                onClick={onRunAllScenarios}
                disabled={debtLoading}
                style={{marginLeft: '10px'}}
              >
                {debtLoading ? "Running…" : "Compare strategies"}
              </button>
            </div>
          </div>

          {/* Strategy cards */}
          <div className="grid-3">
            {["AVALANCHE", "SNOWBALL", "HYBRID"].map((name, idx) => {
              const result = debtScenarios[name];
              const isCurrentStrategy = strategy === name;
              const cardBorderColor = isCurrentStrategy ? 'var(--tv-forest)' : 'var(--tv-border)';
              const cardBgColor = isCurrentStrategy ? 'var(--tv-sage-pale)' : 'var(--tv-card)';
              const numberBg = isCurrentStrategy ? 'var(--tv-forest)' : 'var(--tv-border)';
              const numberColor = isCurrentStrategy ? 'white' : 'var(--tv-text-secondary)';
              const buttonClass = isCurrentStrategy ? 'btn-primary' : 'btn-secondary';

              // Placeholder for SVG bar chart data - replace with actual result data if available
              const barChartData = [70, 62, 54, 46, 40, 32, 24, 16, 8]; // Example heights
              const barChartFill = isCurrentStrategy ? 'url(#bar1)' : '#8AB89A'; // Use gradient for active, solid for others

              return (
                <div className="card" key={name} style={{ borderLeft: `4px solid ${cardBorderColor}`, background: cardBgColor }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                    <div style={{ width: '36px', height: '36px', background: numberBg, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', color: numberColor, fontSize: '15px' }}>{idx + 1}</div>
                    <div style={{ fontSize: '15px', fontWeight: '600' }}>{name}</div>
                  </div>
                  <div className="grid-3" style={{ gap: '8px', marginBottom: '14px' }}>
                    <div>
                      <div style={{ fontSize: '10.5px', color: 'var(--tv-text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.04em' }}>Debt-free</div>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: '16px', color: 'var(--tv-forest)' }}>{result?.debt_free_date || 'N/A'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10.5px', color: 'var(--tv-text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.04em' }}>Total int.</div>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: '16px', color: getDeltaClass(result?.total_interest_paid ? -result.total_interest_paid : 0) }}>{currency(result?.total_interest_paid || 0)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10.5px', color: 'var(--tv-text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.04em' }}>Liquidity</div>
                      <div style={{ fontSize: '14px', color: 'var(--tv-warning)', fontWeight: '600' }}>{result?.liquidity || 'Medium'}</div>
                    </div>
                  </div>
                  <svg viewBox="0 0 260 100" width="100%">
                    <defs>
                      <linearGradient id="bar1" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#1A4D3B" stopOpacity=".9"/>
                        <stop offset="100%" stopColor="#3D8A68" stopOpacity=".6"/>
                      </linearGradient>
                    </defs>
                    {barChartData.map((height, barIdx) => (
                      <rect key={barIdx} x={barIdx * 26} y={90 - height} width="22" height={height} rx="3" fill={barChartFill} opacity={1 - (barIdx * 0.05)}/>
                    ))}
                    <text x="0"   y="100" fontSize="8" fill="#7A9086" fontFamily="DM Sans,sans-serif">May'24</text>
                    <text x="126" y="100" fontSize="8" fill="#7A9086" fontFamily="DM Sans,sans-serif">May'26</text>
                    <text x="214" y="100" fontSize="8" fill="#7A9086" fontFamily="DM Sans,sans-serif">
                      {result?.debt_free_date ? formatDate(new Date(result.debt_free_date), { month: 'short', year: '2-digit' }) : 'N/A'}
                    </text>
                  </svg>
                  <button className={`btn ${buttonClass}`} style={{ width: '100%', justifyContent: 'center', marginTop: '12px' }} onClick={() => setStrategy(name)}>Set as plan</button>
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: '12.5px', color: 'var(--tv-text-muted)', marginTop: '14px', textAlign: 'center' }}><i className="ti ti-info-circle" style={{ verticalAlign: 'middle', marginRight: '4px' }}></i>Assumes on-time payments and no new debt.</p>
        </div>
      )}
    </>
  );
}
