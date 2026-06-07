import { useState, useMemo, useEffect } from "react";
import { currency } from "../utils/format";
import {
  simpleInterest,
  compoundInterest,
  extraPaymentImpact,
  payoffDateLabel,
} from "../utils/calculators";
import { api } from "../api";

/* Field helper */
function Field({ label, value, onChange, prefix, suffix, type = "number", step, min }) {
  return (
    <div className="form-group" style={{ marginBottom: 12 }}>
      <label className="form-label">{label}</label>
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        {prefix && <span style={{ position: "absolute", left: 12, color: "var(--tv-text-muted)" }}>{prefix}</span>}
        <input
          className="form-input"
          type={type}
          step={step}
          min={min}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ paddingLeft: prefix ? 26 : undefined, paddingRight: suffix ? 30 : undefined }}
        />
        {suffix && <span style={{ position: "absolute", right: 12, color: "var(--tv-text-muted)" }}>{suffix}</span>}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }) {
  const color =
    tone === "good" ? "var(--tv-positive)" : tone === "bad" ? "var(--tv-negative)" : "var(--tv-text-primary)";
  return (
    <div className="stat-tile">
      <div className="stat-tile-label">{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 22, color }}>{value}</div>
    </div>
  );
}

/* ---------------- Simple interest ---------------- */
function SimpleCalc() {
  const [p, setP] = useState(10000);
  const [r, setR] = useState(5);
  const [t, setT] = useState(3);
  const res = useMemo(() => simpleInterest(p, r, t), [p, r, t]);
  return (
    <div className="grid-2">
      <div className="card">
        <div className="section-title">Inputs</div>
        <Field label="Principal" prefix="$" value={p} onChange={setP} />
        <Field label="Annual rate" suffix="%" value={r} onChange={setR} step="0.1" />
        <Field label="Years" value={t} onChange={setT} step="0.5" />
      </div>
      <div className="card">
        <div className="section-title">Result</div>
        <div className="stat-grid">
          <Stat label="Interest earned" value={currency(res.interest)} tone="good" />
          <Stat label="Total value" value={currency(res.total)} />
        </div>
        <p style={{ fontSize: 12.5, color: "var(--tv-text-muted)", marginTop: 12 }}>
          Simple interest = Principal × Rate × Years. Interest is not reinvested.
        </p>
      </div>
    </div>
  );
}

