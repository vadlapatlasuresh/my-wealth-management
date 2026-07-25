import React, { useMemo, useState } from "react";

/* SankeyChart — the signature Cash-Flow visualization (reference: Monarch/Copilot cash-flow
   Sankey, IMG_1737/IMG_1738/IMG_1691). Income sources on the LEFT flow through an aggregate
   "Income" hub in the CENTER and branch out to expense categories on the RIGHT.

   Pastel, theme-aware, and self-contained SVG (no dependency): flow ribbons are drawn as
   filled cubic-bezier bands tinted by their category color, each node is a rounded bar with a
   thematic emoji, its $ amount and % share. Hovering a node highlights its ribbons.

   Props:
     model:    { nodes:[{id,label,value,side,color}], links:[{source,target,value}] }
                 side ∈ 'in' | 'hub' | 'out'   (build with utils/cashflow.cashFlowSankey)
     height:   svg height in px (default 460)
     currency: (n)=>string formatter
     iconFor:  (label)=>string emoji (optional)
*/

const NODE_W = 13;
const PAD_Y = 10;
const GAP = 16; // vertical gap between stacked nodes on a side

export default function SankeyChart({
  model,
  height = 460,
  currency = (n) => `$${Math.round(n).toLocaleString()}`,
  iconFor = () => "",
  width = 900,
}) {
  const [hover, setHover] = useState(null); // hovered node id

  const layout = useMemo(() => buildLayout(model, width, height), [model, width, height]);
  if (!layout) return null;

  const { columns, links, totalIn } = layout;
  const share = (v) => (totalIn > 0 ? Math.round((v / totalIn) * 100) : 0);

  const isLit = (l) => !hover || l.source === hover || l.target === hover;

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        role="img"
        aria-label="Cash flow Sankey diagram"
        style={{ display: "block", minWidth: 520 }}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Flow ribbons behind the nodes */}
        <g>
          {links.map((l, i) => (
            <path
              key={i}
              d={l.path}
              fill={l.color}
              opacity={isLit(l) ? 0.34 : 0.08}
              style={{ transition: "opacity .18s ease" }}
            />
          ))}
        </g>

        {/* Nodes + labels, column by column */}
        {columns.map((col) =>
          col.map((n) => {
            const lit = !hover || hover === n.id || links.some((l) => (l.source === n.id || l.target === n.id) && (l.source === hover || l.target === hover));
            const labelLeft = n.side === "out"; // right column labels sit to the LEFT of the bar
            const tx = labelLeft ? n.x - 10 : n.x + NODE_W + 10;
            const anchor = labelLeft ? "end" : "start";
            return (
              <g
                key={n.id}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: "default", opacity: lit ? 1 : 0.4, transition: "opacity .18s ease" }}
              >
                <rect x={n.x} y={n.y} width={NODE_W} height={n.h} rx={4} fill={n.color} />
                <text
                  x={tx}
                  y={n.y + Math.min(n.h / 2, 16)}
                  textAnchor={anchor}
                  dominantBaseline="middle"
                  style={{ fontSize: 13.5, fontWeight: 600, fill: "var(--tv-text-primary)" }}
                >
                  {iconFor(n.label) ? `${iconFor(n.label)}  ` : ""}
                  {n.label}
                </text>
                <text
                  x={tx}
                  y={n.y + Math.min(n.h / 2, 16) + 17}
                  textAnchor={anchor}
                  dominantBaseline="middle"
                  style={{ fontSize: 12, fill: "var(--tv-text-muted)" }}
                >
                  {currency(n.value)}
                  <tspan dx="6" style={{ fill: "var(--tv-text-muted)" }}>({share(n.value)}%)</tspan>
                </text>
              </g>
            );
          })
        )}
      </svg>
    </div>
  );
}

/**
 * Turn the abstract model into positioned columns + ribbon paths.
 * Three columns: sources (in) · hub · categories (out). Node heights are proportional to
 * value within the taller of the two side-stacks, so ribbons conserve area visually.
 */
