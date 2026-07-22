import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { buildRecommendations, PRIORITY } from "../utils/recommendations";

/* CoachPage — the proactive layer (Phase 3). Ranks "what to do next" by composing every
   signal the app computes (anomalies, cash flow, emergency gap, health factors, spending
   movers, debt) and merges the server's AI insights as attributed opportunities.
   Money figures come from our own math, never a model. feature_key: individual.aiProactive. */

const BANDS = [
  { p: PRIORITY.URGENT, label: "Do this now", sub: "Costs you money if ignored" },
  { p: PRIORITY.IMPORTANT, label: "Worth doing soon", sub: "Moves your score and your margin" },
  { p: PRIORITY.OPPORTUNITY, label: "Opportunities", sub: "Easy wins when you have a minute" },
];

function toneColor(tone) {
  return tone === "red" ? "var(--tv-red, #c0392b)"
    : tone === "amber" ? "var(--tv-gold, #c9973a)"
    : "var(--tv-forest, #2f7a5b)";
}
function toneBg(tone) {
  return tone === "red" ? "rgba(192,57,43,.10)"
    : tone === "amber" ? "rgba(201,151,58,.12)"
    : "rgba(47,122,91,.10)";
}

export default function CoachPage({ accounts = [], transactions = [], snapshot = null, insights = [] }) {
  const navigate = useNavigate();
  const recs = useMemo(
    () => buildRecommendations({ accounts, transactions, snapshot, insights }),
    [accounts, transactions, snapshot, insights]
  );

  const urgentCount = recs.filter((r) => r.priority === PRIORITY.URGENT).length;
  const linked = accounts.length > 0 || transactions.length > 0;

  return (
    <div className="page">
      <div style={{ marginBottom: 18 }}>
        <div className="page-title">Your money coach</div>
        <div className="page-subtitle">
          What to do next, ranked — built from your real numbers, not guesses.
        </div>
      </div>

      {!linked && (
        <div className="card" style={{ padding: 20, marginBottom: 18, display: "flex", gap: 12, alignItems: "center" }}>
          <i className="ti ti-plug-connected" style={{ fontSize: 26, color: "var(--tv-forest, #2f7a5b)" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Link an account for personalized guidance</div>
            <div className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>
              Until then we'll only show general opportunities — never made-up numbers.
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => navigate("/accounts")}>Link</button>
        </div>
      )}

      {linked && (
        <div className="card" style={{ padding: 16, marginBottom: 18, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ display: "inline-flex", width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 12, background: urgentCount ? "rgba(192,57,43,.10)" : "rgba(47,122,91,.10)", color: urgentCount ? "var(--tv-red, #c0392b)" : "var(--tv-forest, #2f7a5b)", flex: "0 0 auto" }}>
            <i className={urgentCount ? "ti ti-urgent" : "ti ti-circle-check"} style={{ fontSize: 21 }} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              {urgentCount ? `${urgentCount} thing${urgentCount === 1 ? "" : "s"} need${urgentCount === 1 ? "s" : ""} you now` : "Nothing urgent right now"}
            </div>
            <div className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>
              {recs.length} recommendation{recs.length === 1 ? "" : "s"} in total.
            </div>
          </div>
        </div>
      )}

      {BANDS.map((band) => {
        const items = recs.filter((r) => r.priority === band.p);
        if (!items.length) return null;
        return (
          <div key={band.p} style={{ marginBottom: 18 }}>
            <div style={{ marginBottom: 8 }}>
              <div className="page-title" style={{ fontSize: 16, margin: 0 }}>{band.label}</div>
              <div className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>{band.sub}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {items.map((r) => (
                <div
                  key={r.id}
                  className="card"
                  style={{ padding: 14, display: "flex", alignItems: "center", gap: 12, borderLeft: `3px solid ${toneColor(r.tone)}` }}
                >
                  <span style={{ display: "inline-flex", width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 10, background: toneBg(r.tone), color: toneColor(r.tone), flex: "0 0 auto" }}>
                    <i className={r.icon} style={{ fontSize: 19 }} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {r.title}
                      {r.source === "ai" && (
                        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", padding: "2px 6px", borderRadius: 5, background: "rgba(201,151,58,.16)", color: "var(--tv-gold, #c9973a)" }}>
                          AI
                        </span>
                      )}
                    </div>
                    {r.detail && (
                      <div className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>{r.detail}</div>
                    )}
                  </div>
                  <button className="btn btn-secondary btn-sm" style={{ flex: "0 0 auto" }} onClick={() => navigate(r.route)}>
                    {r.actionLabel}
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div className="page-subtitle" style={{ fontSize: 12, marginTop: 4 }}>
        Amounts are calculated from your linked accounts. Items marked <strong>AI</strong> are generated
        suggestions — educational information, not personalized financial advice.
      </div>
    </div>
  );
}
