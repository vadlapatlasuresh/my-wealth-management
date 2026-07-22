import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { detectAlerts } from "../utils/alerts";

/* AlertsPage — smart alerts / anomaly detection (Phase 2). Surfaces low balances, possible
   duplicate charges, unusually large charges and recurring price hikes, detected client-side
   from linked accounts + transactions (utils/alerts.js). feature_key: individual.smartAlerts. */

function toneColor(tone) {
  return tone === "red" ? "var(--tv-red, #c0392b)" : tone === "amber" ? "var(--tv-gold, #c9973a)" : "var(--tv-forest, #2f7a5b)";
}
function toneBg(tone) {
  return tone === "red" ? "rgba(192,57,43,.10)" : tone === "amber" ? "rgba(201,151,58,.12)" : "rgba(47,122,91,.10)";
}

export default function AlertsPage({ accounts = [], transactions = [] }) {
  const navigate = useNavigate();
  const alerts = useMemo(() => detectAlerts({ accounts, transactions }), [accounts, transactions]);

  const noData = !accounts.length && !transactions.length;
  const highCount = alerts.filter((a) => a.severity === "high").length;

  return (
    <div className="page active">
      <div style={{ marginBottom: 18 }}>
        <div className="page-title">Smart alerts</div>
        <div className="page-subtitle">Unusual activity we spotted in your accounts — before it costs you.</div>
      </div>

      {noData ? (
        <div className="card" style={{ padding: 28, textAlign: "center" }}>
          <i className="ti ti-bell" style={{ fontSize: 34, color: "var(--tv-forest, #2f7a5b)" }} />
          <div className="page-title" style={{ fontSize: 18, marginTop: 10 }}>Link accounts to enable alerts</div>
          <div className="page-subtitle" style={{ marginBottom: 16 }}>
            We watch for low balances, duplicate charges, unusual spending and price hikes automatically.
          </div>
          <button className="btn btn-primary" onClick={() => navigate("/accounts")}>
            <i className="ti ti-plus" /> Link accounts
          </button>
        </div>
      ) : alerts.length === 0 ? (
        <div className="card" style={{ padding: 28, textAlign: "center" }}>
          <i className="ti ti-circle-check" style={{ fontSize: 34, color: "var(--tv-forest, #2f7a5b)" }} />
          <div className="page-title" style={{ fontSize: 18, marginTop: 10 }}>All clear</div>
          <div className="page-subtitle">Nothing unusual right now. We'll flag anything that stands out.</div>
        </div>
      ) : (
        <>
          <div className="page-subtitle" style={{ marginBottom: 12 }}>
            {alerts.length} alert{alerts.length === 1 ? "" : "s"}{highCount ? ` · ${highCount} need${highCount === 1 ? "s" : ""} attention` : ""}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {alerts.map((a) => (
              <div
                key={a.key}
                className="card"
                style={{ padding: 14, display: "flex", alignItems: "center", gap: 12, cursor: "pointer", borderLeft: `3px solid ${toneColor(a.tone)}` }}
                onClick={() => navigate(a.route || "/transactions")}
              >
                <span style={{ display: "inline-flex", width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 10, background: toneBg(a.tone), color: toneColor(a.tone), flex: "0 0 auto" }}>
                  <i className={a.icon} style={{ fontSize: 19 }} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600 }}>{a.title}</div>
                  <div className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>{a.detail}</div>
                </div>
                <i className="ti ti-chevron-right" style={{ color: "var(--tv-muted, #7a8a83)", flex: "0 0 auto" }} />
              </div>
            ))}
          </div>
          <div className="page-subtitle" style={{ fontSize: 12, marginTop: 12 }}>
            Detected from your recent transactions and balances. Alerts update as new activity syncs.
          </div>
        </>
      )}
    </div>
  );
}
