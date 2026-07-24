import { useEffect, useMemo, useState } from "react";
import { currency0 } from "../utils/format";
import { loadCreditProfile, utilizationStatus, SCALE_MIN, SCALE_MAX, BANDS } from "../utils/creditMonitoring";
import { isFlagEnabled, FLAGS } from "../config/featureFlags";
import ScoreGauge from "../components/viz/ScoreGauge";
import ProgressRing from "../components/viz/ProgressRing";

/* CreditScorePage — credit monitoring (Phase 4), behind FLAGS.CREDIT_MONITORING.
   Best-in-class visualization: a banded 300–850 gauge, a 12-month history area chart,
   an impact-first factor breakdown, a utilization ring, and a change timeline. Data comes
   from loadCreditProfile(): a real bureau when FLAGS.CREDIT_MONITORING_LIVE is on, otherwise
   a deterministic, clearly-labeled demo profile. feature_key: individual.creditMonitoring. */

const TONE = {
  good: { color: "var(--tv-positive, #3DDC97)", bg: "var(--tv-positive-bg, rgba(61,220,151,.15))" },
  warn: { color: "var(--tv-warning, #E9C46A)", bg: "var(--tv-warning-bg, rgba(233,196,106,.15))" },
  bad: { color: "var(--tv-negative, #F0776B)", bg: "var(--tv-negative-bg, rgba(240,119,107,.15))" },
};

// A compact 12-month score history area chart.
function HistoryChart({ history }) {
  const W = 560, H = 150, pad = 10;
  const vals = history.map((h) => h.score);
  const min = Math.min(...vals) - 8, max = Math.max(...vals) + 8;
  const x = (i) => pad + (i / (history.length - 1)) * (W - pad * 2);
  const y = (v) => H - pad - ((v - min) / Math.max(1, max - min)) * (H - pad * 2);
  const line = history.map((h, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(h.score).toFixed(1)}`).join(" ");
  const area = `${line} L ${x(history.length - 1).toFixed(1)} ${H - pad} L ${x(0).toFixed(1)} ${H - pad} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id="cs-hist" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--tv-forest-light, #5BB98C)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--tv-forest-light, #5BB98C)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#cs-hist)" />
      <path d={line} fill="none" stroke="var(--tv-forest-light, #5BB98C)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {history.map((h, i) => (
        <circle key={i} cx={x(i)} cy={y(h.score)} r={i === history.length - 1 ? 4 : 0} fill="var(--tv-forest-light, #5BB98C)" />
      ))}
    </svg>
  );
}