/* ---------------- Compound interest ---------------- */
function CompoundCalc() {
  const [p, setP] = useState(10000);
  const [r, setR] = useState(7);
  const [t, setT] = useState(20);
  const [contrib, setContrib] = useState(200);
  const [freq, setFreq] = useState(12);
  const res = useMemo(() => compoundInterest(p, r, t, freq, contrib), [p, r, t, freq, contrib]);
  return (
    <div className="grid-2">
      <div className="card">
        <div className="section-title">Inputs</div>
        <Field label="Initial amount" prefix="$" value={p} onChange={setP} />
        <Field label="Annual return" suffix="%" value={r} onChange={setR} step="0.1" />
        <Field label="Years" value={t} onChange={setT} />
        <Field label="Monthly contribution" prefix="$" value={contrib} onChange={setContrib} />
        <div className="form-group">
          <label className="form-label">Compounding</label>
          <select className="form-select" value={freq} onChange={(e) => setFreq(Number(e.target.value))}>
            <option value={12}>Monthly</option>
            <option value={4}>Quarterly</option>
            <option value={1}>Annually</option>
          </select>
        </div>
      </div>
      <div className="card">
        <div className="section-title">Projection</div>
        <div className="stat-grid">
          <Stat label="Future value" value={currency(res.futureValue)} tone="good" />
          <Stat label="You contribute" value={currency(res.totalContributions)} />
          <Stat label="Interest earned" value={currency(res.totalInterest)} tone="good" />
        </div>
        <table className="tv-table" style={{ marginTop: 14, width: "100%" }}>
          <thead><tr><th>Year</th><th style={{ textAlign: "right" }}>Contributed</th><th style={{ textAlign: "right" }}>Balance</th></tr></thead>
          <tbody>
            {res.schedule.filter((_, i) => i % Math.ceil(res.schedule.length / 8 || 1) === 0 || i === res.schedule.length - 1).map((row) => (
              <tr key={row.year}>
                <td>{row.year}</td>
                <td style={{ textAlign: "right" }}>{currency(row.contributed)}</td>
                <td style={{ textAlign: "right", fontWeight: 600 }}>{currency(row.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- Mortgage payoff / extra payment ---------------- */
function MortgageCalc() {
  const [balance, setBalance] = useState(360000);
  const [rate, setRate] = useState(6.5);
  const [payment, setPayment] = useState(2400);
  const [extra, setExtra] = useState(300);
  const [properties, setProperties] = useState([]);

  // Offer to prefill the balance from the user's REAL mortgaged properties.
  useEffect(() => {
    let active = true;
    api.getRealEstate()
      .then((res) => {
        if (!active) return;
        const items = (Array.isArray(res) ? res : res?.items || [])
          .filter((p) => Number(p.mortgageBalance) > 0);
        setProperties(items);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const r = useMemo(() => extraPaymentImpact(balance, rate, payment, extra), [balance, rate, payment, extra]);
  const basePayoff = payoffDateLabel(r.base.months);
  const newPayoff = payoffDateLabel(r.withExtra.months);
  const infeasible = !r.base.feasible || !r.withExtra.feasible;

  return (
    <div className="grid-2">
      <div className="card">
        <div className="section-title">Your mortgage</div>
        {properties.length > 0 && (
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">Use a linked property</label>
            <select
              className="form-select"
              onChange={(e) => { const p = properties[Number(e.target.value)]; if (p) setBalance(Number(p.mortgageBalance)); }}
              defaultValue=""
            >
              <option value="" disabled>Select a property…</option>
              {properties.map((p, i) => (
                <option key={p.id ?? i} value={i}>{p.address} — {currency(p.mortgageBalance)} owed</option>
              ))}
            </select>
          </div>
        )}
        <Field label="Balance owed" prefix="$" value={balance} onChange={setBalance} />
        <Field label="Interest rate (APR)" suffix="%" value={rate} onChange={setRate} step="0.05" />
        <Field label="Monthly payment (P&I)" prefix="$" value={payment} onChange={setPayment} />
        <Field label="Extra each month" prefix="$" value={extra} onChange={setExtra} />
      </div>
      <div className="card">
        <div className="section-title">How much faster you'd be free</div>
        {infeasible ? (
          <div className="empty-state" style={{ padding: "24px 8px" }}>
            <i className="ti ti-alert-triangle" style={{ color: "var(--tv-warning)" }}></i>
            <p>That monthly payment doesn't cover the interest — increase the payment to pay this loan off.</p>
          </div>
        ) : (
          <>
            <div className="stat-grid">
              <Stat label="Payoff (current)" value={basePayoff.date} />
              <Stat label="Payoff (with extra)" value={newPayoff.date} tone="good" />
              <Stat label="Time saved" value={payoffDateLabel(r.monthsSaved).duration} tone="good" />
              <Stat label="Interest saved" value={currency(r.interestSaved)} tone="good" />
            </div>
            <div style={{ marginTop: 14, padding: 12, background: "var(--tv-positive-bg)", borderRadius: "var(--radius-md)", fontSize: 13, color: "var(--tv-text-secondary)" }}>
              Paying <strong>{currency(extra)}</strong> extra each month pays your loan off{" "}
              <strong>{payoffDateLabel(r.monthsSaved).duration}</strong> sooner and saves{" "}
              <strong style={{ color: "var(--tv-positive)" }}>{currency(r.interestSaved)}</strong> in interest.
            </div>
            <div style={{ fontSize: 12, color: "var(--tv-text-muted)", marginTop: 10 }}>
              Total interest — current: {currency(r.base.totalInterest)} · with extra: {currency(r.withExtra.totalInterest)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const TABS = [
  { id: "mortgage", label: "Mortgage payoff", icon: "ti ti-home-dollar" },
  { id: "compound", label: "Compound interest", icon: "ti ti-chart-line" },
  { id: "simple", label: "Simple interest", icon: "ti ti-percentage" },
];

export default function CalculatorsPage() {
  const [tab, setTab] = useState("mortgage");
  return (
    <div className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">Calculators</div>
          <div className="page-subtitle">Model interest, growth, and what an extra mortgage payment really saves you.</div>
        </div>
      </div>

      <div className="tabs" style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`btn btn-sm ${tab === t.id ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setTab(t.id)}
          >
            <i className={t.icon}></i> {t.label}
          </button>
        ))}
      </div>

      {tab === "mortgage" && <MortgageCalc />}
      {tab === "compound" && <CompoundCalc />}
      {tab === "simple" && <SimpleCalc />}
    </div>
  );
}
