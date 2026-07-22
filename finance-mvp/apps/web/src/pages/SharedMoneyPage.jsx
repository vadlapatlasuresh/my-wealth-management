import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { currency, currency0 } from "../utils/format";

/* SharedMoneyPage — household-owned goals & bills (Phase 3b).
   These objects belong to the HOUSEHOLD, not to a person: both members see the same goal and
   the same bill, and every contribution/payment is attributed to whoever actually made it.
   Personal accounts, transactions and goals remain private.
   feature_key: individual.sharedGoals. */

const TABS = [
  { id: "goals", label: "Shared goals", icon: "ti ti-target" },
  { id: "bills", label: "Shared bills", icon: "ti ti-receipt" },
];

export default function SharedMoneyPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("goals");
  const [goals, setGoals] = useState(null);
  const [bills, setBills] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [noHousehold, setNoHousehold] = useState(false);

  const load = useCallback(async () => {
    try {
      const [g, b] = await Promise.all([api.getHouseholdGoals(), api.getHouseholdBills()]);
      setGoals(g?.goals ?? []);
      setBills(b?.bills ?? []);
      setNoHousehold(false);
      setError("");
    } catch (e) {
      const msg = e?.message || "";
      // 409 "You're not in a household" is a state, not an error worth shouting about.
      if (/not in a household/i.test(msg)) { setNoHousehold(true); setGoals([]); setBills([]); }
      else { setError(msg || "Couldn't load shared goals and bills."); setGoals([]); setBills([]); }
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
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", marginBottom: 14, borderRadius: 10, background: "rgba(192,57,43,.10)", border: "1px solid var(--tv-red, #c0392b)" }}>
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

      {tab === "goals"
        ? <Goals goals={goals} busy={busy} run={run} />
        : <Bills bills={bills} busy={busy} run={run} />}

      <div className="page-subtitle" style={{ fontSize: 12, marginTop: 14 }}>
        Both members see these. Your personal accounts, transactions and private goals are not shared.
      </div>
    </div>
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
