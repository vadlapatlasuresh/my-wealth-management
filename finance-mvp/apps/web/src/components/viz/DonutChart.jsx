import React from "react";

/* DonutChart — the signature category-breakdown ring used app-wide.
   Layout reference: icici.png / the Outflow-Categories screenshots — a donut with a
   bold total in the middle, meant to sit beside a categorized list.

   Props:
     data:        [{ label, value, color }]  (colors should come from categoryColor())
     size:        outer diameter in px (default 200)
     thickness:   ring thickness in px (default 26)
     centerLabel: small caption under the center value (e.g. "Total Expense")
     centerValue: big value string in the middle (e.g. "$80,089")
     onSlice:     optional (label) => void when a slice is clicked
     activeLabel: optional label to emphasize (others dim)
*/
export default function DonutChart({
  data = [],
  size = 200,
  thickness = 26,
  centerLabel,
  centerValue,
  onSlice,
  activeLabel = null,
}) {
  const clean = data.filter((d) => Number(d.value) > 0);
  const total = clean.reduce((s, d) => s + Number(d.value), 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  const gap = clean.length > 1 ? 2 : 0; // tiny visual gap between slices

  let offset = 0;
  const arcs = clean.map((d) => {
    const frac = total > 0 ? Number(d.value) / total : 0;
    const len = Math.max(0, frac * c - gap);
    const arc = {
      ...d,
      dash: `${len} ${c - len}`,
      dashoffset: -offset,
      dim: activeLabel && activeLabel !== d.label,
    };
    offset += frac * c;
    return arc;
  });

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      role="img"
      aria-label={centerLabel || "Breakdown"}
      style={{ maxWidth: "100%", height: "auto" }}
    >
      {/* Track */}
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--tv-border, rgba(255,255,255,.12))" strokeWidth={thickness} opacity="0.5" />
      <g transform={`rotate(-90 ${cx} ${cx})`}>
        {arcs.map((a, i) => (
          <circle
            key={a.label + i}
            cx={cx}
            cy={cx}
            r={r}
            fill="none"
            stroke={a.color}
            strokeWidth={thickness}
            strokeDasharray={a.dash}
            strokeDashoffset={a.dashoffset}
            strokeLinecap="butt"
            style={{
              cursor: onSlice ? "pointer" : "default",
              opacity: a.dim ? 0.28 : 1,
              transition: "opacity .18s ease, stroke-width .18s ease",
            }}
            onClick={onSlice ? () => onSlice(a.label) : undefined}
          >
            <title>{`${a.label} · ${Math.round((a.value / total) * 100)}%`}</title>
          </circle>
        ))}
      </g>
      {(centerValue != null || centerLabel) && (
        <g>
          {centerValue != null && (
            <text x={cx} y={cx - (centerLabel ? 2 : -6)} textAnchor="middle" dominantBaseline="middle"
              style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: size * 0.14, fill: "var(--tv-text-primary)" }}>
              {centerValue}
            </text>
          )}
          {centerLabel && (
            <text x={cx} y={cx + size * 0.11} textAnchor="middle" dominantBaseline="middle"
              style={{ fontSize: size * 0.062, fill: "var(--tv-text-muted)", letterSpacing: ".02em" }}>
              {centerLabel}
            </text>
          )}
        </g>
      )}
    </svg>
  );
}
