import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { currency, currency0 } from "../utils/format";
import { categoryColor } from "../utils/categoryPalette";
import DonutChart from "../components/viz/DonutChart";

/* SharedMoneyPage — household-owned income, goals & bills (Phase 3b/3d).
   These objects belong to the HOUSEHOLD, not to a person: both members see the same goal and
   the same bill, and every contribution/payment is attributed to whoever actually made it.
   Personal accounts, transactions and goals remain private.
   feature_key: individual.sharedGoals. */

const TABS = [
  { id: "overview", label: "Overview", icon: "ti ti-chart-donut" },
  { id: "income", label: "Income", icon: "ti ti-cash" },
  { id: "goals", label: "Shared goals", icon: "ti ti-target" },
  { id: "bills", label: "Shared bills", icon: "ti ti-receipt" },
];

/* Normalize any cadence to a comparable MONTHLY figure, so income and bills sit on one axis.
   WEEKLY uses 52/12 (not ×4) so a weekly amount annualizes correctly. */
const toMonthly = (amount, cadence) => {
  const n = Number(amount) || 0;
  switch ((cadence || "MONTHLY").toUpperCase()) {
    case "WEEKLY": return (n * 52) / 12;
    case "YEARLY": return n / 12;
    default: return n; // MONTHLY
  }
};

