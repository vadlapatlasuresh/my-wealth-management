import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { currency0 } from "../utils/format";
import { computeEmergencyFund, monthlyContributionFor, coverageLabel } from "../utils/emergencyFund";
import ProgressRing from "../components/viz/ProgressRing";

/* EmergencyFundPage — the emergency-fund coach (Phase 2). Target is N months of your REAL
   expenses (not a guessed number), with the monthly saving needed to close the gap.
   Computed client-side (utils/emergencyFund.js). feature_key: individual.emergencyFund. */

const TARGETS = [3, 6, 12];
const HORIZONS = [6, 12, 24];

export default function EmergencyFundPage({ accounts = [], transactions = [] }) {
  const navigate = useNavigate();
  const [targetMonths, setTargetMonths] = useState(6);
  const [horizon, setHorizon] = useState(12);

  const fund = useMemo(
    () => computeEmergencyFund({ accounts, transactions, targetMonths }),
    [accounts, transactions, targetMonths]
  );
  const perMonth = monthlyContributionFor(fund.gap, horizon);
  const done = fund.computable && fund.gap <= 0;
  const accent = done ? "var(--tv-forest, #2f7a5b)" : "var(--tv-gold, #c9973a)";

  if (!fund.computable) {
    return (
      <div className="page active">
        <Header />
        <div className="card" style={{ padding: 28, textAlign: "center" }}>
          <i className="ti ti-umbrella" style={{ fontSize: 34, color: "var(--tv-forest, #2f7a5b)" }} />
          <div className="page-title" style={{ fontSize: 18, marginTop: 10 }}>We need your spending first</div>
          <div className="page-subtitle" style={{ marginBottom: 16 }}>
            Your target is based on your real monthly expenses. Link accounts and we'll size the fund for you.
          </div>
          <button className="btn btn-primary" onClick={() => navigate("/accounts")}>
            <i className="ti ti-plus" /> Link accounts
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page active">
      <Header />

      {/* Progress — circular ring (IMG_1683) + the numbers */}
      <div className="card" style={{ padding: 20, marginBottom: 18, display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
        <ProgressRing
          value={fund.pct}
          size={128}
          thickness={13}
          color={accent}
          icon={done ? undefined : "ti ti-umbrella"}
          centerText={done ? "100%" : `${Math.round(fund.pct * 100)}%`}
          label="funded"
        />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
            <div>
              <div className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>Saved so far</div>
              <div style={{ fontSize: 30, fontWeight: 800 }}>{currency0(fund.liquidCash)}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>Target · {targetMonths} months</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{currency0(fund.targetAmount)}</div>
            </div>
          </div>

          <div style={{ height: 12, borderRadius: 8, background: "var(--tv-border, rgba(0,0,0,.08))", overflow: "hidden", margin: "14px 0 8px" }}>
            <div style={{ width: `${fund.pct * 100}%`, height: "100%", background: accent, transition: "width .3s" }} />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: accent }}>
              {fund.monthsCovered.toFixed(1)} months covered · {coverageLabel(fund.monthsCovered)}
            </span>
            <span className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>
              {done ? "Target reached 🎉" : `${currency0(fund.gap)} to go`}
            </span>
          </div>
        </div>
      </div>

      {/* Target selector + plan */}
      <div className="card" style={{ padding: 18, marginBottom: 18 }}>
        <div className="page-title" style={{ fontSize: 16, marginBottom: 10 }}>Your target</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
          {TARGETS.map((m) => (
            <button key={m} className={`btn btn-sm ${targetMonths === m ? "btn-primary" : "btn-ghost"}`} onClick={() => setTargetMonths(m)}>
              {m} months
            </button>
          ))}
        </div>
        <div className="page-subtitle" style={{ fontSize: 12.5, marginBottom: 14 }}>
          Based on {currency0(fund.monthlyExpenses)}/mo of real spending from your linked accounts.
        </div>

        {!done && (
          <>
            <div className="page-title" style={{ fontSize: 16, marginBottom: 10 }}>Get there in</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
              {HORIZONS.map((h) => (
                <button key={h} className={`btn btn-sm ${horizon === h ? "btn-primary" : "btn-ghost"}`} onClick={() => setHorizon(h)}>
                  {h} months
                </button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, borderRadius: 10, background: "var(--tv-gold-pale)", border: "1px solid var(--tv-gold, #c9973a)" }}>
              <i className="ti ti-target-arrow" style={{ fontSize: 22, color: "var(--tv-gold, #c9973a)" }} />
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Save {currency0(perMonth)}/month</div>
                <div className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>
                  to reach {targetMonths} months of expenses in {horizon} months.
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Milestones */}
      <div className="card" style={{ padding: 18 }}>
        <div className="page-title" style={{ fontSize: 16, marginBottom: 12 }}>Milestones</div>
        {fund.milestones.map((m, i) => (
          <div key={m.months} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < fund.milestones.length - 1 ? "1px solid var(--tv-border, rgba(0,0,0,.06))" : "none" }}>
            <i
              className={m.reached ? "ti ti-circle-check-filled" : "ti ti-circle"}
              style={{ fontSize: 20, color: m.reached ? "var(--tv-forest, #2f7a5b)" : "var(--tv-muted, #7a8a83)" }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{m.months} month{m.months === 1 ? "" : "s"} of expenses</div>
              <div className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>
                {m.reached ? "Reached" : `${currency0(Math.max(0, m.amount - fund.liquidCash))} to go`}
              </div>
            </div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{currency0(m.amount)}</div>
          </div>
        ))}
      </div>

      <div className="page-subtitle" style={{ fontSize: 12, marginTop: 12 }}>
        Counts easy-access (checking/savings) balances only — investments aren't emergency money.
      </div>
    </div>
  );
}

function Header() {
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="page-title">Emergency fund</div>
      <div className="page-subtitle">A cushion sized to your real expenses — and how to get there.</div>
    </div>
  );
}
