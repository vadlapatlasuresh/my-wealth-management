import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { currency, currency0 } from "../utils/format";
import { computeInvestmentInsights } from "../utils/investmentInsights";
import DonutChart from "../components/viz/DonutChart";

/* InvestmentInsightsPage — allocation, concentration, fees and drift (Phase 4).
   Computed client-side (utils/investmentInsights.js) from the user's REAL synced holdings
   + alternatives. Fees are estimated only for recognized funds (public expense ratios) with
   an honest coverage note. Not investment advice. feature_key: individual.investInsights. */

const MIX_COLORS = { stocks: "var(--tv-forest, #2E7D5B)", alternatives: "var(--tv-forest-light, #5BB98C)", cash: "var(--tv-gold, #E6B455)" };
const SEV = {
  high: { bar: "var(--tv-negative, #F0776B)", chip: "var(--tv-negative-bg, rgba(240,119,107,.15))", icon: "ti ti-alert-triangle" },
  medium: { bar: "var(--tv-warning, #E9C46A)", chip: "var(--tv-warning-bg, rgba(233,196,106,.15))", icon: "ti ti-alert-circle" },
  low: { bar: "var(--tv-forest-light, #5BB98C)", chip: "var(--tv-sage-pale, rgba(90,185,140,.14))", icon: "ti ti-info-circle" },
};

function Header() {
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="page-title">Investment insights</div>
      <div className="page-subtitle">Your allocation, concentration, fees and drift — from your real holdings. Not advice.</div>
    </div>
  );
}

function Kpi({ label, value, sub, accent }) {
  return (
    <div className="kpi-card" style={{ "--kpi-accent": accent || "var(--tv-forest)" }}>
      <div className="page-subtitle" style={{ margin: 0, fontSize: 12 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600 }}>{value}</div>
      {sub && <div className="page-subtitle" style={{ margin: 0, fontSize: 11.5 }}>{sub}</div>}
    </div>
  );
}

