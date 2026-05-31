import React from "react";

function normalizeSeries(series) {
  if (!series) return [];
  // accept [number,...] or [{ts,value},...]
  if (series.length === 0) return [];
  if (typeof series[0] === "number") return series.map((v) => ({ value: v }));
  return series.map((s) => ({ ts: s.ts, value: s.value ?? s.v ?? 0 }));
}

function toPointsArray(norm, width = 80, height = 28) {
  if (!norm || norm.length === 0) return [];
  const values = norm.map((p) => Number(p.value));
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = Math.max(1e-6, max - min);
  return norm.map((p, i) => {
    const x = (i / (norm.length - 1)) * width;
    const y = height - ((Number(p.value) - min) / range) * height;
    return { x, y };
  });
}

function catmullRom2bezier(points, tension = 0.5) {
  if (!points || points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x},${points[0].y}`;
  if (points.length === 2) return `M ${points[0].x},${points[0].y} L ${points[1].x},${points[1].y}`;
  let d = `M ${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i === 0 ? points[0] : points[i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i + 2 < points.length ? points[i + 2] : p2;
    const c1x = p1.x + ((p2.x - p0.x) / 6) * tension;
    const c1y = p1.y + ((p2.y - p0.y) / 6) * tension;
    const c2x = p2.x - ((p3.x - p1.x) / 6) * tension;
    const c2y = p2.y - ((p3.y - p1.y) / 6) * tension;
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return d;
}

export default function Sparkline({ series = [], stroke = "currentColor", width = 80, height = 28 }) {
  const norm = normalizeSeries(series);
  const pts = toPointsArray(norm, width, height);
  const pathD = catmullRom2bezier(pts, 0.5);

  if (!pathD) {
    // fallback to simple line
    const fallbackPoints = pts.map((p) => `${p.x},${p.y}`).join(" ") || "0,28 80,14";
    return (
      <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden>
        <polyline fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" points={fallbackPoints} />
      </svg>
    );
  }

  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden>
      <path d={pathD} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
