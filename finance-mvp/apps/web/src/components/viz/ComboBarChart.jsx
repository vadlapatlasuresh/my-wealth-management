import React, { useMemo } from "react";

/* ComboBarChart — the premium cash-flow-over-time chart (reference IMG_1699/IMG_1721):
   soft rounded income/expense bars behind a bold NET line. History renders as a solid line;
   future periods render as a dashed projection. Periods are grouped by year with a faint
   divider and an arrow label (←2025  2026→), and a share affordance sits top-right.

   Theme-aware and self-contained SVG. Bars use pastel positive/negative surfaces so the line
   reads as the hero. Works for both quarterly and monthly axes.

   Props:
     periods: [{ label, income, expense, net, projected? }]  oldest→newest
     yearBoundaryIndex: optional index where a new year starts (draws the divider)
     currency: (n)=>string
     height: plot height (default 240)
     onShare: optional () => void   (renders the share icon when provided)
*/
export default function ComboBarChart({
  periods = [],
  yearBoundaryIndex = null,
  currency = (n) => `$${Math.round(n).toLocaleString()}`,
  height = 240,
  onShare,
}) {
  const W = 720;
  const padX = 18;
  const padTop = 16;
  const axisH = 26;
  const plotH = height - axisH;

  const geom = useMemo(() => {
    if (!periods.length) return null;
    const maxUp = Math.max(1, ...periods.map((p) => Math.max(p.income || 0, p.net > 0 ? p.net : 0)));
    const maxDown = Math.max(1, ...periods.map((p) => Math.max(p.expense || 0, p.net < 0 ? -p.net : 0)));
    const range = maxUp + maxDown;
    const zeroY = padTop + (maxUp / range) * plotH; // baseline where net=0
    const slot = (W - padX * 2) / periods.length;
    const barW = Math.min(34, slot * 0.42);

    // Signed axis: +maxUp maps to the top, -maxDown to the bottom, net=0 at zeroY.
    const pts = periods.map((p, i) => {
      const cx = padX + slot * i + slot / 2;
      const netY = zeroY - (p.net >= 0 ? (p.net / maxUp) * (zeroY - padTop) : (p.net / maxDown) * (padTop + plotH - zeroY));
      const incTop = zeroY - (Math.max(0, p.income) / maxUp) * (zeroY - padTop);
      const expBot = zeroY + (Math.max(0, p.expense) / maxDown) * (padTop + plotH - zeroY);
      return { ...p, cx, netY, incTop, expBot, barW };
    });
    return { pts, zeroY, slot, barW, maxUp, maxDown };
  }, [periods]);

  if (!geom) return null;
  const { pts, zeroY } = geom;

  // Split the net line into a solid (history) and dashed (projection) segment.
  const solidPts = pts.filter((p) => !p.projected);
  const firstProjIdx = pts.findIndex((p) => p.projected);
  const dashedPts = firstProjIdx > 0 ? pts.slice(firstProjIdx - 1) : pts.filter((p) => p.projected);

  const linePath = (arr) => arr.map((p, i) => `${i === 0 ? "M" : "L"} ${p.cx.toFixed(1)} ${p.netY.toFixed(1)}`).join(" ");

  const boundaryX =
    yearBoundaryIndex != null && yearBoundaryIndex > 0 && yearBoundaryIndex < pts.length
      ? padX + geom.slot * yearBoundaryIndex
      : null;

  return (
    <div style={{ width: "100%", overflowX: "auto", position: "relative" }}>
      {onShare && (
        <button
          className="icon-btn"
          onClick={onShare}
          title="Share this chart"
          style={{ position: "absolute", top: 0, right: 0, zIndex: 2 }}
        >
          <i className="ti ti-share-2" />
        </button>
      )}
      <svg viewBox={`0 0 ${W} ${height}`} width="100%" role="img" aria-label="Cash flow over time" style={{ display: "block", minWidth: 460 }}>
        {/* Year divider */}
        {boundaryX != null && (
          <line x1={boundaryX} y1={padTop - 6} x2={boundaryX} y2={zeroY + (height - zeroY - axisH)} stroke="var(--tv-border)" strokeWidth="1" />
        )}

        {/* Bars: income above the baseline, expense below */}
        {pts.map((p, i) => (
          <g key={i} opacity={p.projected ? 0.55 : 1}>
            <rect
              x={p.cx - p.barW / 2}
              y={p.incTop}
              width={p.barW}
              height={Math.max(2, zeroY - p.incTop)}
              rx={7}
              fill="var(--tv-positive-bg)"
            />
            <rect
              x={p.cx - p.barW / 2}
              y={zeroY}
              width={p.barW}
              height={Math.max(2, p.expBot - zeroY)}
              rx={7}
              fill="var(--tv-negative-bg)"
            />
          </g>
        ))}

        {/* Net line — solid history, dashed projection */}
        {solidPts.length > 1 && (
          <path d={linePath(solidPts)} fill="none" stroke="var(--tv-text-primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        )}
        {dashedPts.length > 1 && (
          <path d={linePath(dashedPts)} fill="none" stroke="var(--tv-positive)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2 8" />
        )}

        {/* Axis labels */}
        {pts.map((p, i) => (
          <text
            key={`x${i}`}
            x={p.cx}
            y={height - 8}
            textAnchor="middle"
            style={{ fontSize: 12, fontWeight: i === pts.length - 1 ? 700 : 500, fill: i === pts.length - 1 ? "var(--tv-text-primary)" : "var(--tv-text-muted)" }}
          >
            {p.label}
          </text>
        ))}
      </svg>
    </div>
  );
}
