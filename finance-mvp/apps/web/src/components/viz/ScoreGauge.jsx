import React from "react";

/* ScoreGauge — a semicircular credit-score dial (300–850) drawn as five FICO colour
   bands with a marker at the current score and the number + band label in the middle.
   Designed to read cleaner than the typical app gauge: thick rounded bands, a glowing
   marker, and calm typography.

   Props:
     score, min, max
     bands: [{ min, max, color, label }]
     band:  the active band object (for the center label + marker colour)
     delta: signed points change (shown under the number)
     size:  width in px (default 300)
*/
export default function ScoreGauge({ score, min = 300, max = 850, bands = [], band, delta = 0, size = 300 }) {
  const W = size;
  const stroke = size * 0.075;
  const r = (W - stroke) / 2 - 2;
  const cx = W / 2;
  const cy = r + stroke / 2 + 2;
  const H = cy + stroke; // just the top half + a little

  const clamp = (s) => Math.max(min, Math.min(max, s));
  const angleFor = (s) => Math.PI * (1 - (clamp(s) - min) / (max - min)); // 180°→0°
  const pt = (s, radius = r) => {
    const a = angleFor(s);
    return [cx + radius * Math.cos(a), cy - radius * Math.sin(a)];
  };
  const arcPath = (s0, s1) => {
    const [x0, y0] = pt(s0);
    const [x1, y1] = pt(s1);
    const large = 0; // each band < 180°
    return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
  };

  const [mx, my] = pt(score);
  const markerColor = band?.color || "#fff";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img"
      aria-label={`Credit score ${Math.round(score)}`} style={{ maxWidth: "100%", height: "auto" }}>
      {/* faint full track */}
      <path d={arcPath(min, max)} fill="none" stroke="var(--tv-border, rgba(255,255,255,.12))" strokeWidth={stroke} strokeLinecap="round" opacity="0.5" />
      {/* colour bands */}
      {bands.map((b) => (
        <path key={b.key || b.label} d={arcPath(b.min, Math.min(b.max, max))} fill="none"
          stroke={b.color} strokeWidth={stroke} strokeLinecap="butt" opacity="0.9" />
      ))}
      {/* marker */}
      <circle cx={mx} cy={my} r={stroke * 0.62} fill="var(--tv-bg, #0A0F1A)" stroke={markerColor} strokeWidth={stroke * 0.32} />
      <circle cx={mx} cy={my} r={stroke * 0.22} fill={markerColor} />

      {/* center readout */}
      <text x={cx} y={cy - r * 0.18} textAnchor="middle"
        style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: W * 0.16, fill: "var(--tv-text-primary)" }}>
        {Math.round(score)}
      </text>
      <text x={cx} y={cy - r * 0.18 + W * 0.075} textAnchor="middle"
        style={{ fontSize: W * 0.05, fontWeight: 700, fill: markerColor, letterSpacing: ".04em", textTransform: "uppercase" }}>
        {band?.label || ""}
      </text>
      {delta !== 0 && (
        <text x={cx} y={cy - r * 0.18 + W * 0.125} textAnchor="middle"
          style={{ fontSize: W * 0.042, fill: delta > 0 ? "var(--tv-positive, #3DDC97)" : "var(--tv-negative, #F0776B)" }}>
          {delta > 0 ? "▲" : "▼"} {Math.abs(delta)} pts
        </text>
      )}
      {/* scale ends */}
      <text x={pt(min, r - stroke)[0]} y={cy + stroke * 0.6} textAnchor="middle" style={{ fontSize: W * 0.035, fill: "var(--tv-text-muted)" }}>{min}</text>
      <text x={pt(max, r - stroke)[0]} y={cy + stroke * 0.6} textAnchor="middle" style={{ fontSize: W * 0.035, fill: "var(--tv-text-muted)" }}>{max}</text>
    </svg>
  );
}