export default function SharedMoneyPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("overview");
  const [goals, setGoals] = useState(null);
  const [bills, setBills] = useState(null);
  const [income, setIncome] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [noHousehold, setNoHousehold] = useState(false);

  const load = useCallback(async () => {
    try {
      const [g, b, inc] = await Promise.all([
        api.getHouseholdGoals(), api.getHouseholdBills(), api.getHouseholdIncome(),
      ]);
      setGoals(g?.goals ?? []);
      setBills(b?.bills ?? []);
      setIncome(inc?.income ?? []);
      setNoHousehold(false);
      setError("");
    } catch (e) {
      const msg = e?.message || "";
      // 409 "You're not in a household" is a state, not an error worth shouting about.
      if (/not in a household/i.test(msg)) { setNoHousehold(true); setGoals([]); setBills([]); setIncome([]); }
      else { setError(msg || "Couldn't load shared money."); setGoals([]); setBills([]); setIncome([]); }
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const run = async (fn) => {
    setBusy(true); setError("");
    try { await fn(); await load(); }
    catch (e) { setError(e?.message || "Something went wrong."); }
    finally { setBusy(false); }
  };

  if (goals === null) {
    return <div className="page active"><Header /><div className="card" style={{ padding: 24 }}><div className="page-subtitle">Loading…</div></div></div>;
  }

  if (noHousehold) {
    return (
      <div className="page active">
        <Header />
        <div className="card" style={{ padding: 28, textAlign: "center" }}>
          <i className="ti ti-home-heart" style={{ fontSize: 34, color: "var(--tv-forest, #2f7a5b)" }} />
          <div className="page-title" style={{ fontSize: 18, marginTop: 10 }}>Start a household first</div>
          <div className="page-subtitle" style={{ marginBottom: 16 }}>
            Shared goals and bills belong to a household. Create one or accept an invite, then come back.
          </div>
          <button className="btn btn-primary" onClick={() => navigate("/household")}>
            <i className="ti ti-users" /> Go to Household
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page active">
      <Header />
      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", marginBottom: 14, borderRadius: 10, background: "var(--tv-negative-bg)", border: "1px solid var(--tv-red, #c0392b)" }}>
          <i className="ti ti-alert-circle" style={{ color: "var(--tv-red, #c0392b)" }} />
          <span style={{ fontSize: 13.5 }}>{error}</span>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {TABS.map((t) => (
          <button key={t.id} className={`btn btn-sm ${tab === t.id ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab(t.id)}>
            <i className={t.icon} /> {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <Overview income={income} bills={bills} goals={goals} setTab={setTab} />}
      {tab === "income" && <Income income={income} busy={busy} run={run} />}
      {tab === "goals" && <Goals goals={goals} busy={busy} run={run} />}
      {tab === "bills" && <Bills bills={bills} busy={busy} run={run} />}

      <div className="page-subtitle" style={{ fontSize: 12, marginTop: 14 }}>
        Both members see these. Your personal accounts, transactions and private goals are not shared.
      </div>
    </div>
  );
}

/* Overview — the household's money at a glance. Two deliberately separate stories:
   (1) a MONTHLY FLOW view (income vs bills vs what's left) and (2) a CUMULATIVE view
   (what everyone has put into shared goals). We never mix a monthly flow and a running
   total in one chart — that's the classic misleading-donut mistake. */
function Overview({ income, bills, goals, setTab }) {
  const monthly = useMemo(() => {
    const inc = (income || []).reduce((s, i) => s + toMonthly(i.amount, i.cadence), 0);
    const bill = (bills || []).reduce((s, b) => s + toMonthly(b.amount, b.cadence), 0);
    return { inc, bill, left: inc - bill };
  }, [income, bills]);

  // Who earns what — monthly income per member (flow).
  const incomeByMember = useMemo(() => {
    const map = new Map();
    (income || []).forEach((i) => {
      const key = i.memberName || `Member ${i.memberUserId}`;
      map.set(key, (map.get(key) || 0) + toMonthly(i.amount, i.cadence));
    });
    return [...map.entries()].map(([label, value]) => ({ label, value, color: categoryColor(label) }));
  }, [income]);

  // Who's saved what — cumulative contributions to shared goals (stock).
  const contribByMember = useMemo(() => {
    const map = new Map();
    (goals || []).forEach((g) => (g.contributors || []).forEach((c) => {
      const key = c.name || `Member ${c.userId}`;
      map.set(key, (map.get(key) || 0) + (Number(c.amount) || 0));
    }));
    return [...map.entries()].map(([label, value]) => ({ label, value, color: categoryColor(label) }));
  }, [goals]);

  const totalSaved = contribByMember.reduce((s, c) => s + c.value, 0);

  // Monthly allocation of income: what bills claim vs what's left over (flow).
  const allocation = monthly.inc > 0
    ? [
        { label: "Bills", value: monthly.bill, color: categoryColor("Bills & Utilities") },
        { label: "Left over", value: Math.max(0, monthly.left), color: categoryColor("Savings") },
      ]
    : [];

  const hasAnything = (income || []).length > 0 || (bills || []).length > 0 || (goals || []).length > 0;
  if (!hasAnything) {
    return (
      <EmptyCard icon="ti ti-chart-donut" title="Nothing to chart yet"
        text="Add household income and a bill or two, and this overview shows what you bring in, what goes out, and who's contributing." />
    );
  }

  return (
    <>
      {/* Monthly flow — three tiles on one axis */}
      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 14 }}>
        <StatTile label="Income / month" value={currency0(monthly.inc)} accent="var(--tv-positive)" />
        <StatTile label="Bills / month" value={currency0(monthly.bill)} accent="var(--tv-gold, #c9973a)" />
        <StatTile label="Left over / month" value={currency0(monthly.left)}
          accent={monthly.left >= 0 ? "var(--tv-forest, #2f7a5b)" : "var(--tv-negative)"} />
      </div>

      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        {allocation.length > 0 && (
          <ChartCard title="Where the money goes" sub="Share of monthly income claimed by bills">
            <DonutChart data={allocation} size={190} thickness={24}
              centerLabel="Left over" centerValue={currency0(Math.max(0, monthly.left))} />
            <Legend items={allocation} format={currency0} />
          </ChartCard>
        )}

        {incomeByMember.length > 0 && (
          <ChartCard title="Who earns what" sub="Monthly income by household member">
            <DonutChart data={incomeByMember} size={190} thickness={24}
              centerLabel="Per month" centerValue={currency0(monthly.inc)} />
            <Legend items={incomeByMember} format={currency0} />
          </ChartCard>
        )}

        {contribByMember.length > 0 && (
          <ChartCard title="Who's contributed to goals" sub="Total put into shared goals so far">
            <DonutChart data={contribByMember} size={190} thickness={24}
              centerLabel="Saved together" centerValue={currency0(totalSaved)} />
            <Legend items={contribByMember} format={currency} />
          </ChartCard>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => setTab("income")}>
          <i className="ti ti-plus" /> Add income
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setTab("goals")}>Manage goals</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setTab("bills")}>Manage bills</button>
      </div>
    </>
  );
}

function StatTile({ label, value, accent }) {
  return (
    <div className="card" style={{ padding: 14, borderLeft: `3px solid ${accent}` }}>
      <div className="page-subtitle" style={{ margin: 0, fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function ChartCard({ title, sub, children }) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div className="page-title" style={{ fontSize: 15, marginBottom: 2 }}>{title}</div>
      <div className="page-subtitle" style={{ margin: "0 0 12px", fontSize: 12 }}>{sub}</div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>{children}</div>
    </div>
  );
}

/* Legend — identity is never carried by color alone: a swatch + a text label + the value,
   in ink tokens (never the series color for text). */
function Legend({ items, format }) {
  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6 }}>
      {items.filter((i) => i.value > 0).map((i) => (
        <div key={i.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: i.color, flex: "0 0 auto" }} />
          <span style={{ flex: 1, minWidth: 0 }}>{i.label}</span>
          <span style={{ fontWeight: 700 }}>{format(i.value)}</span>
        </div>
      ))}
    </div>
  );
}

/* Income — recurring income each member brings to the household. Attributed to whoever adds it. */
function Income({ income, busy, run }) {
  const [source, setSource] = useState("");
  const [amount, setAmount] = useState("");
  const [cadence, setCadence] = useState("MONTHLY");

  return (
    <>
      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div className="page-title" style={{ fontSize: 16, marginBottom: 10 }}>Add income</div>
        <div className="page-subtitle" style={{ margin: "0 0 10px", fontSize: 12.5 }}>
          Log a recurring income source. It's added under your name — that's what powers the
          "who earns what" split. It's just a figure for the household view; no bank data is shared.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input className="form-input" style={{ flex: 2, minWidth: 160 }} placeholder="e.g. Salary, Rental"
            value={source} onChange={(e) => setSource(e.target.value)} />
          <input className="form-input" style={{ flex: 1, minWidth: 110 }} placeholder="Amount $" inputMode="decimal"
            value={amount} onChange={(e) => setAmount(e.target.value)} />
          <select className="form-select" style={{ flex: "0 0 auto" }} value={cadence} onChange={(e) => setCadence(e.target.value)}>
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
            <option value="YEARLY">Yearly</option>
          </select>
          <button className="btn btn-primary" disabled={busy || !source.trim() || !amount}
            onClick={() => run(async () => { await api.createHouseholdIncome(source.trim(), amount, cadence); setSource(""); setAmount(""); })}>
            <i className="ti ti-plus" /> Add
          </button>
        </div>
      </div>

      {(income || []).length === 0 ? (
        <EmptyCard icon="ti ti-cash" title="No income logged yet"
          text="Add each earner's recurring income so the household can see what it brings in against its bills." />
      ) : (income || []).map((i) => (
        <div key={i.id} className="card" style={{ padding: 16, marginBottom: 10, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 10, height: 34, borderRadius: 4, background: categoryColor(i.memberName || "Member"), flex: "0 0 auto" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{i.source}</div>
            <div className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>
              {i.memberName} · {currency(i.amount)} {(i.cadence || "MONTHLY").toLowerCase()} · {currency0(toMonthly(i.amount, i.cadence))}/mo
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => api.deleteHouseholdIncome(i.id))}>
            Remove
          </button>
        </div>
      ))}
    </>
  );
}

function Goals({ goals, busy, run }) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");

  return (
    <>
      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div className="page-title" style={{ fontSize: 16, marginBottom: 10 }}>New shared goal</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input className="form-input" style={{ flex: 2, minWidth: 180 }} placeholder="e.g. House deposit"
            value={name} onChange={(e) => setName(e.target.value)} />
          <input className="form-input" style={{ flex: 1, minWidth: 120 }} placeholder="Target $" inputMode="decimal"
            value={target} onChange={(e) => setTarget(e.target.value)} />
          <button className="btn btn-primary" disabled={busy || !name.trim() || !target}
            onClick={() => run(async () => { await api.createHouseholdGoal(name.trim(), target); setName(""); setTarget(""); })}>
            <i className="ti ti-plus" /> Add
          </button>
        </div>
      </div>

      {goals.length === 0 ? (
        <EmptyCard icon="ti ti-target" title="No shared goals yet"
          text="Add a goal you're both saving toward — a deposit, a trip, a new roof." />
      ) : goals.map((g) => <GoalCard key={g.id} g={g} busy={busy} run={run} />)}
    </>
  );
}

function GoalCard({ g, busy, run }) {
  const [amount, setAmount] = useState("");
  const saved = Number(g.saved) || 0;
  const targetAmount = Number(g.targetAmount) || 0;
  const pct = targetAmount > 0 ? Math.min(1, saved / targetAmount) : 0;
  const done = pct >= 1;

  return (
    <div className="card" style={{ padding: 18, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 15.5, fontWeight: 700 }}>{g.name}</div>
        <div className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>
          {currency0(saved)} of {currency0(targetAmount)}
        </div>
      </div>

      <div style={{ height: 10, borderRadius: 6, background: "var(--tv-border, rgba(0,0,0,.08))", overflow: "hidden", margin: "10px 0 8px" }}>
        <div style={{ width: `${pct * 100}%`, height: "100%", background: done ? "var(--tv-forest, #2f7a5b)" : "var(--tv-gold, #c9973a)" }} />
      </div>

      {/* who contributed what — the point of a SHARED goal */}
      {(g.contributors || []).length > 0 && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
          {g.contributors.map((c) => (
            <span key={c.userId} style={{ fontSize: 12.5, color: "var(--tv-muted, #7a8a83)" }}>
              <strong style={{ color: "inherit" }}>{c.name}</strong> {currency(c.amount)}
            </span>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input className="form-input" style={{ flex: 1, minWidth: 120 }} placeholder="Add contribution $" inputMode="decimal"
          value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button className="btn btn-secondary btn-sm" disabled={busy || !amount}
          onClick={() => run(async () => { await api.contributeToHouseholdGoal(g.id, amount); setAmount(""); })}>
          Contribute
        </button>
        <button className="btn btn-ghost btn-sm" disabled={busy}
          onClick={() => run(() => api.deleteHouseholdGoal(g.id))}>
          Delete
        </button>
      </div>
    </div>
  );
}

function Bills({ bills, busy, run }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");

  return (
    <>
      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div className="page-title" style={{ fontSize: 16, marginBottom: 10 }}>New shared bill</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input className="form-input" style={{ flex: 2, minWidth: 180 }} placeholder="e.g. Rent"
            value={name} onChange={(e) => setName(e.target.value)} />
          <input className="form-input" style={{ flex: 1, minWidth: 120 }} placeholder="Amount $" inputMode="decimal"
            value={amount} onChange={(e) => setAmount(e.target.value)} />
          <button className="btn btn-primary" disabled={busy || !name.trim() || !amount}
            onClick={() => run(async () => { await api.createHouseholdBill(name.trim(), amount, "MONTHLY"); setName(""); setAmount(""); })}>
            <i className="ti ti-plus" /> Add
          </button>
        </div>
      </div>

      {bills.length === 0 ? (
        <EmptyCard icon="ti ti-receipt" title="No shared bills yet"
          text="Add a bill you split — rent, utilities, childcare — and track who actually paid." />
      ) : bills.map((b) => <BillCard key={b.id} b={b} busy={busy} run={run} />)}
    </>
  );
}

function BillCard({ b, busy, run }) {
  const paid = useMemo(
    () => (b.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0),
    [b.payments]
  );

  return (
    <div className="card" style={{ padding: 18, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 15.5, fontWeight: 700 }}>{b.name}</div>
          <div className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>
            {currency(b.amount)} · {(b.cadence || "MONTHLY").toLowerCase()}
          </div>
        </div>
        <div className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>{currency0(paid)} paid to date</div>
      </div>

      {/* who paid what */}
      {(b.payments || []).length > 0 && (
        <div style={{ margin: "10px 0" }}>
          {b.payments.slice(0, 4).map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", fontSize: 12.5 }}>
              <i className="ti ti-check" style={{ color: "var(--tv-forest, #2f7a5b)" }} />
              <span style={{ flex: 1, minWidth: 0 }}><strong>{p.paidByName}</strong> paid {currency(p.amount)}</span>
              <span style={{ color: "var(--tv-muted, #7a8a83)" }}>{p.paidOn}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn btn-secondary btn-sm" disabled={busy}
          onClick={() => run(() => api.payHouseholdBill(b.id))}>
          <i className="ti ti-cash" /> I paid this
        </button>
        <button className="btn btn-ghost btn-sm" disabled={busy}
          onClick={() => run(() => api.deleteHouseholdBill(b.id))}>
          Delete
        </button>
      </div>
    </div>
  );
}

function EmptyCard({ icon, title, text }) {
  return (
    <div className="card" style={{ padding: 26, textAlign: "center" }}>
      <i className={icon} style={{ fontSize: 32, color: "var(--tv-forest, #2f7a5b)" }} />
      <div className="page-title" style={{ fontSize: 17, marginTop: 8 }}>{title}</div>
      <div className="page-subtitle">{text}</div>
    </div>
  );
}

function Header() {
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="page-title">Shared goals &amp; bills</div>
      <div className="page-subtitle">What you're saving for together — and who actually paid.</div>
    </div>
  );
}
