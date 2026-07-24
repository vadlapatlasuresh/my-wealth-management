import { useState, useEffect, useMemo } from "react";
import { currency } from "../utils/format";
import { requiredMonthlyContribution, payoffDateLabel, mortgagePayoff, extraPaymentImpact } from "../utils/calculators";
import { api } from "../api";
import ProgressRing from "../components/viz/ProgressRing"; // studio-design migration: goal progress rings

const GOAL_TYPES = [
  { id: "SAVINGS", label: "Savings", icon: "ti ti-pig-money", rate: 4 },
  { id: "NET_WORTH", label: "Net worth", icon: "ti ti-trending-up", rate: 6 },
  { id: "DEBT_PAYOFF", label: "Debt payoff", icon: "ti ti-trending-down", rate: 0 },
  { id: "CUSTOM", label: "Custom", icon: "ti ti-target", rate: 0 },
];

// How a goal's progress is derived from its linked accounts.
const TRACKING_MODES = [
  { id: "MANUAL", label: "Manual only", hint: "You log every contribution yourself." },
  { id: "BALANCE", label: "Account balance", hint: "The full balance of linked accounts counts." },
  { id: "CONTRIBUTIONS", label: "Growth since linking", hint: "Only new deposits after linking count." },
];

const typeMeta = (t) => GOAL_TYPES.find((x) => x.id === t) || GOAL_TYPES[0];

const acctLabel = (a) =>
  `${a.officialName || a.name || "Account"}${a.subtype ? ` · ${a.subtype}` : ""} — ${currency(a.currentBalance)}`;

function monthsUntil(dateStr) {
  if (!dateStr) return 0;
  const target = new Date(dateStr);
  const now = new Date();
  if (Number.isNaN(target.getTime())) return 0;
  return Math.max(0, (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth()));
}

const EMPTY = {
  name: "", goalType: "SAVINGS", trackingMode: "MANUAL",
  targetAmount: "", currentAmount: "", targetDate: "", accountIds: [],
  // Debt-payoff (mortgage) inputs
  propertyId: "", loanAccountId: "", mortgageApr: "", monthlyPayment: "",
};

const propLabel = (p) =>
  `${p.address || "Property"} — mortgage ${currency(p.mortgageBalance)}`;

