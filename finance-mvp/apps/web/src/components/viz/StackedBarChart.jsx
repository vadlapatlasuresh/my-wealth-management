import React from "react";

/* StackedBarChart — spending-over-time in the "Wrapped" style (reference IMG_1678):
   one rounded vertical bar per period, segmented by category with the canonical
   category palette. Also used for grouped income-vs-spend when `series` has 1-2 keys.

   Props:
     periods:  [{ label, segments: [{ key, value, color }] }]
     height:   chart plot height in px (default 200)
     currency: (n) => string  formatter for tooltips
     onBar:    optional (label) => void
     highlightLabel: optional label of the period to emphasize
*/
export default function StackedBarChart({
  periods = [],
  height = 200,
  currency = (n) => `${Math.round(n)}`,
  onBar,
  highlightLabel = null,
}) {
  const totals = periods.map((p) => (p.segments || []).reduce((s, seg) => s + Math.max(0, Number(seg.value) || 0), 0));
  const max = Math.max(1, ...totals);

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: height + 24, padding: "8px 2px" }}>
      {periods.map((p, pi) => {
        const total = totals[pi];
        const barH = Math.round((total / max) * height);
        const dim = highlightLabel && highlightLabel !== p.label;
        return (
          <div
            key={p.label + pi}
            onClick={onBar ? () => onBar(p.label) : undefined}
            style={{
              flex: 1, minWidth: 0, display: "flex", flexDirection: "column",
              alignItems: "center", gap: 8, cursor: onBar ? "pointer" : "default",
              opacity: dim ? 0.4 : 1, transition: "opacity .18s ease",
            }}
          >
            <div
              style={{
                width: "100%", maxWidth: 46, height: Math.max(barH, 4),
                display: "flex", flexDirection: "column-reverse", // first segment at bottom
                borderRadius: 12, overflow: "hidden",
                boxShadow: "0 6px 18px rgba(0,0,0,.28)",
              }}
              title={`${p.label} · ${currency(total)}`}
            >
              {(p.segments || []).filter((s) => Number(s.value) > 0).map((seg, si, arr) => {
                const h = total > 0 ? (Math.max(0, Number(seg.value)) / total) * 100 : 0;
                return (
                  <div
                    key={seg.key + si}
                    style={{ height: `${h}%`, background: seg.color, minHeight: h > 0 ? 2 : 0 }}
                    title={`${seg.key} · ${currency(seg.value)}`}
                  />
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: "var(--tv-text-muted)", fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase" }}>
              {p.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