export default function CreditScorePage({ user }) {
  const [profile, setProfile] = useState(null); // null = loading
  const userKey = user?.email || user?.id || "demo";

  useEffect(() => {
    let alive = true;
    loadCreditProfile(userKey).then((p) => { if (alive) setProfile(p); });
    return () => { alive = false; };
  }, [userKey]);

  const isDemo = profile?.provider === "demo";
  const util = profile?.utilization;
  const utilStatus = useMemo(() => (util ? utilizationStatus(util.pct) : null), [util]);

  if (!profile) {
    return (
      <div className="page active">
        <div style={{ marginBottom: 18 }}>
          <div className="page-title">Credit score</div>
          <div className="page-subtitle">Track your score and what moves it.</div>
        </div>
        <div className="card" style={{ padding: 28, textAlign: "center" }}>
          <div className="page-subtitle">Loading your credit profile…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="page active">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <div className="page-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            Credit score
            {isDemo && <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", padding: "3px 9px", borderRadius: 999, background: "var(--tv-gold-pale, rgba(230,180,85,.14))", color: "var(--tv-gold, #E6B455)" }}>Demo</span>}
          </div>
          <div className="page-subtitle">Track your score and the factors that move it. Not a lender decision.</div>
        </div>
        <div className="page-subtitle" style={{ margin: 0, fontSize: 12 }}>Updated {new Date(profile.asOf).toLocaleDateString()}</div>
      </div>

      {isDemo && (
        <div className="card" style={{ padding: 14, marginBottom: 18, display: "flex", gap: 10, alignItems: "center", borderLeft: "3px solid var(--tv-gold, #E6B455)" }}>
          <i className="ti ti-flask" style={{ color: "var(--tv-gold, #E6B455)", fontSize: 20 }} />
          <div className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>
            This is <strong>demo data behind a feature flag</strong> — a stable sample so you can see the experience.
            Connect a bureau provider (enable <code>credit_monitoring_live</code>) to show a real score.
          </div>
        </div>
      )}

      {/* Hero: gauge + utilization */}
      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", marginBottom: 18 }}>
        <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <ScoreGauge score={profile.score} min={SCALE_MIN} max={SCALE_MAX} bands={BANDS} band={profile.band} delta={profile.delta} size={300} />
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", justifyContent: "center" }}>
            {BANDS.map((b) => (
              <span key={b.key} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--tv-text-muted)" }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: b.color }} /> {b.label}
              </span>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 20, display: "flex", alignItems: "center", gap: 20 }}>
          <ProgressRing value={util.pct} size={130} thickness={13} color={TONE[utilStatus.tone].color}
            centerText={`${Math.round(util.pct * 100)}%`} label="used" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="page-title" style={{ fontSize: 16, marginBottom: 4 }}>Credit utilization</div>
            <div style={{ display: "inline-flex", padding: "3px 10px", borderRadius: 999, background: TONE[utilStatus.tone].bg, color: TONE[utilStatus.tone].color, fontSize: 12, fontWeight: 700, marginBottom: 10 }}>{utilStatus.status}</div>
            <div className="page-subtitle" style={{ margin: 0, fontSize: 13 }}>{currency0(util.balance)} of {currency0(util.limit)} available credit used.</div>
            <div className="page-subtitle" style={{ margin: "6px 0 0", fontSize: 12 }}>Keeping this under 30% helps your score most.</div>
          </div>
        </div>
      </div>

      {/* History */}
      <div className="card" style={{ padding: 18, marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <div className="page-title" style={{ fontSize: 16, margin: 0 }}>Score history · 12 months</div>
          <div className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>
            {profile.delta >= 0 ? "+" : "−"}{Math.abs(profile.delta)} pts vs last month
          </div>
        </div>
        <HistoryChart history={profile.history} />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          {profile.history.map((h, i) => (
            <span key={i} className="page-subtitle" style={{ margin: 0, fontSize: 10.5 }}>{h.month}</span>
          ))}
        </div>
      </div>

      {/* Factor breakdown */}
      <div className="card" style={{ padding: 18, marginBottom: 18 }}>
        <div className="page-title" style={{ fontSize: 16, marginBottom: 4 }}>What's affecting your score</div>
        <div className="page-subtitle" style={{ fontSize: 12.5, marginBottom: 12 }}>Ordered by how much each factor weighs.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {profile.factors.map((f) => {
            const t = TONE[f.tone] || TONE.warn;
            return (
              <div key={f.key} style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{f.label}</span>
                    <span className="page-subtitle" style={{ margin: 0, fontSize: 11.5 }}>{Math.round(f.weight * 100)}% weight</span>
                    <span style={{ marginLeft: "auto", display: "inline-flex", padding: "2px 9px", borderRadius: 999, background: t.bg, color: t.color, fontSize: 11.5, fontWeight: 700 }}>{f.status}</span>
                    <span className="page-subtitle" style={{ margin: 0, fontSize: 11.5 }}>{f.impact} impact</span>
                  </div>
                  <div style={{ height: 7, borderRadius: 5, background: "var(--tv-neutral-bg, rgba(255,255,255,.06))", overflow: "hidden" }}>
                    <div style={{ width: `${Math.max(4, f.sub)}%`, height: "100%", background: t.color }} />
                  </div>
                  <div className="page-subtitle" style={{ margin: "5px 0 0", fontSize: 12 }}>{f.detail}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Change timeline */}
      {profile.changes?.length > 0 && (
        <div className="card" style={{ padding: 18, marginBottom: 18 }}>
          <div className="page-title" style={{ fontSize: 16, marginBottom: 12 }}>Recent changes</div>
          {profile.changes.map((c, i) => {
            const up = c.direction === "up";
            const color = up ? "var(--tv-positive, #3DDC97)" : "var(--tv-negative, #F0776B)";
            return (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 0", borderBottom: i < profile.changes.length - 1 ? "1px solid var(--tv-border-light)" : "none" }}>
                <span style={{ display: "inline-flex", width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center", background: "var(--tv-neutral-bg, rgba(255,255,255,.05))", color, flex: "0 0 auto" }}>
                  <i className={c.type === "inquiry" ? "ti ti-search" : c.type === "utilization" ? "ti ti-credit-card" : up ? "ti ti-arrow-up-right" : "ti ti-arrow-down-right"} style={{ fontSize: 17 }} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{c.title}</div>
                  <div className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>{c.detail}</div>
                </div>
                <div className="page-subtitle" style={{ margin: 0, fontSize: 12 }}>{new Date(c.date).toLocaleDateString()}</div>
              </div>
            );
          })}
        </div>
      )}

      <div className="page-subtitle" style={{ fontSize: 12 }}>
        Educational information, not a credit decision or financial advice. Scores are illustrative
        {isFlagEnabled(FLAGS.CREDIT_MONITORING_LIVE) ? "" : " (demo provider)"} and may differ from any lender's.
      </div>
    </div>
  );
}