function buildLayout(model, W, H) {
  if (!model || !model.nodes || model.nodes.length === 0) return null;
  const inNodes = model.nodes.filter((n) => n.side === "in");
  const hub = model.nodes.find((n) => n.side === "hub");
  const outNodes = model.nodes.filter((n) => n.side === "out");
  if (!hub || (inNodes.length === 0 && outNodes.length === 0)) return null;

  const totalIn = inNodes.reduce((s, n) => s + n.value, 0) || hub.value;
  const totalOut = outNodes.reduce((s, n) => s + n.value, 0);
  const scaleBase = Math.max(totalIn, totalOut, 1);
  const plotH = H - PAD_Y * 2;

  // Shared px-per-$ across columns so ribbon widths stay honest; pick the tighter fit.
  const leftCount = Math.max(inNodes.length, 1);
  const rightCount = Math.max(outNodes.length, 1);
  const px = Math.min(
    (plotH - (leftCount - 1) * GAP) / scaleBase,
    (plotH - (rightCount - 1) * GAP) / scaleBase
  );

  const xLeft = 4;
  const xHub = W / 2 - NODE_W / 2;
  const xRight = W - NODE_W - 4;

  const place = (nodes, x) => {
    const totalNodeH = nodes.reduce((s, n) => s + Math.max(6, n.value * px), 0) + (nodes.length - 1) * GAP;
    let y = PAD_Y + Math.max(0, (plotH - totalNodeH) / 2);
    return nodes.map((n) => {
      const h = Math.max(6, n.value * px);
      const rec = { ...n, x, y, h, cy: y + h / 2 };
      y += h + GAP;
      return rec;
    });
  };

  const left = place(inNodes, xLeft);
  const hubH = Math.max(left.reduce((s, n) => s + n.h, 0) + (left.length - 1) * GAP, outNodes.reduce((s, n) => s + Math.max(6, n.value * px), 0) + (rightCount - 1) * GAP, 40);
  const hubY = PAD_Y + Math.max(0, (plotH - hubH) / 2);
  const hubRec = { ...hub, x: xHub, y: hubY, h: hubH, cy: hubY + hubH / 2 };
  const right = place(outNodes, xRight);

  const byId = {};
  [...left, hubRec, ...right].forEach((n) => (byId[n.id] = n));

  // Ribbon: thickness at each end equals the link's share of that node's height, stacked so
  // ribbons don't overlap where they meet a node.
  const cursorFrom = {}; // running y on the source (right edge)
  const cursorTo = {}; // running y on the target (left edge)
  const links = model.links
    .map((l) => {
      const s = byId[l.source];
      const t = byId[l.target];
      if (!s || !t) return null;
      const sh = (l.value / (s.value || 1)) * s.h;
      const th = (l.value / (t.value || 1)) * t.h;
      const sy = (cursorFrom[s.id] = (cursorFrom[s.id] ?? s.y)) ;
      const ty = (cursorTo[t.id] = (cursorTo[t.id] ?? t.y));
      cursorFrom[s.id] += sh;
      cursorTo[t.id] += th;
      const x0 = s.x + NODE_W;
      const x1 = t.x;
      const mx = (x0 + x1) / 2;
      const path = ribbon(x0, sy, sy + sh, x1, ty, ty + th, mx);
      // Ribbon tint: source category color for inflows into the hub, target color for outflows.
      const color = t.id === "hub" ? s.color : t.color;
      return { ...l, path, color };
    })
    .filter(Boolean);

  return { columns: [left, [hubRec], right], links, totalIn };
}

/** A filled ribbon between two vertical edges using mirrored cubic beziers. */
function ribbon(x0, y0Top, y0Bot, x1, y1Top, y1Bot, mx) {
  return [
    `M ${x0} ${y0Top}`,
    `C ${mx} ${y0Top} ${mx} ${y1Top} ${x1} ${y1Top}`,
    `L ${x1} ${y1Bot}`,
    `C ${mx} ${y1Bot} ${mx} ${y0Bot} ${x0} ${y0Bot}`,
    "Z",
  ].join(" ");
}
