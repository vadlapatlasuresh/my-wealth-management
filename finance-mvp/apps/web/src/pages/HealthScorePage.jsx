import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { computeHealthScore } from "../utils/healthScore";
import ScoreGauge from "../components/viz/ScoreGauge";

/* HealthScorePage — a single 0-100 financial health score with an action-first breakdown
   (Phase 2). Computed client-side from linked accounts + recent transactions + the net-worth
   snapshot (see utils/healthScore.js). feature_key: individual.healthScore. Action-oriented by
   design: every factor tells the user what to do next, not just a number.
   Uses the shared banded ScoreGauge (studio-design migration) for a consistent gauge app-wide. */

// Score → accent color (traffic-light, but on-brand).
function scoreColor(score) {
  if (score >= 80) return "var(--tv-forest, #2f7a5b)";
  if (score >= 60) return "#3f8f6f";
  if (score >= 40) return "var(--tv-gold, #c9973a)";
  return "var(--tv-red, #c0392b)";
}

// 0–100 bands for the shared ScoreGauge (parallels the credit gauge's FICO bands).
const HEALTH_BANDS = [
  { min: 0, max: 39, color: "#F0776B", label: "Needs work" },
  { min: 40, max: 59, color: "#E6B455", label: "Fair" },
  { min: 60, max: 79, color: "#5BB98C", label: "Good" },
  { min: 80, max: 100, color: "#3DDC97", label: "Excellent" },
];

function FactorRow({ f, last }) {
  const color = scoreColor(f.score);
  return (
    <div style={{ display: "flex", gap: 12, padding: "14px 0", borderBottom: last ? "none" : "1px solid var(--tv-border, rgba(0,0,0,.06))" }}>
      <span style={{ display: "inline-flex", width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 10, background: "rgba(0,0,0,.04)", color, flex: "0 0 auto" }}>
        <i className={f.icon} style={{ fontSize: 18 }} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
          <span style={{ fontSize: 14.5, fontWeight: 600 }}>{f.label}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color }}>{f.band}</span>
        </div>
        <div className="page-subtitle" style={{ margin: "2px 0 6px", fontSize: 12.5 }}>{f.detail}</div>
        {/* mini progress bar */}
        <div style={{ height: 6, borderRadius: 6, background: "var(--tv-border, rgba(0,0,0,.08))", overflow: "hidden", marginBottom: 6 }}>
          <div style={{ width: `${f.score}%`, height: "100%", background: color }} />
        </div>
        <div style={{ fontSize: 12.5, color: "var(--tv-muted, #7a8a83)" }}>{f.action}</div>
      </div>
    </div>
  );
}

export default function HealthScorePage({ accounts = [], transactions = [], snapshot = null }) {
  const navigate = useNavigate();
  const result = useMemo(
    () => computeHealthScore({ accounts, transactions, snapshot }),
    [accounts, transactions, snapshot]
  );

  return (
    <div className="page active">
      <div style={{ marginBottom: 18 }}>
        <div className="page-title">Financial health score</div>
        <div className="page-subtitle">One number for where you stand — and the moves that raise it.</div>
      </div>

      {!result.computable ? (
        <div className="card" style={{ padding: 28, textAlign: "center" }}>
          <i className="ti ti-heartbeat" style={{ fontSize: 34, color: "var(--tv-forest, #2f7a5b)" }} />
          <div className="page-title" style={{ fontSize: 18, marginTop: 10 }}>Link accounts to see your score</div>
          <div className="page-subtitle" style={{ marginBottom: 16 }}>
            Your score is calculated from your real balances and spending. Connect an account to get started.
          </div>
          <button className="btn btn-primary" onClick={() => navigate("/accounts")}>
            <i className="ti ti-plus" /> Link accounts
          </button>
        </div>
      ) : (
        <>
          <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 18 }}>
            <ScoreGauge
              score={result.score}
              min={0}
              max={100}
              bands={HEALTH_BANDS}
              band={{ label: result.band, color: scoreColor(result.score) }}
              size={300}
            />
            <div className="page-subtitle" style={{ textAlign: "center", marginTop: 4 }}>
              Based on {result.factors.length} factor{result.factors.length === 1 ? "" : "s"} from your linked accounts · out of 100.
            </div>
          </div>

          <div className="card" style={{ padding: "4px 18px 12px" }}>
            <div className="page-title" style={{ fontSize: 16, margin: "12px 0 2px" }}>What's driving it</div>
            {result.factors.map((f, i) => (
              <FactorRow key={f.key} f={f} last={i === result.factors.length - 1} />
            ))}
          </div>

          <div className="page-subtitle" style={{ fontSize: 12, marginTop: 12 }}>
            An estimate for guidance, not financial advice. It updates as your accounts and spending change.
          </div>
        </>
      )}
    </div>
  );
}