export default function GoalsPage() {
  const [goals, setGoals] = useState([]);
  const [accounts, setAccounts] = useState([]);         // depository (savings/cash) accounts to link
  const [loanAccounts, setLoanAccounts] = useState([]); // loan/mortgage accounts (payoff fallback)
  const [properties, setProperties] = useState([]);     // properties with a mortgage
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const acctById = useMemo(() => Object.fromEntries(accounts.map((a) => [String(a.id), a])), [accounts]);

  const load = async () => {
    setLoading(true); setError("");
    try { setGoals((await api.getGoals()) || []); }
    catch (e) { setError(e?.message || "Couldn't load goals."); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  // Split linked accounts: depository = savings targets; loan/mortgage = payoff sources.
  useEffect(() => {
    api.getAccounts()
      .then((res) => {
        const all = Array.isArray(res) ? res : res?.items || [];
        setAccounts(all.filter((a) => (a.type || "").toLowerCase() === "depository"));
        setLoanAccounts(all.filter((a) => ["loan", "mortgage", "credit"].includes((a.type || "").toLowerCase())
          || (a.subtype || "").toLowerCase() === "mortgage"));
      })
      .catch(() => {});
  }, []);

  // Properties with a mortgage balance can become payoff goals.
  useEffect(() => {
    api.getRealEstate()
      .then((res) => setProperties((Array.isArray(res) ? res : res?.items || []).filter((p) => Number(p.mortgageBalance) > 0)))
      .catch(() => {});
  }, []);

  const setF = (k) => (v) => setForm((f) => ({ ...f, [k]: typeof v === "string" ? v : v?.target?.value }));

  const toggleFormAccount = (id) =>
    setForm((f) => {
      const has = f.accountIds.includes(id);
      const accountIds = has ? f.accountIds.filter((x) => x !== id) : [...f.accountIds, id];
      // Linking implies auto-tracking; default MANUAL goals to BALANCE once an account is chosen.
      const trackingMode = accountIds.length && f.trackingMode === "MANUAL" ? "BALANCE" : f.trackingMode;
      return { ...f, accountIds, trackingMode };
    });

  const isPayoffForm = form.goalType === "DEBT_PAYOFF";

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      if (isPayoffForm) {
        // Mortgage payoff: baseline balance (and APR/payment for a property) are captured server-side.
        await api.addGoal({
          name: form.name || "Mortgage payoff",
          goalType: "DEBT_PAYOFF",
          propertyId: form.propertyId ? Number(form.propertyId) : null,
          loanAccountId: form.loanAccountId ? Number(form.loanAccountId) : null,
          mortgageApr: Number(form.mortgageApr) || null,
          monthlyPayment: Number(form.monthlyPayment) || null,
          targetDate: form.targetDate || null,
        });
      } else {
        const firstCcy = form.accountIds.map((id) => acctById[id]?.currency).find(Boolean);
        await api.addGoal({
          name: form.name,
          goalType: form.goalType,
          trackingMode: form.trackingMode,
          currency: firstCcy || null,
          targetAmount: Number(form.targetAmount) || 0,
          currentAmount: Number(form.currentAmount) || 0,
          targetDate: form.targetDate || null,
          accountIds: form.accountIds.map((id) => Number(id)),
        });
      }
      setForm(EMPTY); setShowForm(false); await load();
    } catch (e2) { setError(e2?.message || "Couldn't save the goal."); }
    finally { setSaving(false); }
  };

  // Pick a property to pay off → prefill a friendly name.
  const pickPayoffProperty = (id) => {
    const p = properties.find((x) => String(x.id) === String(id));
    setForm((f) => ({
      ...f, propertyId: id, loanAccountId: "",
      name: f.name || (p ? `Pay off ${p.address || "mortgage"}` : f.name),
    }));
  };
  const pickPayoffLoan = (id) => {
    const a = loanAccounts.find((x) => String(x.id) === String(id));
    setForm((f) => ({
      ...f, loanAccountId: id, propertyId: "",
      name: f.name || (a ? `Pay off ${a.officialName || a.name}` : f.name),
    }));
  };

  // ---- Per-goal mutations (all server-side; reload after each) ----
  const guarded = (fn) => async (...args) => {
    try { await fn(...args); await load(); }
    catch (e) { setError(e?.message || "Something went wrong."); }
  };
  const addContribution = guarded((g, amount, note) => api.addGoalContribution(g.id, amount, note));
  const linkAccount = guarded((g, accountId) => accountId && api.linkGoalAccount(g.id, Number(accountId)));
  const unlinkAccount = guarded((g, accountId) => api.unlinkGoalAccount(g.id, accountId));
  const remove = guarded((g) => api.deleteGoal(g.id));
  const setMode = guarded((g, trackingMode) => api.updateGoal(g.id, { ...g, trackingMode }));
  const setExtraPayment = guarded((g, extraPayment) => api.updateGoal(g.id, { ...g, extraPayment: Math.max(0, Number(extraPayment) || 0) }));

  // Money KPIs are about savings goals; payoff goals are a different unit (debt paid down), shown per-card.
  const savingsGoals = useMemo(() => goals.filter((g) => !g.payoffSource), [goals]);
  const totalTarget = useMemo(() => savingsGoals.reduce((s, g) => s + Number(g.targetAmount || 0), 0), [savingsGoals]);
  const totalSaved = useMemo(() => savingsGoals.reduce((s, g) => s + Number(g.savedAmount ?? g.currentAmount ?? 0), 0), [savingsGoals]);
  const totalNeeded = Math.max(0, totalTarget - totalSaved);

  // Live sum of the balances the user has ticked in the create form — previews what will count.
  const selectedBalance = useMemo(
    () => form.accountIds.reduce((s, id) => s + (Number(acctById[id]?.currentBalance) || 0), 0),
    [form.accountIds, acctById]
  );

  return (
    <div className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">Goals</div>
          <div className="page-subtitle">Link savings accounts and watch progress update automatically — or log contributions by hand.</div>
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
          <div className="kpi-card"><div className="kpi-label">Still needed</div><div className="kpi-value">{currency(totalNeeded)}</div></div>
          <div className="kpi-card"><div className="kpi-label">Total target</div><div className="kpi-value">{currency(totalTarget)}</div></div>
        </div>
      )}

      {showForm && (
        <form className="card" onSubmit={submit} style={{ marginBottom: 16 }}>
          <div className="section-title">New goal</div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Name</label>
              <input className="form-input" value={form.name} onChange={setF("name")} placeholder={isPayoffForm ? "Pay off home" : "Emergency fund"} required />
            </div>
            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="form-select" value={form.goalType} onChange={setF("goalType")}>
                {GOAL_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            {!isPayoffForm && (
              <>
                <div className="form-group">
                  <label className="form-label">Target amount</label>
                  <input className="form-input" type="number" value={form.targetAmount} onChange={setF("targetAmount")} placeholder="20000" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Starting balance <span style={{ color: "var(--tv-text-muted)", fontWeight: 400 }}>(manual base)</span></label>
                  <input className="form-input" type="number" value={form.currentAmount} onChange={setF("currentAmount")} placeholder="0" />
                </div>
                <div className="form-group">
                  <label className="form-label">Tracking</label>
                  <select className="form-select" value={form.trackingMode} onChange={setF("trackingMode")}>
                    {TRACKING_MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                  <div style={{ fontSize: 12, color: "var(--tv-text-muted)", marginTop: 6 }}>
                    {TRACKING_MODES.find((m) => m.id === form.trackingMode)?.hint}
                  </div>
                </div>
              </>
            )}
            <div className="form-group">
              <label className="form-label">Target date <span style={{ color: "var(--tv-text-muted)", fontWeight: 400 }}>(optional)</span></label>
              <input className="form-input" type="date" value={form.targetDate} onChange={setF("targetDate")} />
            </div>
          </div>

          {!isPayoffForm && accounts.length > 0 && (
            <div className="form-group">
              <label className="form-label">Fund from accounts <span style={{ color: "var(--tv-text-muted)", fontWeight: 400 }}>(optional — pick any)</span></label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {accounts.map((a) => {
                  const on = form.accountIds.includes(String(a.id));
                  return (
                    <button type="button" key={a.id}
                      className={`btn btn-sm ${on ? "btn-primary" : "btn-secondary"}`}
                      onClick={() => toggleFormAccount(String(a.id))}>
                      {on && <i className="ti ti-check" style={{ marginRight: 4 }}></i>}
                      {acctLabel(a)}
                    </button>
                  );
                })}
              </div>
              {form.accountIds.length > 0 && (
                <div style={{ fontSize: 12.5, marginTop: 8, color: "var(--tv-text-secondary)" }}>
                  {form.trackingMode === "CONTRIBUTIONS" ? (
                    <><i className="ti ti-seedling" style={{ color: "var(--tv-forest-light)" }}></i> Tracking starts at <strong style={{ color: "var(--tv-text-primary)" }}>$0</strong> — only new deposits after linking will count.</>
                  ) : form.trackingMode === "MANUAL" ? (
                    <><i className="ti ti-info-circle"></i> Linked for reference — balances won't auto-count in Manual mode.</>
                  ) : (
                    <><i className="ti ti-pig-money" style={{ color: "var(--tv-forest-light)" }}></i> <strong style={{ color: "var(--tv-text-primary)" }}>{currency(selectedBalance)}</strong> from {form.accountIds.length} account{form.accountIds.length > 1 ? "s" : ""} will count toward this goal.</>
                  )}
                </div>
              )}
            </div>
          )}

          {isPayoffForm && (
            <div className="form-group">
              <label className="form-label">Which mortgage are you paying off?</label>
              {properties.length === 0 && loanAccounts.length === 0 ? (
                <div style={{ fontSize: 12.5, color: "var(--tv-text-muted)" }}>
                  No mortgage found. Add a property with a mortgage under the <strong>Properties</strong> tab, or link a loan account, then it'll show up here.
                </div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {properties.map((p) => {
                    const on = String(form.propertyId) === String(p.id);
                    return (
                      <button type="button" key={`p${p.id}`}
                        className={`btn btn-sm ${on ? "btn-primary" : "btn-secondary"}`}
                        onClick={() => pickPayoffProperty(String(p.id))}>
                        {on && <i className="ti ti-check" style={{ marginRight: 4 }}></i>}
                        <i className="ti ti-home" style={{ marginRight: 4 }}></i>{propLabel(p)}
                      </button>
                    );
                  })}
                  {loanAccounts.map((a) => {
                    const on = String(form.loanAccountId) === String(a.id);
                    return (
                      <button type="button" key={`a${a.id}`}
                        className={`btn btn-sm ${on ? "btn-primary" : "btn-secondary"}`}
                        onClick={() => pickPayoffLoan(String(a.id))}>
                        {on && <i className="ti ti-check" style={{ marginRight: 4 }}></i>}
                        <i className="ti ti-building-bank" style={{ marginRight: 4 }}></i>{acctLabel(a)}
                      </button>
                    );
                  })}
                </div>
              )}
              {form.propertyId && (
                <div style={{ fontSize: 12.5, marginTop: 8, color: "var(--tv-text-secondary)" }}>
                  <i className="ti ti-check" style={{ color: "var(--tv-forest-light)" }}></i> We'll track the balance, rate and payment from this property and project your debt-free date.
                </div>
              )}
              {form.loanAccountId && (
                <div className="grid-2" style={{ marginTop: 10 }}>
                  <div className="form-group">
                    <label className="form-label">Mortgage APR %</label>
                    <input className="form-input" type="number" step="0.01" value={form.mortgageApr} onChange={setF("mortgageApr")} placeholder="6.5" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Monthly payment</label>
                    <input className="form-input" type="number" value={form.monthlyPayment} onChange={setF("monthlyPayment")} placeholder="2400" />
                  </div>
                  <div style={{ gridColumn: "1 / -1", fontSize: 12, color: "var(--tv-text-muted)" }}>
                    A loan account gives us the balance; add the rate and payment to project a payoff date.
                  </div>
                </div>
              )}
            </div>
          )}

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
          <p>No goals yet. Create one to start tracking — link a savings account and progress updates on its own.</p>
        </div></div>
      ) : (
        <div className="grid-2">
          {goals.map((g) => (
            g.payoffSource ? (
              <PayoffCard key={g.id} g={g} onSetExtra={setExtraPayment} onRemove={remove} />
            ) : (
              <GoalCard key={g.id} g={g} accounts={accounts}
                onAddContribution={addContribution} onLink={linkAccount} onUnlink={unlinkAccount}
                onSetMode={setMode} onRemove={remove} />
            )
          ))}
        </div>
      )}
    </div>
  );
}

