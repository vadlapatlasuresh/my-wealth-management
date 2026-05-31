import React from "react";
import { api } from "../api";

function seriesToPoints(series = [], width = 360, height = 80) {
  if (!series || series.length === 0) return null;
  const values = series.map((s) => (typeof s === 'number' ? s : Number(s.value ?? s.v ?? s)));
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = Math.max(1, max - min);
  return values
    .map((v, i) => {
      const x = Math.round((i / (values.length - 1)) * width);
      const y = Math.round(height - ((v - min) / range) * height);
      return `${x},${y}`;
    })
    .join(" ");
}

export default function NetWorthChart({ total, change30d, series: initialSeries }) {
  const defaultPoints = "0,80 40,65 80,70 120,45 160,50 200,35 240,28 280,20 320,15 360,8";
  const [range, setRange] = React.useState("3M");
  const [displaySeries, setDisplaySeries] = React.useState(initialSeries || []);
  const [loading, setLoading] = React.useState(false);
  const polyRef = React.useRef(null);

  React.useEffect(() => {
    if (!initialSeries || initialSeries.length === 0) return;
    setDisplaySeries(initialSeries);
  }, [initialSeries]);

  React.useEffect(() => {
    let cancelled = false;
    async function fetchRange(r) {
      setLoading(true);
      try {
        const snap = await api.getSnapshot(r);
        if (!cancelled) setDisplaySeries(snap.series || []);
      } catch (e) {
        // on error, keep existing
        console.warn('snapshot range fetch failed', e.message || e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    // if we already have a dense initial series and range is All, skip fetch
    if (initialSeries && initialSeries.length > 6 && range === 'All') return;
    fetchRange(range);
    return () => { cancelled = true; };
  }, [range]);

  const calculated = seriesToPoints(displaySeries);
  const points = calculated || defaultPoints;
  const positive = (change30d ?? 0) >= 0;

  // animate polyline when points change
  React.useEffect(() => {
    const el = polyRef.current;
    if (!el) return;
    try {
      const len = el.getTotalLength();
      el.style.transition = "none";
      el.style.strokeDasharray = `${len}`;
      el.style.strokeDashoffset = `${len}`;
      // trigger layout then animate
      void el.getBoundingClientRect();
      el.style.transition = "stroke-dashoffset 700ms cubic-bezier(.2,.8,.2,1)";
      el.style.strokeDashoffset = "0";
    } catch (e) {
      // getTotalLength may fail in some envs; ignore animation
    }
  }, [points]);

  const formatCurrency = (value) => {
    if (value == null || Number.isNaN(Number(value))) return "—";
    return Number(value).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  };

  return (
    <div className="chart-card">
      <div className="chart-header">
        <h3>Net worth over time</h3>
        <div className="range-chips" role="tablist" aria-label="Chart ranges">
          {["1M", "3M", "1Y", "All"].map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={range === r}
              className={`chip ${range === r ? "active" : ""}`}
              onClick={() => setRange(r)}
              disabled={loading}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <div style={{ padding: 24 }} className="muted">Loading chart…</div>
      ) : (
        <svg viewBox="0 0 360 90" className="line-chart" aria-hidden={false} role="img" aria-label={`Net worth chart over ${range}`}>
          <title>Net worth over time</title>
          <desc>Simple line chart showing net worth trend for the selected range.</desc>
          <defs>
            <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.12" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polyline ref={polyRef} fill="none" stroke="currentColor" strokeWidth="2.5" points={points} />
          <polygon fill="url(#fill)" points={`${points} 360,90 0,90`} />
        </svg>
      )}
      <p className="chart-foot">
        Current {formatCurrency(total)} · 30d change{' '}
        <span className={positive ? "positive" : "negative"}>
          {positive ? "+" : ""}
          {change30d == null ? "—" : Number(change30d).toLocaleString("en-US", { style: "currency", currency: "USD" })}
        </span>
      </p>
    </div>
  );
}
