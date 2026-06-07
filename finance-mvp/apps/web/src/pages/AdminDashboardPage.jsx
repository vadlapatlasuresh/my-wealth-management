import { useState, useEffect } from "react";
import { api, isCareAgent } from "../api";

function Kpi({ label, value, sub, tone }) {
  const color = tone === "bad" ? "var(--tv-negative)" : tone === "good" ? "var(--tv-positive)" : "var(--tv-text-primary)";
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ color }}>{value}</div>
      {sub && <div className="kpi-delta" style={{ color: "var(--tv-text-muted)" }}>{sub}</div>}
    </div>
  );
}

/* Tiny inline bar sparkline for daily volume (no chart lib). */
function Sparkbars({ data }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 64 }}>
      {data.map((d) => (
        <div key={d.date} title={`${d.date}: ${d.count}`}
          style={{ flex: 1, minWidth: 2, height: `${(d.count / max) * 100}%`,
            background: "var(--tv-forest-light)", borderRadius: 2, opacity: d.count ? 1 : 0.25 }} />
      ))}
    </div>
  );
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState(null);
  const [days, setDays] = useState(30);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const admin = isCareAgent();

  useEffect(() => {
    if (!admin) { setLoading(false); return; }
    let active = true;
    setLoading(true); setError("");
    api.getAuditStats(days)
      .then((s) => { if (active) setStats(s); })
      .catch((e) => { if (active) setError(e?.message || "Couldn't load analytics."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [days, admin]);

  if (!admin) {
    return (
      <div className="page active">
        <div className="card"><div className="empty-state">
          <i className="ti ti-lock"></i>
          <p>This dashboard is for administrators and customer-care agents only.</p>
        </div></div>
      </div>
    );
  }

  const pct = (x) => `${((Number(x) || 0) * 100).toFixed(1)}%`;
  const errTone = stats && stats.errorRate > 0.05 ? "bad" : "good";

  return (
    <div className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">Admin · Analytics</div>
          <div className="page-subtitle">Operational KPIs from the audit event stream.</div>
        </div>
        <div className="page-actions">
          <select className="form-select" value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: 130 }}>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
      </div>

      {error && <div className="card" style={{ borderLeft: "4px solid var(--tv-negative)", marginBottom: 12 }}>
        <span style={{ color: "var(--tv-negative)" }}>{error}</span></div>}

      {loading ? (
        <div className="card"><div className="empty-state"><i className="ti ti-loader"></i><p>Loading…</p></div></div>
      ) : !stats ? null : (
        <>
          <div className="kpi-grid" style={{ marginBottom: 16 }}>
            <Kpi label="Total events" value={Number(stats.totalEvents).toLocaleString()} sub={`last ${stats.windowDays}d`} />
            <Kpi label="Active users" value={stats.activeUsers} />
            <Kpi label="Error rate" value={pct(stats.errorRate)} tone={errTone} sub={`${stats.failureEvents} failures`} />
            <Kpi label="Logins" value={stats.logins?.success ?? 0} sub={`${stats.logins?.failure ?? 0} failed · ${stats.signups} signups`} />
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="section-title">Daily activity</div>
            {stats.dailyVolume?.length ? <Sparkbars data={stats.dailyVolume} /> :
              <div className="empty-state"><p>No activity in this window.</p></div>}
          </div>

          <div className="grid-2">
            <div className="card">
              <div className="section-title">Top actions</div>
              {(stats.topActions || []).map((a) => (
                <div className="list-item" key={a.key}>
                  <div className="item-main"><div className="item-name" style={{ fontSize: 13 }}>{a.key}</div></div>
                  <div className="item-right"><span className="badge badge-gray">{a.count}</span></div>
                </div>
              ))}
              {!stats.topActions?.length && <div className="empty-state"><p>No data.</p></div>}
            </div>

            <div className="card">
              <div className="section-title">By service</div>
              {(stats.byService || []).map((s) => (
                <div className="list-item" key={s.key}>
                  <div className="item-main"><div className="item-name" style={{ fontSize: 13 }}>{s.key}</div></div>
                  <div className="item-right"><span className="badge badge-gray">{s.count}</span></div>
                </div>
              ))}
              {!stats.byService?.length && <div className="empty-state"><p>No data.</p></div>}
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <div className="section-title">Recent failures</div>
            {(stats.recentFailures || []).length ? (stats.recentFailures).map((f, i) => (
              <div className="list-item" key={i}>
                <div className="item-icon icon-red"><i className="ti ti-alert-triangle"></i></div>
                <div className="item-main">
                  <div className="item-name" style={{ fontSize: 13 }}>{f.action}</div>
                  <div className="item-sub">{f.at ? new Date(f.at).toLocaleString() : ""}{f.userId ? ` · user ${f.userId}` : ""}</div>
                </div>
                <div className="item-right"><span className="badge badge-red">{f.outcome}{f.status ? ` ${f.status}` : ""}</span></div>
              </div>
            )) : <div className="empty-state"><i className="ti ti-circle-check"></i><p>No failures in this window.</p></div>}
          </div>
        </>
      )}
    </div>
  );
}
