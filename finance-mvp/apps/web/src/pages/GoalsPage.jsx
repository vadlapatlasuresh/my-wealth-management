import { useState, useEffect, useMemo } from "react";
import { currency } from "../utils/format";
import { requiredMonthlyContribution, payoffDateLabel } from "../utils/calculators";
import { api } from "../api";

const GOAL_TYPES = [
  { id: "SAVINGS", label: "Savings", icon: "ti ti-pig-money", rate: 4 },
  { id: "NET_WORTH", label: "Net worth", icon: "ti ti-trending-up", rate: 6 },
  { id: "DEBT_PAYOFF", label: "Debt payoff", icon: "ti ti-trending-down", rate: 0 },
  { id: "CUSTOM", label: "Custom", icon: "ti ti-target", rate: 0 },
];

const typeMeta = (t) => GOAL_TYPES.find((x) => x.id === t) || GOAL_TYPES[0];

function monthsUntil(dateStr) {
  if (!dateStr) return 0;
  const target = new Date(dateStr);
  const now = new Date();
  if (Number.isNaN(target.getTime())) return 0;
  return Math.max(0, (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth()));
}

const EMPTY = { name: "", goalType: "SAVINGS", targetAmount: "", currentAmount: "", targetDate: "" };

export default function GoalsPage() {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true); setError("");
    try { setGoals(await api.getGoals() || []); }
    catch (e) { setError(e?.message || "Couldn't load goals."); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const setF = (k) => (v) => setForm((f) => ({ ...f, [k]: typeof v === "string" ? v : v?.target?.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      await api.addGoal({
        name: form.name,
        goalType: form.goalType,
        targetAmount: Number(form.targetAmount) || 0,
        currentAmount: Number(form.currentAmount) || 0,
        targetDate: form.targetDate || null,
      });
      setForm(EMPTY); setShowForm(false); await load();
    } catch (e2) { setError(e2?.message || "Couldn't save the goal."); }
    finally { setSaving(false); }
  };

  const addToGoal = async (g, amount) => {
    try {
      await api.updateGoal(g.id, { ...g, currentAmount: Number(g.currentAmount || 0) + amount });
      await load();
    } catch (e) { setError(e?.message || "Update failed."); }
  };

  const remove = async (g) => {
    try { await api.deleteGoal(g.id); await load(); }
    catch (e) { setError(e?.message || "Delete failed."); }
  };

  const totalTarget = useMemo(() => goals.reduce((s, g) => s + Number(g.targetAmount || 0), 0), [goals]);
  const totalSaved = useMemo(() => goals.reduce((s, g) => s + Number(g.currentAmount || 0), 0), [goals]);

  return (
    <div className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">Goals</div>
          <div className="page-subtitle">Set targets and see exactly what to save each month to hit them.</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm((s) => !s)}>
            <i className="ti ti-plus"></i> New goal
          </button>
        </div>
      </div>

      {error && <div className="card" style={{ borderLeft: "4px solid var(--tv-negative)", marginBottom: 12 }}>
        <span style={{ color: "var(--tv-negative)" }}>{error}</span></div>}

      {goals.length > 0 && (
        <div className="kpi-grid" style={{ marginBottom: 16 }}>
          <div className="kpi-card"><div className="kpi-label">Goals</div><div className="kpi-value">{goals.length}</div></div>
          <div className="kpi-card"><div className="kpi-label">Saved so far</div><div className="kpi-value">{currency(totalSaved)}</div></div>
          <div className="kpi-card"><div className="kpi-label">Total target</div><div className="kpi-value">{currency(totalTarget)}</div></div>
        </div>
      )}

      {showForm && (
        <form className="card" onSubmit={submit} style={{ marginBottom: 16 }}>
          <div className="section-title">New goal</div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Name</label>
              <input className="form-input" value={form.name} onChange={setF("name")} placeholder="Emergency fund" required />
            </div>
            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="form-select" value={form.goalType} onChange={setF("goalType")}>
                {GOAL_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Target amount</label>
              <input className="form-input" type="number" value={form.targetAmount} onChange={setF("targetAmount")} placeholder="20000" required />
            </div>
            <div className="form-group">
              <label className="form-label">Already saved</label>
              <input className="form-input" type="number" value={form.currentAmount} onChange={setF("currentAmount")} placeholder="5000" />
            </div>
            <div className="form-group">
              <label className="form-label">Target date</label>
              <input className="form-input" type="date" value={form.targetDate} onChange={setF("targetDate")} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? "Saving…" : "Create goal"}</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="card"><div className="empty-state"><i className="ti ti-loader"></i><p>Loading…</p></div></div>
      ) : goals.length === 0 ? (
        <div className="card"><div className="empty-state">
          <i className="ti ti-target"></i>
          <p>No goals yet. Create one to start tracking — we'll tell you what to save each month.</p>
        </div></div>
      ) : (
        <div className="grid-2">
          {goals.map((g) => {
            const meta = typeMeta(g.goalType);
            const progress = Math.max(0, Math.min(1, Number(g.progress) || 0));
            const remaining = Math.max(0, Number(g.targetAmount || 0) - Number(g.currentAmount || 0));
            const months = monthsUntil(g.targetDate);
            const required = g.targetDate
              ? requiredMonthlyContribution(g.targetAmount, g.currentAmount, months, meta.rate)
              : null;
            const done = progress >= 1;
            return (
              <div className="card" key={g.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <div className="item-icon icon-forest"><i className={meta.icon}></i></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 17 }}>{g.name}</div>
                    <div className="item-sub">{meta.label}{g.targetDate ? ` · by ${new Date(g.targetDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}` : ""}</div>
                  </div>
                  <button className="icon-btn" title="Delete goal" onClick={() => remove(g)}><i className="ti ti-trash"></i></button>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600 }}>{currency(g.currentAmount)}</span>
                  <span style={{ color: "var(--tv-text-muted)" }}>of {currency(g.targetAmount)}</span>
                </div>
                <div style={{ height: 8, background: "var(--tv-border-light)", borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ width: `${progress * 100}%`, height: "100%", background: done ? "var(--tv-positive)" : "var(--tv-forest-light)", transition: "width .3s ease" }} />
                </div>

                <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  {done ? (
                    <span className="badge badge-green"><i className="ti ti-check"></i> Goal reached</span>
                  ) : required != null ? (
                    <div style={{ fontSize: 12.5, color: "var(--tv-text-secondary)" }}>
                      Save <strong style={{ color: "var(--tv-text-primary)" }}>{currency(required)}/mo</strong>
                      {months > 0 ? ` for ${payoffDateLabel(months).duration}` : " (due now)"}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12.5, color: "var(--tv-text-muted)" }}>{currency(remaining)} to go</div>
                  )}
                  {!done && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => addToGoal(g, 100)}>+$100</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => addToGoal(g, 500)}>+$500</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