export default function InvestmentInsightsPage({ snapshot }) {
  const navigate = useNavigate();
  const [holdings, setHoldings] = useState(null); // null = loading
  const [altsTotal, setAltsTotal] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      let hs = [];
      try { const d = await api.getHoldings(); hs = Array.isArray(d) ? d : []; } catch { /* fall back below */ }
      if (!hs.length && Array.isArray(snapshot?.holdings)) hs = snapshot.holdings;
      let alt = 0;
      try {
        const a = await api.getAltInvestments();
        if (Array.isArray(a)) alt = a.reduce((s, x) => s + (Number(x.value) || 0), 0);
      } catch { /* alternatives are optional */ }
      if (alive) { setHoldings(hs); setAltsTotal(alt); }
    })();
    return () => { alive = false; };
  }, [snapshot]);

  const r = useMemo(
    () => computeInvestmentInsights({ holdings: holdings || [], altsTotal }),
    [holdings, altsTotal]
  );

  if (holdings === null) {
    return (
      <div className="page active"><Header />
        <div className="card" style={{ padding: 28, textAlign: "center" }}>
          <div className="page-subtitle">Analyzing your portfolio…</div>
        </div>
      </div>
    );
  }

  if (!r.hasData) {
    return (
      <div className="page active"><Header />
        <div className="card" style={{ padding: 28, textAlign: "center" }}>
          <i className="ti ti-chart-pie" style={{ fontSize: 34, color: "var(--tv-forest)" }} />
          <div className="page-title" style={{ fontSize: 18, marginTop: 10 }}>No holdings to analyze yet</div>
          <div className="page-subtitle" style={{ marginBottom: 16 }}>
            Link a broker and sync your positions — then your allocation, fees and drift appear here.
          </div>
          <button className="btn btn-primary" onClick={() => navigate("/invest")}>
            <i className="ti ti-plus" /> Go to Investments
          </button>
        </div>
      </div>
    );
  }

  const donutData = r.mix.filter((m) => m.value > 0).map((m) => ({ label: m.label, value: m.value, color: MIX_COLORS[m.key] }));

  return (
    <div className="page active"><Header />

      {/* KPI row */}
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", marginBottom: 18 }}>
        <Kpi label="Total invested" value={currency0(r.totalValue)} accent="var(--tv-forest)" />
        <Kpi label="Positions" value={r.positionCount} sub={`~${r.effectiveHoldings.toFixed(1)} effective`} accent="var(--tv-forest-light)" />
        <Kpi label="Est. fees / yr" value={r.fees.knownCount ? currency0(r.fees.annualEstimate) : "—"} sub={r.fees.knownCount ? `${(r.fees.weightedExpenseRatio * 100).toFixed(2)}% avg` : "no funds recognized"} accent="var(--tv-gold)" />
        <Kpi label="Top position" value={r.concentration ? `${Math.round(r.concentration.topWeight * 100)}%` : "—"} sub={r.concentration?.topSymbol} accent={r.concentration?.flagged ? "var(--tv-negative)" : "var(--tv-forest)"} />
      </div>

      {/* Mix + drift */}
      <div className="card" style={{ padding: 18, marginBottom: 18 }}>
        <div className="page-title" style={{ fontSize: 16, marginBottom: 12 }}>Your mix vs target</div>
        <div style={{ display: "flex", gap: 22, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: "0 0 auto" }}>
            <DonutChart size={190} thickness={26} centerValue={currency0(r.totalValue)} centerLabel="Invested" data={donutData} />
          </div>
          <div style={{ flex: "1 1 280px", minWidth: 260 }}>
            {r.drift.map((d) => (
              <div key={d.key} style={{ padding: "9px 0", borderBottom: "1px solid var(--tv-border-light)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                  <span style={{ width: 11, height: 11, borderRadius: 3, background: MIX_COLORS[d.key], flex: "0 0 auto" }} />
                  <span style={{ flex: 1, fontSize: 13.5 }}>{d.label}</span>
                  <span style={{ fontWeight: 700, fontSize: 13.5 }}>{Math.round(d.current * 100)}%</span>
                  <span className="page-subtitle" style={{ margin: 0, fontSize: 12, minWidth: 66, textAlign: "right" }}>target {Math.round(d.target * 100)}%</span>
                </div>
                {/* proportional bar with a target tick */}
                <div style={{ position: "relative", height: 8, borderRadius: 6, background: "var(--tv-neutral-bg, rgba(255,255,255,.06))", overflow: "visible" }}>
                  <div style={{ width: `${Math.min(100, d.current * 100)}%`, height: "100%", borderRadius: 6, background: MIX_COLORS[d.key] }} />
                  <div style={{ position: "absolute", top: -2, left: `${Math.min(100, d.target * 100)}%`, width: 2, height: 12, background: "var(--tv-text-secondary)", transform: "translateX(-1px)" }} title={`Target ${Math.round(d.target * 100)}%`} />
                </div>
              </div>
            ))}
            <div className="page-subtitle" style={{ fontSize: 11.5, marginTop: 8 }}>The tick marks a neutral growth target — not a recommendation for you specifically.</div>
          </div>
        </div>
      </div>

      {/* Insights / alerts */}
      {r.alerts.length > 0 && (
        <div className="card" style={{ padding: 18, marginBottom: 18 }}>
          <div className="page-title" style={{ fontSize: 16, marginBottom: 12 }}>What to look at</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {r.alerts.map((a) => {
              const s = SEV[a.severity] || SEV.low;
              return (
                <div key={a.id} style={{ display: "flex", gap: 12, padding: "12px 14px", borderRadius: 12, background: "var(--tv-neutral-bg, rgba(255,255,255,.04))", borderLeft: `3px solid ${s.bar}` }}>
                  <span style={{ display: "inline-flex", width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 9, background: s.chip, color: s.bar, flex: "0 0 auto" }}>
                    <i className={s.icon} style={{ fontSize: 18 }} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{a.title}</div>
                    <div className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>{a.detail}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top positions with concentration bars */}
      <div className="card" style={{ padding: 18, marginBottom: 18 }}>
        <div className="page-title" style={{ fontSize: 16, marginBottom: 12 }}>Top positions</div>
        {r.positions.slice(0, 8).map((p, i) => (
          <div key={p.symbol + i} style={{ padding: "9px 0", borderBottom: i < Math.min(r.positions.length, 8) - 1 ? "1px solid var(--tv-border-light)" : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
              <span style={{ fontWeight: 700, fontSize: 13.5, minWidth: 52 }}>{p.symbol}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: "var(--tv-text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
              <span className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>{Math.round(p.weight * 100)}%</span>
              <span style={{ fontWeight: 700, fontSize: 13.5, minWidth: 84, textAlign: "right" }}>{currency(p.value)}</span>
            </div>
            <div style={{ height: 6, borderRadius: 4, background: "var(--tv-neutral-bg, rgba(255,255,255,.06))", overflow: "hidden" }}>
              <div style={{ width: `${Math.min(100, p.weight * 100)}%`, height: "100%", background: i === 0 && r.concentration?.flagged ? "var(--tv-negative)" : "var(--tv-forest-light)" }} />
            </div>
          </div>
        ))}
      </div>

      {/* Fees detail */}
      <div className="card" style={{ padding: 18, marginBottom: 18 }}>
        <div className="page-title" style={{ fontSize: 16, marginBottom: 8 }}>Fees you're paying</div>
        {r.fees.knownCount ? (
          <>
            <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
              <div>
                <div className="page-subtitle" style={{ margin: 0, fontSize: 12 }}>Weighted expense ratio</div>
                <div style={{ fontSize: 24, fontWeight: 800 }}>{(r.fees.weightedExpenseRatio * 100).toFixed(2)}%</div>
              </div>
              <div>
                <div className="page-subtitle" style={{ margin: 0, fontSize: 12 }}>Estimated cost / year</div>
                <div style={{ fontSize: 24, fontWeight: 800 }}>{currency0(r.fees.annualEstimate)}</div>
              </div>
            </div>
            <div className="page-subtitle" style={{ fontSize: 12, marginTop: 10 }}>
              Based on {r.fees.knownCount} recognized fund{r.fees.knownCount === 1 ? "" : "s"} —
              {" "}{Math.round(r.fees.coveragePct * 100)}% of your stock holdings by value. Individual stocks and
              unrecognized tickers are excluded, so this is a floor, not the whole picture.
            </div>
          </>
        ) : (
          <div className="page-subtitle" style={{ fontSize: 13 }}>
            We didn't recognize any of your tickers as funds with a public expense ratio, so there's no honest fee
            figure to show. Individual stocks don't carry an expense ratio.
          </div>
        )}
      </div>

      <div className="page-subtitle" style={{ fontSize: 12 }}>
        Educational information computed from your holdings — not personalized investment advice.
      </div>
    </div>
  );
}