// Mortgage/debt payoff goal: progress = paid down since start, plus a payoff-date projection and an
// extra-payment "what if" (how much sooner you'd be debt-free and how much interest you'd save).
function PayoffCard({ g, onSetExtra, onRemove }) {
  const [extra, setExtra] = useState(String(g.extraPayment || ""));
  useEffect(() => { setExtra(String(g.extraPayment || "")); }, [g.extraPayment]);

  const balance = Number(g.currentBalance || 0);
  const apr = Number(g.mortgageApr || 0);
  const payment = Number(g.monthlyPayment || 0);
  const extraNum = Math.max(0, Number(extra) || 0);
  const progress = Math.max(0, Math.min(1, Number(g.progress) || 0));
  const paidOff = Number(g.paidOff || 0);
  const starting = Number(g.startingBalance || 0);
  const done = balance <= 0 && starting > 0;

  const canProject = balance > 0 && apr > 0 && payment > 0;
  const base = canProject ? mortgagePayoff(balance, apr, payment, 0) : null;
  const impact = canProject && extraNum > 0 ? extraPaymentImpact(balance, apr, payment, extraNum) : null;
  const baseLbl = base?.feasible ? payoffDateLabel(base.months) : null;
  const withLbl = impact?.withExtra?.feasible ? payoffDateLabel(impact.withExtra.months) : null;

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <div className="item-icon icon-forest"><i className="ti ti-home-dollar"></i></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 17 }}>{g.name}</div>
          <div className="item-sub">
            Mortgage payoff · {g.payoffLabel || "mortgage"}
            {g.payoffStale && <span style={{ color: "var(--tv-text-muted)" }}> · offline</span>}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "var(--tv-text-muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>Balance left</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 19, color: done ? "var(--tv-positive)" : "var(--tv-forest)" }}>{done ? "✓ Paid off" : currency(balance)}</div>
        </div>
        <button className="icon-btn" title="Delete goal" onClick={() => onRemove(g)}><i className="ti ti-trash"></i></button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
        <span style={{ fontWeight: 600 }}>{currency(paidOff)} paid off</span>
        <span style={{ color: "var(--tv-text-muted)" }}>of {currency(starting)} · {Math.round(progress * 100)}%</span>
      </div>
      <div style={{ height: 8, background: "var(--tv-border-light)", borderRadius: 999, overflow: "hidden" }}>
        <div style={{ width: `${progress * 100}%`, height: "100%", background: done ? "var(--tv-positive)" : "var(--tv-forest-light)", transition: "width .3s ease" }} />
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10, fontSize: 12.5, color: "var(--tv-text-secondary)" }}>
        {apr > 0 && <span><i className="ti ti-percentage" style={{ color: "var(--tv-text-muted)" }}></i> {apr}% APR</span>}
        {payment > 0 && <span><i className="ti ti-calendar-repeat" style={{ color: "var(--tv-text-muted)" }}></i> {currency(payment)}/mo</span>}
      </div>

      {/* Payoff projection */}
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--tv-border-light)" }}>
        {done ? (
          <span className="badge badge-green"><i className="ti ti-check"></i> Mortgage paid off</span>
        ) : !canProject ? (
          <div style={{ fontSize: 12.5, color: "var(--tv-text-muted)" }}>
            <i className="ti ti-info-circle"></i> Add the APR and monthly payment to project your debt-free date.
          </div>
        ) : !base?.feasible ? (
          <div style={{ fontSize: 12.5, color: "var(--tv-negative)" }}>
            <i className="ti ti-alert-triangle"></i> At {currency(payment)}/mo the payment doesn't cover the interest — it won't pay down.
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13 }}>
              Debt-free <strong style={{ color: "var(--tv-text-primary)" }}>{baseLbl.date}</strong>
              <span style={{ color: "var(--tv-text-muted)" }}> · {baseLbl.duration} left · {currency(base.totalInterest)} interest</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
              <span style={{ fontSize: 12.5, color: "var(--tv-text-muted)" }}>Extra / mo</span>
              <input className="form-input" type="number" placeholder="0" style={{ height: 34, width: 110, fontSize: 12.5 }}
                value={extra} onChange={(e) => setExtra(e.target.value)}
                onBlur={() => { if (String(g.extraPayment || "") !== String(extraNum || "")) onSetExtra(g, extraNum); }} />
              <div style={{ display: "flex", gap: 6 }}>
                {[100, 250, 500].map((v) => (
                  <button key={v} className="btn btn-secondary btn-sm" onClick={() => { setExtra(String(v)); onSetExtra(g, v); }}>+${v}</button>
                ))}
              </div>
            </div>
            {impact && withLbl && impact.monthsSaved > 0 && (
              <div style={{ fontSize: 12.5, marginTop: 8, color: "var(--tv-positive)" }}>
                <i className="ti ti-rocket"></i> Paying <strong>{currency(extraNum)}/mo</strong> extra → debt-free <strong>{withLbl.date}</strong>
                {" "}({payoffDateLabel(impact.monthsSaved).duration} sooner), saving <strong>{currency(impact.interestSaved)}</strong> in interest.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function GoalCard({ g, accounts, onAddContribution, onLink, onUnlink, onSetMode, onRemove }) {
  const [pick, setPick] = useState("");     // account to link
  const [custom, setCustom] = useState(""); // custom manual contribution

  const meta = typeMeta(g.goalType);
  const saved = Number(g.savedAmount ?? g.currentAmount ?? 0);
  const progress = Math.max(0, Math.min(1, Number(g.progress) || 0));
  const remaining = Math.max(0, Number(g.targetAmount || 0) - saved);
  const months = monthsUntil(g.targetDate);
  const required = g.targetDate ? requiredMonthlyContribution(g.targetAmount, saved, months, meta.rate) : null;
  const done = saved >= Number(g.targetAmount || 0) && Number(g.targetAmount || 0) > 0;
  const overfunded = saved > Number(g.targetAmount || 0) && Number(g.targetAmount || 0) > 0;
  const links = g.linkedAccounts || [];
  const linkedIds = new Set(links.map((l) => String(l.accountId)));
  const linkable = accounts.filter((a) => !linkedIds.has(String(a.id)));
  const modeLabel = TRACKING_MODES.find((m) => m.id === g.trackingMode)?.label || "Manual only";

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        {/* Progress ring with the goal's icon in the center — communicates % at a glance. */}
        <ProgressRing
          value={progress}
          size={46}
          thickness={5}
          color={done ? "var(--tv-positive)" : "var(--tv-forest-light)"}
          icon={meta.icon}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 17 }}>{g.name}</div>
          <div className="item-sub">{meta.label}{g.targetDate ? ` · by ${new Date(g.targetDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}` : ""}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "var(--tv-text-muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>{done ? "Reached" : "Still needed"}</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 19, color: done ? "var(--tv-positive)" : "var(--tv-forest)" }}>{done ? "✓" : currency(remaining)}</div>
        </div>
        <button className="icon-btn" title="Delete goal" onClick={() => onRemove(g)}><i className="ti ti-trash"></i></button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
        <span style={{ fontWeight: 600 }}>{currency(saved)}</span>
        <span style={{ color: "var(--tv-text-muted)" }}>of {currency(g.targetAmount)} · {Math.round(progress * 100)}%</span>
      </div>
      <div style={{ height: 8, background: "var(--tv-border-light)", borderRadius: 999, overflow: "hidden" }}>
        <div style={{ width: `${progress * 100}%`, height: "100%", background: done ? "var(--tv-positive)" : "var(--tv-forest-light)", transition: "width .3s ease" }} />
      </div>
      {overfunded && <div style={{ fontSize: 12, color: "var(--tv-positive)", marginTop: 6 }}>
        <i className="ti ti-confetti"></i> {currency(saved - Number(g.targetAmount))} over target</div>}
      {g.currencyMismatch && <div style={{ fontSize: 12, color: "var(--tv-negative)", marginTop: 6 }}>
        <i className="ti ti-alert-triangle"></i> A linked account is in another currency and isn't counted.</div>}

      <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
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
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => onAddContribution(g, 100, "Quick add")}>+$100</button>
          <button className="btn btn-secondary btn-sm" onClick={() => onAddContribution(g, 500, "Quick add")}>+$500</button>
        </div>
      </div>

      {/* Manual contribution */}
      <div style={{ marginTop: 10, display: "flex", gap: 6, alignItems: "center" }}>
        <input className="form-input" type="number" placeholder="Log an amount…" style={{ height: 34, fontSize: 12.5 }}
          value={custom} onChange={(e) => setCustom(e.target.value)} />
        <button className="btn btn-secondary btn-sm" disabled={!Number(custom)}
          onClick={() => { onAddContribution(g, Number(custom), "Manual entry"); setCustom(""); }}>
          <i className="ti ti-plus"></i> Log
        </button>
      </div>

      {/* Tracking mode + linked accounts */}
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--tv-border-light)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: "var(--tv-text-muted)" }}>Tracking</span>
          <select className="form-select" style={{ flex: 1, height: 32, fontSize: 12.5 }}
            value={g.trackingMode || "MANUAL"} onChange={(e) => onSetMode(g, e.target.value)}>
            {TRACKING_MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>

        {links.map((l) => (
          <div key={l.accountId} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, marginBottom: 4 }}>
            <i className="ti ti-building-bank" style={{ color: "var(--tv-text-muted)" }}></i>
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {l.accountName || `Account ${l.accountId}`}
              {l.stale && <span title="Using last-seen balance" style={{ color: "var(--tv-text-muted)" }}> · offline</span>}
            </span>
            <span style={{ color: "var(--tv-text-secondary)" }}>
              {g.trackingMode === "MANUAL" ? currency(l.balance) : `+${currency(l.contributes)}`}
            </span>
            <button className="icon-btn" title="Unlink account" onClick={() => onUnlink(g, l.accountId)}><i className="ti ti-unlink"></i></button>
          </div>
        ))}

        {linkable.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <select className="form-select" style={{ flex: 1, height: 34, fontSize: 12.5 }}
              value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Link a savings account…</option>
              {linkable.map((a) => <option key={a.id} value={a.id}>{acctLabel(a)}</option>)}
            </select>
            <button className="btn btn-secondary btn-sm" disabled={!pick}
              onClick={() => { onLink(g, pick); setPick(""); }}>
              <i className="ti ti-link"></i> Link
            </button>
          </div>
        )}
        {g.trackingMode !== "MANUAL" && links.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--tv-text-muted)", marginTop: 6 }}>
            Link an account above and its balance will track this goal automatically.
          </div>
        )}
      </div>
    </div>
  );
}
