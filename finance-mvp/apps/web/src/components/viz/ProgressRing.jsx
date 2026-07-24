import React from "react";

/* ProgressRing — circular progress indicator (reference IMG_1683: the "Groceries
   $400 / Remaining $200" ring and the "finance target 86%" dial). A colored arc on
   a subtle track, with an icon or value in the center.

   Props:
     value:     0..1 (fraction complete) OR pass `pct` (0..100)
     pct:       alternative to value, 0..100
     size:      diameter px (default 120)
     thickness: stroke px (default 12)
     color:     arc color (default forest-green var)
     icon:      optional Tabler icon class (e.g. "ti ti-carrot") shown in center
     label:     small caption under the center content
     children:  optional custom center content (overrides icon/pct text)
*/
export default function ProgressRing({
  value,
  pct,
  size = 120,
  thickness = 12,
  color = "var(--tv-positive, #3DDC97)",
  track = "var(--tv-border, rgba(255,255,255,.14))",
  icon,
  label,
  centerText,
  children,
}) {
  const frac = Math.max(0, Math.min(1, value != null ? value : (pct != null ? pct / 100 : 0)));
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  const dash = frac * c;

  const showPct = centerText == null && !children && !icon;

  return (
    <div style={{ position: "relative", width: size, height: size, display: "inline-flex", flex: "0 0 auto" }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={track} strokeWidth={thickness} />
        <circle
          cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={thickness}
          strokeLinecap="round" strokeDasharray={`${dash} ${c - dash}`}
          style={{ transition: "stroke-dasharray .5s cubic-bezier(.4,0,.2,1)" }}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 2, textAlign: "center",
      }}>
        {children ? children : (
          <>
            {icon && <i className={icon} style={{ fontSize: size * 0.26, color }} />}
            {centerText != null && (
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: size * 0.2, color: "var(--tv-text-primary)" }}>
                {centerText}
              </span>
            )}
            {showPct && (
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: size * 0.22, color: "var(--tv-text-primary)" }}>
                {Math.round(frac * 100)}%
              </span>
            )}
            {label && <span style={{ fontSize: size * 0.09, color: "var(--tv-text-muted)" }}>{label}</span>}
          </>
        )}
      </div>
    </div>
  );
}
