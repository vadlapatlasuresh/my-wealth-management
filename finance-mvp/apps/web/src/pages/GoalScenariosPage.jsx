import { useMemo, useState } from "react";
import { currency0 } from "../utils/format";
import { projectRetirement, sustainableMonthlyIncome } from "../utils/goalScenarios";

/* GoalScenariosPage — retirement/goal scenario modelling (Phase 5). Retire-at-X and
   extra-contribution sliders drive a "Monte-Carlo-lite" projection (a pessimistic /
   expected / optimistic band from return ± volatility). Pure math (utils/goalScenarios.js),
   deterministic, glass-styled. feature_key: individual.goalScenarios. Educational, not advice. */

// A projection band chart: shaded low→high range + the expected line, x = age.
function BandChart({ series }) {
  const W = 640, H = 210, padX = 8, padTop = 12, padBot = 26;
  const max = Math.max(1, ...series.map((p) => p.high));
  const x = (i) => padX + (i / Math.max(1, series.length - 1)) * (W - padX * 2);
  const y = (v) => H - padBot - (v / max) * (H - padTop - padBot);
  const line = (key) => series.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(" ");
  const band =
    series.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.high).toFixed(1)}`).join(" ") +
    " " +
    [...series].reverse().map((p, i) => `L ${x(series.length - 1 - i).toFixed(1)} ${y(p.low).toFixed(1)}`).join(" ") +
    " Z";
  const ticks = series.filter((_, i) => i % Math.ceil(series.length / 6) === 0 || i === series.length - 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id="gs-band" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--tv-forest-light)" stopOpacity="0.30" />
          <stop offset="100%" stopColor="var(--tv-forest-light)" stopOpacity="0.04" />
        </linearGradient>
      </defs>
      <path d={band} fill="url(#gs-band)" />
      <path d={line("high")} fill="none" stroke="var(--tv-forest-light)" strokeWidth="1.5" strokeOpacity="0.55" />
      <path d={line("low")} fill="none" stroke="var(--tv-forest-light)" strokeWidth="1.5" strokeOpacity="0.55" />
      <path d={line("expected")} fill="none" stroke="var(--tv-forest)" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx={x(series.length - 1)} cy={y(series[series.length - 1].expected)} r="4" fill="var(--tv-forest)" />
      {ticks.map((p) => (
        <text key={p.age} x={x(p.year)} y={H - 8} textAnchor="middle" style={{ fontSize: 10.5, fill: "var(--tv-text-muted)" }}>{p.age}</text>
      ))}
    </svg>
  );
}

function Field({ label, value, onChange, min, max, step = 1, prefix = "", suffix = "" }) {
  return (
    <div className="form-group" style={{ marginBottom: 0 }}>
      <label className="form-label" style={{ display: "flex", justifyContent: "space-between" }}>
        <span>{label}</span>
        <span style={{ color: "var(--tv-text-secondary)", fontWeight: 700 }}>{prefix}{typeof value === "number" ? value.toLocaleString() : value}{suffix}</span>
      </label>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: "var(--tv-forest)" }} />
    </div>
  );
}

export default function GoalScenariosPage() {
  const [currentAge, setCurrentAge] = useState(32);
  const [retireAge, setRetireAge] = useState(65);
  const [currentSavings, setCurrentSavings] = useState(45000);
  const [monthly, setMonthly] = useState(700);
  const [returnPct, setReturnPct] = useState(6);

  const result = useMemo(
    () => projectRetirement({
      currentAge, retireAge, currentSavings, monthlyContribution: monthly,
      annualReturn: returnPct / 100, volatility: 0.03,
    }),
    [currentAge, retireAge, currentSavings, monthly, returnPct]
  );
  const income = sustainableMonthlyIncome(result.expected);

  return (
    <div className="page active">
      <div style={{ marginBottom: 18 }}>
        <div className="page-title">Goal scenarios</div>
        <div className="page-subtitle">Model retire-at-X and what an extra dollar a month really does — a range, not a single guess.</div>
      </div>

      {/* Inputs */}
      <div className="card" style={{ padding: 18, marginBottom: 18 }}>
        <div className="page-title" style={{ fontSize: 16, marginBottom: 14 }}>Your scenario</div>
        <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <Field label="Retire at age" value={retireAge} onChange={setRetireAge} min={Math.max(currentAge + 1, 50)} max={75} />
          <Field label="Monthly contribution" value={monthly} onChange={setMonthly} min={0} max={4000} step={50} prefix="$" />
          <Field label="Current age" value={currentAge} onChange={setCurrentAge} min={18} max={70} />
          <Field label="Current savings" value={currentSavings} onChange={setCurrentSavings} min={0} max={1000000} step={5000} prefix="$" />
          <Field label="Expected return" value={returnPct} onChange={setReturnPct} min={1} max={12} suffix="% / yr" />
        </div>
      </div>

      {/* Headline KPIs */}
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", marginBottom: 18 }}>
        <div className="kpi-card" style={{ "--kpi-accent": "var(--tv-forest)" }}>
          <div className="page-subtitle" style={{ margin: 0, fontSize: 12 }}>Projected at {retireAge}</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 600 }}>{currency0(result.expected)}</div>
          <div className="page-subtitle" style={{ margin: 0, fontSize: 11.5 }}>expected · in {result.years} yrs</div>
        </div>
        <div className="kpi-card" style={{ "--kpi-accent": "var(--tv-gold)" }}>
          <div className="page-subtitle" style={{ margin: 0, fontSize: 12 }}>Likely range</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600 }}>{currency0(result.pessimistic)} – {currency0(result.optimistic)}</div>
          <div className="page-subtitle" style={{ margin: 0, fontSize: 11.5 }}>pessimistic to optimistic</div>
        </div>
        <div className="kpi-card" style={{ "--kpi-accent": "var(--tv-forest-light)" }}>
          <div className="page-subtitle" style={{ margin: 0, fontSize: 12 }}>Monthly income</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 600 }}>{currency0(income)}</div>
          <div className="page-subtitle" style={{ margin: 0, fontSize: 11.5 }}>at a 4% safe withdrawal</div>
        </div>
        <div className="kpi-card" style={{ "--kpi-accent": "var(--tv-neutral)" }}>
          <div className="page-subtitle" style={{ margin: 0, fontSize: 12 }}>You'll contribute</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 600 }}>{currency0(result.totalContributions)}</div>
          <div className="page-subtitle" style={{ margin: 0, fontSize: 11.5 }}>growth adds {currency0(result.growth)}</div>
        </div>
      </div>

      {/* Projection band */}
      <div className="card" style={{ padding: 18, marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6, flexWrap: "wrap", gap: 8 }}>
          <div className="page-title" style={{ fontSize: 16, margin: 0 }}>Projected balance to age {retireAge}</div>
          <div style={{ display: "flex", gap: 14, fontSize: 12 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 14, height: 3, borderRadius: 2, background: "var(--tv-forest)" }} /> Expected</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 12, height: 10, borderRadius: 3, background: "var(--tv-forest-light)", opacity: 0.35 }} /> Range</span>
          </div>
        </div>
        <BandChart series={result.series} />
      </div>

      <div className="page-subtitle" style={{ fontSize: 12 }}>
        A simplified projection ("Monte-Carlo-lite") using a fixed return ± volatility — educational information, not financial advice.
        Real markets vary year to year; the range shows how sensitive the outcome is to returns.
      </div>
    </div>
  );
}
