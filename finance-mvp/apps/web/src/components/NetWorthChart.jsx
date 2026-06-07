import React, { useState, useRef, useMemo, useEffect } from "react";

/*
 * Presentational net-worth area chart. The parent (HomePage) owns the range
 * selector and fetches the series, then passes { total, change30d, series }.
 *
 * Features: smooth curve, gradient fill, baseline gridlines, animated draw,
 * a glowing last-point marker, and an interactive hover crosshair + tooltip.
 */

const W = 720, H = 260, PADX = 16, PAD_TOP = 36, PAD_BOTTOM = 26;
const PLOT_W = W - PADX * 2;
const PLOT_H = H - PAD_TOP - PAD_BOTTOM;

const money0 = (v) =>
  v == null || Number.isNaN(Number(v)) ? "—"
    : Number(v).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/* Catmull-Rom → cubic-bezier smoothing for a premium curve. */
function smoothPath(pts) {
  if (pts.length < 2) return pts.length ? `M ${pts[0].x},${pts[0].y}` : "";
  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

export default function NetWorthChart({ total, change30d, series = [] }) {
  const wrapRef = useRef(null);
  const lineRef = useRef(null);
  const [hover, setHover] = useState(null); // { idx, leftPct }

  const positive = (change30d ?? 0) >= 0;
  const accent = positive ? "var(--tv-forest-light)" : "var(--tv-negative)";

  const values = useMemo(
    () => (series || []).map((s) => (typeof s === "number" ? s : Number(s?.value ?? s?.v ?? s))).filter((n) => !Number.isNaN(n)),
    [series]
  );

  const { pts, areaPath, linePath, min, max } = useMemo(() => {
    if (values.length < 2) return { pts: [], areaPath: "", linePath: "", min: 0, max: 0 };
    const mn = Math.min(...values), mx = Math.max(...values);
    const range = Math.max(1, mx - mn);
    const n = values.length;
    const p = values.map((v, i) => ({
      x: PADX + (i / (n - 1)) * PLOT_W,
      y: PAD_TOP + (1 - (v - mn) / range) * PLOT_H,
      v,
    }));
    const line = smoothPath(p);
    const area = `${line} L ${p[n - 1].x},${PAD_TOP + PLOT_H} L ${p[0].x},${PAD_TOP + PLOT_H} Z`;
    return { pts: p, areaPath: area, linePath: line, min: mn, max: mx };
  }, [values]);

  // Animated line draw whenever the path changes.
  useEffect(() => {
    const el = lineRef.current;
    if (!el || !linePath) return;
    try {
      const len = el.getTotalLength();
      el.style.transition = "none";
      el.style.strokeDasharray = `${len}`;
      el.style.strokeDashoffset = `${len}`;
      void el.getBoundingClientRect();
      el.style.transition = "stroke-dashoffset 800ms cubic-bezier(.2,.8,.2,1)";
      el.style.strokeDashoffset = "0";
    } catch { /* getTotalLength unsupported — skip animation */ }
  }, [linePath]);

  function onMove(e) {
    if (!pts.length || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const idx = Math.round(ratio * (pts.length - 1));
    setHover({ idx, leftPct: (pts[idx].x / W) * 100 });
  }

  const hoverPt = hover ? pts[hover.idx] : null;
  const last = pts[pts.length - 1];

  if (values.length < 2) {
    return (
      <div style={{ padding: "40px 12px", textAlign: "center", color: "var(--tv-text-muted)" }}>
        <i className="ti ti-chart-line" style={{ fontSize: 28, opacity: 0.5 }}></i>
        <p style={{ marginTop: 8, fontSize: 13 }}>Not enough history yet to chart your net worth.</p>
      </div>
    );
  }

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%" }}
      onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      {/* In-chart value overlay */}
      <div style={{ position: "absolute", top: 4, left: 4, pointerEvents: "none" }}>
        <div style={{ fontSize: 11, color: "var(--tv-text-muted)", letterSpacing: ".04em", textTransform: "uppercase" }}>
          {hoverPt ? "Selected" : "Current net worth"}
        </div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 26, color: "var(--tv-text-primary)", lineHeight: 1.1 }}>
          {money0(hoverPt ? hoverPt.v : total)}
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: positive ? "var(--tv-positive)" : "var(--tv-negative)", marginTop: 2 }}>
          <i className={`ti ${positive ? "ti-arrow-up-right" : "ti-arrow-down-right"}`}></i>{" "}
          {positive ? "+" : ""}{money0(change30d)} · 30d
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", overflow: "visible" }}
        role="img" aria-label="Net worth over time" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="nw-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.28" />
            <stop offset="60%" stopColor={accent} stopOpacity="0.08" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
          <linearGradient id="nw-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--tv-forest)" />
            <stop offset="100%" stopColor={accent} />
          </linearGradient>
          <filter id="nw-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Horizontal gridlines + right-edge value labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
          const y = PAD_TOP + t * PLOT_H;
          const val = max - t * (max - min);
          return (
            <g key={i}>
              <line x1={PADX} y1={y} x2={W - PADX} y2={y} stroke="var(--tv-border-light)" strokeWidth="1" strokeDasharray="2 4" />
              <text x={W - PADX} y={y - 3} textAnchor="end" fontSize="10" fill="var(--tv-text-muted)">{money0(val)}</text>
            </g>
          );
        })}

        <path d={areaPath} fill="url(#nw-fill)" />
        <path ref={lineRef} d={linePath} fill="none" stroke="url(#nw-line)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

        {/* Last-point glowing marker */}
        {last && (
          <>
            <circle cx={last.x} cy={last.y} r="5.5" fill={accent} filter="url(#nw-glow)" />
            <circle cx={last.x} cy={last.y} r="3" fill="var(--tv-card)" stroke={accent} strokeWidth="2" />
          </>
        )}

        {/* Hover crosshair + dot */}
        {hoverPt && (
          <>
            <line x1={hoverPt.x} y1={PAD_TOP} x2={hoverPt.x} y2={PAD_TOP + PLOT_H} stroke="var(--tv-text-muted)" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
            <circle cx={hoverPt.x} cy={hoverPt.y} r="5" fill="var(--tv-card)" stroke={accent} strokeWidth="2.5" />
          </>
        )}
      </svg>

      {/* HTML tooltip following the hovered point */}
      {hoverPt && (
        <div style={{
          position: "absolute", top: 30, left: `${hover.leftPct}%`, transform: "translateX(-50%)",
          background: "var(--tv-text-primary)", color: "var(--tv-text-inverse)", padding: "5px 9px",
          borderRadius: 8, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", pointerEvents: "none",
          boxShadow: "var(--shadow-md)", zIndex: 5,
        }}>
          {money0(hoverPt.v)}
        </div>
      )}
    </div>
  );
}
