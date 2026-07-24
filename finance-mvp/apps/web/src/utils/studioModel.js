// studioModel.js — the pure data model + string renderers behind the Visualization Studio.
// Extracted from VisualizationStudioPage so it can be unit-tested WITHOUT a DOM (the page is
// a thin React shell over these functions). This is the "single source of truth" the Studio's
// three synced device previews all render from. Side-effect free.

/* Section metadata (mirrors the app nav) + canonical category palette (utils/categoryPalette.js). */
export const SECTIONS = {
  today:      { label: "Today",         color: "#4EA8F0" },
  money:      { label: "Money",         color: "#3DDC97" },
  grow:       { label: "Grow",          color: "#E6B455" },
  shared:     { label: "Shared",        color: "#C77DD6" },
  business:   { label: "Business & Tax",color: "#F0803C" },
  realestate: { label: "Real Estate",   color: "#2CC4C4" },
  more:       { label: "More",          color: "#9AAEA4" },
};
export const C = {
  housing: "#F25FA8", shopping: "#4EA8F0", food: "#F5C445", groceries: "#4FBE83",
  auto: "#F0803C", utilities: "#7A6FF0", medical: "#E5675A", entertainment: "#2CC4C4",
  education: "#5B8DEF", income: "#3DDC97", other: "#9AAEA4",
  stocks: "#2E7D5B", alt: "#5BB98C", cash: "#E6B455", neg: "#F0776B",
};

/* THE SINGLE SOURCE OF TRUTH — one entry per app screen; edit this to add a screen. */
export const SCREENS = {
  today: { section: "today", name: "Today", blocks: [
    { type: "header", title: "Good morning, Alex", subtitle: "Here's what needs you today" },
    { type: "ring", pct: 0.78, label: "Health", caption: "Financial health · Good" },
    { type: "kpis", items: [{ l: "Net worth", v: "$335,608", d: "+1.0%", up: true }, { l: "Cash", v: "$12,480" }, { l: "Bills due", v: "3" }] },
    { type: "list", title: "Needs you today", rows: [
      { dot: C.utilities, label: "Electric bill due in 2 days", sub: "Review", val: "$142" },
      { dot: C.income, label: "Paycheck landed", sub: "Chase ••1234", val: "+$3,100" }] },
  ] },
  home: { section: "money", name: "Home", blocks: [
    { type: "header", title: "Net worth", subtitle: "All your wealth, one place" },
    { type: "kpis", items: [{ l: "Net worth", v: "$335,608", d: "+1.0%", up: true }, { l: "Investments", v: "$180k", d: "+2.7%", up: true }, { l: "Debt", v: "$54k", d: "−1.2%", up: false }] },
    { type: "bars", title: "Net worth over time", series: [
      { label: "Feb", value: 60, color: C.stocks }, { label: "Mar", value: 66, color: C.stocks }, { label: "Apr", value: 63, color: C.stocks },
      { label: "May", value: 74, color: C.stocks }, { label: "Jun", value: 82, color: C.stocks }, { label: "Jul", value: 88, color: C.stocks }] },
  ] },
  cashflow: { section: "money", name: "Cash Flow", blocks: [
    { type: "header", title: "Cash flow", subtitle: "What's in, out, and safe to spend" },
    { type: "kpis", items: [{ l: "Avg in", v: "$6,200", d: "/mo", up: true }, { l: "Avg out", v: "$4,850", d: "/mo" }, { l: "Avg net", v: "+$1,350", d: "/mo", up: true }] },
    { type: "stacked", title: "Last 6 months", legend: [{ k: "In", c: C.income }, { k: "Out", c: C.auto }], periods: [
      { label: "Feb", segs: [{ v: 62, c: C.income }, { v: 48, c: C.auto }] }, { label: "Mar", segs: [{ v: 60, c: C.income }, { v: 52, c: C.auto }] },
      { label: "Apr", segs: [{ v: 64, c: C.income }, { v: 47, c: C.auto }] }, { label: "May", segs: [{ v: 66, c: C.income }, { v: 55, c: C.auto }] },
      { label: "Jun", segs: [{ v: 63, c: C.income }, { v: 49, c: C.auto }] }, { label: "Jul", segs: [{ v: 68, c: C.income }, { v: 51, c: C.auto }] }] },
  ] },
  spending: { section: "money", name: "Spending", blocks: [
    { type: "header", title: "Spending insights", subtitle: "Where your money actually goes" },
    { type: "donut", title: "By category", total: "$80,090", segments: [
      { label: "Utilities", value: 29902, color: C.utilities }, { label: "Shopping", value: 13513, color: C.shopping },
      { label: "Auto", value: 13139, color: C.auto }, { label: "Other", value: 14082, color: C.other },
      { label: "Medical", value: 3866, color: C.medical }, { label: "Education", value: 3537, color: C.education }] },
  ] },
  yearinreview: { section: "money", name: "Year in Review", isNew: true, blocks: [
    { type: "header", title: "Your year in money", subtitle: "Wrapped for your money · 2025" },
    { type: "kpis", items: [{ l: "You spent", v: "$89,455" }, { l: "You earned", v: "$112,300" }, { l: "Net", v: "+$22,845", d: "up", up: true }] },
    { type: "stacked", title: "Spending by month", legend: [{ k: "Housing", c: C.housing }, { k: "Food", c: C.food }, { k: "Shopping", c: C.shopping }], periods: [
      { label: "Jan", segs: [{ v: 34, c: C.housing }, { v: 19, c: C.food }, { v: 22, c: C.shopping }] },
      { label: "Feb", segs: [{ v: 30, c: C.housing }, { v: 16, c: C.food }, { v: 14, c: C.shopping }] },
      { label: "Mar", segs: [{ v: 24, c: C.housing }, { v: 12, c: C.food }, { v: 9, c: C.shopping }] },
      { label: "Apr", segs: [{ v: 32, c: C.housing }, { v: 15, c: C.food }, { v: 26, c: C.shopping }] },
      { label: "May", segs: [{ v: 36, c: C.housing }, { v: 21, c: C.food }, { v: 24, c: C.shopping }] },
      { label: "Jun", segs: [{ v: 35, c: C.housing }, { v: 18, c: C.food }, { v: 23, c: C.shopping }] }] },
    { type: "list", title: "Top merchants", rows: [
      { dot: C.shopping, label: "Amazon", sub: "42 charges", val: "$4,208" },
      { dot: C.food, label: "Whole Foods", sub: "88 charges", val: "$3,914" }] },
  ] },
  billtiming: { section: "money", name: "Bill Timing", isNew: true, blocks: [
    { type: "header", title: "Bill timing", subtitle: "Smooth your month" },
    { type: "verdict", tone: "warn", title: "Your month is 42% lopsided", detail: "Most bills land in the 1st–15th. Shifting a few smooths the crunch." },
    { type: "bars", title: "Outflow across the month", series: [
      { label: "1st–15th", value: 82, color: "#E6B455" }, { label: "16th–end", value: 34, color: "#F0803C" }] },
    { type: "list", title: "Suggested moves", rows: [
      { dot: "#3DDC97", label: "Internet → move to the 22nd", sub: "from day 5", val: "$100" },
      { dot: "#3DDC97", label: "Gym → move to the 22nd", sub: "from day 7", val: "$50" }] },
  ] },
  emergencyfund: { section: "grow", name: "Emergency Fund", blocks: [
    { type: "header", title: "Emergency fund", subtitle: "A cushion sized to your real expenses" },
    { type: "ring", pct: 0.64, label: "funded", caption: "3.8 months covered · Getting there" },
    { type: "list", title: "Milestones", rows: [
      { dot: "#3DDC97", label: "1 month of expenses", sub: "Reached", val: "$4,850" },
      { dot: "#9AAEA4", label: "3 months of expenses", sub: "$2,100 to go", val: "$14,550" }] },
  ] },
  investinsights: { section: "grow", name: "Invest Insights", isNew: true, blocks: [
    { type: "header", title: "Investment insights", subtitle: "Allocation, fees, drift — not advice" },
    { type: "kpis", items: [{ l: "Invested", v: "$180,400" }, { l: "Positions", v: "12" }, { l: "Fees/yr", v: "$486" }] },
    { type: "donut", title: "Your mix", total: "$180k", segments: [
      { label: "Stocks", value: 150, color: C.stocks }, { label: "Alternatives", value: 20, color: C.alt }, { label: "Cash", value: 10, color: C.cash }] },
    { type: "list", title: "Top positions", rows: [
      { dot: C.stocks, label: "VOO", sub: "Vanguard S&P 500", val: "34%" },
      { dot: C.neg, label: "TSLA", sub: "Concentration risk", val: "28%" }] },
  ] },
  creditscore: { section: "grow", name: "Credit Score", isNew: true, blocks: [
    { type: "header", title: "Credit score", subtitle: "Track your score and what moves it" },
    { type: "gauge", score: 742, min: 300, max: 850 },
    { type: "ring", pct: 0.22, label: "used", caption: "Utilization · Good" },
    { type: "factors", rows: [
      { label: "Payment history", weight: 35, status: "Excellent", pct: 96, tone: "good" },
      { label: "Utilization", weight: 30, status: "Good", pct: 78, tone: "good" },
      { label: "Age of credit", weight: 15, status: "Fair", pct: 55, tone: "warn" }] },
  ] },
  healthscore: { section: "grow", name: "Health Score", blocks: [
    { type: "header", title: "Financial health score", subtitle: "One number for where you stand" },
    { type: "gauge", score: 720, min: 300, max: 850 },
    { type: "factors", rows: [
      { label: "Savings rate", weight: 30, status: "Good", pct: 72, tone: "good" },
      { label: "Emergency fund", weight: 25, status: "Fair", pct: 58, tone: "warn" },
      { label: "Debt load", weight: 25, status: "Excellent", pct: 88, tone: "good" }] },
  ] },
  goalscenarios: { section: "grow", name: "Goal Scenarios", isNew: true, blocks: [
    { type: "header", title: "Goal scenarios", subtitle: "Retire-at-X · Monte-Carlo-lite" },
    { type: "kpis", items: [{ l: "Projected at 65", v: "$1.24M" }, { l: "Monthly income", v: "$4,120", d: "4% rule", up: true }, { l: "You contribute", v: "$339k" }] },
    { type: "bars", title: "Projected balance to age 65", series: [
      { label: "35", value: 12, color: C.income }, { label: "42", value: 26, color: C.income }, { label: "49", value: 44, color: C.income },
      { label: "56", value: 68, color: C.income }, { label: "63", value: 92, color: C.income }, { label: "65", value: 100, color: C.income }] },
  ] },
  sharedmoney: { section: "shared", name: "Goals & Bills", blocks: [
    { type: "header", title: "Shared goals & bills", subtitle: "What you save for together" },
    { type: "list", title: "Shared goals", rows: [
      { dot: C.income, label: "House down payment", sub: "Alex $11,200 · Jordan $7,200", val: "$18,400" },
      { dot: C.shopping, label: "Summer trip", sub: "62% funded", val: "$3,100" }] },
  ] },
  mybusiness: { section: "business", name: "My Business", blocks: [
    { type: "header", title: "My Business", subtitle: "Acme LLC · Connected" },
    { type: "kpis", items: [{ l: "Revenue MTD", v: "$42,100", d: "+8%", up: true }, { l: "Expenses", v: "$18,300" }, { l: "Net profit", v: "$23,800", d: "up", up: true }] },
    { type: "bars", title: "Revenue · 6 months", series: [
      { label: "Feb", value: 44, color: "#F0803C" }, { label: "Mar", value: 52, color: "#F0803C" }, { label: "Apr", value: 48, color: "#F0803C" },
      { label: "May", value: 61, color: "#F0803C" }, { label: "Jun", value: 55, color: "#F0803C" }, { label: "Jul", value: 63, color: "#F0803C" }] },
  ] },
  properties: { section: "realestate", name: "Properties", blocks: [
    { type: "header", title: "Properties", subtitle: "Your real estate portfolio" },
    { type: "kpis", items: [{ l: "Total value", v: "$720k", d: "up", up: true }, { l: "Equity", v: "$310k" }, { l: "Mortgage", v: "$410k" }] },
    { type: "list", title: "Portfolio", rows: [
      { dot: C.entertainment, label: "123 Oak St · Primary", sub: "Equity $185k", val: "$420k" },
      { dot: C.alt, label: "88 Pine Ave · Rental", sub: "Cap rate 6.2%", val: "$300k" }] },
  ] },
  settings: { section: "more", name: "Settings", blocks: [
    { type: "header", title: "Settings", subtitle: "Preferences, notifications, data" },
    { type: "list", title: "Appearance", rows: [
      { dot: C.other, label: "Theme", sub: "Glass Dark (default)", val: "●" },
      { dot: C.other, label: "Display currency", sub: "USD", val: "$" }] },
  ] },
};

/* ---- Renderers: one pure string function per block type (shared by all 3 devices) ---- */
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const TONE = { good: "var(--tv-positive)", warn: "var(--tv-warning)", bad: "var(--tv-negative)" };

export function donut(segments, total, size = 132, thick = 20) {
  const clean = segments.filter((s) => +s.value > 0);
  const sum = clean.reduce((a, s) => a + +s.value, 0);
  const r = (size - thick) / 2, c = 2 * Math.PI * r, cx = size / 2; let off = 0;
  const arcs = clean.map((s) => {
    const f = sum ? +s.value / sum : 0; const len = Math.max(0, f * c - 2);
    const a = `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${thick}" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-off}"/>`;
    off += f * c; return a;
  }).join("");
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="max-width:100%">
    <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="var(--tv-border)" stroke-width="${thick}" opacity=".5"/>
    <g transform="rotate(-90 ${cx} ${cx})">${arcs}</g>
    <text x="${cx}" y="${cx - 2}" text-anchor="middle" dominant-baseline="middle" style="font-weight:700;font-size:${size * 0.15}px;fill:var(--tv-text-primary)">${esc(total)}</text>
    <text x="${cx}" y="${cx + size * 0.12}" text-anchor="middle" style="font-size:${size * 0.07}px;fill:var(--tv-text-muted)">Total</text></svg>`;
}
export function ring(pct, label, size = 118, thick = 12, color = "var(--tv-positive)") {
  const r = (size - thick) / 2, c = 2 * Math.PI * r, cx = size / 2, dash = Math.max(0, Math.min(1, pct)) * c;
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="transform:rotate(-90deg)">
    <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="var(--tv-border)" stroke-width="${thick}"/>
    <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${color}" stroke-width="${thick}" stroke-linecap="round" stroke-dasharray="${dash} ${c - dash}"/>
    <text x="${cx}" y="${cx}" transform="rotate(90 ${cx} ${cx})" text-anchor="middle" dominant-baseline="middle" style="font-weight:700;font-size:${size * 0.2}px;fill:var(--tv-text-primary)">${Math.round(pct * 100)}%</text>
    <text x="${cx}" y="${cx + size * 0.16}" transform="rotate(90 ${cx} ${cx})" text-anchor="middle" style="font-size:${size * 0.1}px;fill:var(--tv-text-muted)">${esc(label || "")}</text></svg>`;
}
export function gauge(score, min, max, size = 220) {
  const bands = [[300, 579, "#F0776B"], [580, 669, "#F0A03C"], [670, 739, "#E6C34B"], [740, 799, "#5BB98C"], [800, 850, "#3DDC97"]];
  const stroke = size * 0.09, r = (size - stroke) / 2 - 2, cx = size / 2, cy = r + stroke / 2 + 2, H = cy + stroke;
  const ang = (s) => Math.PI * (1 - (Math.max(min, Math.min(max, s)) - min) / (max - min));
  const pt = (s) => [cx + r * Math.cos(ang(s)), cy - r * Math.sin(ang(s))];
  const arc = (a, b) => { const [x0, y0] = pt(a), [x1, y1] = pt(b); return `M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`; };
  const active = bands.find((b) => score >= b[0] && score <= b[1]) || bands[0];
  const [mx, my] = pt(score);
  const lbl = active[0] < 580 ? "POOR" : active[0] < 670 ? "FAIR" : active[0] < 740 ? "GOOD" : active[0] < 800 ? "VERY GOOD" : "EXCEPTIONAL";
  return `<svg viewBox="0 0 ${size} ${H}" width="${size}" height="${H}" style="max-width:100%">
    <path d="${arc(min, max)}" fill="none" stroke="var(--tv-border)" stroke-width="${stroke}" stroke-linecap="round" opacity=".5"/>
    ${bands.map((b) => `<path d="${arc(b[0], b[1])}" fill="none" stroke="${b[2]}" stroke-width="${stroke}"/>`).join("")}
    <circle cx="${mx}" cy="${my}" r="${stroke * 0.6}" fill="var(--tv-bg)" stroke="${active[2]}" stroke-width="${stroke * 0.3}"/>
    <text x="${cx}" y="${cy - r * 0.15}" text-anchor="middle" style="font-weight:800;font-size:${size * 0.15}px;fill:var(--tv-text-primary)">${score}</text>
    <text x="${cx}" y="${cy - r * 0.15 + size * 0.07}" text-anchor="middle" style="font-size:${size * 0.05}px;font-weight:700;fill:${active[2]};letter-spacing:.05em">${lbl}</text></svg>`;
}
const card = (title, inner) => `<div class="viz-card">${title ? `<div class="ct">${esc(title)}</div>` : ""}${inner}</div>`;
function barsBlock(b) {
  const max = Math.max(1, ...b.series.map((s) => +s.value));
  return card(b.title, `<div class="viz-barsc">${b.series.map((s) => `<div class="col">
    <div class="stack" style="height:${Math.round(+s.value / max * 110)}px"><div style="height:100%;background:${s.color}"></div></div>
    <div class="cl">${esc(s.label)}</div></div>`).join("")}</div>`);
}
function stackedBlock(b) {
  const totals = b.periods.map((p) => p.segs.reduce((a, s) => a + +s.v, 0)), max = Math.max(1, ...totals);
  const legend = `<div class="viz-legend">${(b.legend || []).map((l) => `<span><i style="background:${l.c}"></i>${esc(l.k)}</span>`).join("")}</div>`;
  return card(b.title, `<div class="viz-barsc">${b.periods.map((p, i) => {
    const tot = totals[i];
    return `<div class="col"><div class="stack" style="height:${Math.round(tot / max * 110)}px">
      ${p.segs.map((s) => `<div style="height:${tot ? (+s.v / tot * 100) : 0}%;background:${s.c}"></div>`).join("")}</div>
      <div class="cl">${esc(p.label)}</div></div>`;
  }).join("")}</div>${legend}`);
}
export function renderBlock(b) {
  switch (b.type) {
    case "header": return `<div><div class="t">${esc(b.title)}</div><div class="s">${esc(b.subtitle || "")}</div></div>`;
    case "kpis": return `<div class="viz-kpis">${b.items.map((k) => `<div class="viz-kpi"><div class="l">${esc(k.l)}</div><div class="v">${esc(k.v)}</div>${k.d ? `<div class="d ${k.up ? "up" : "down"}">${k.up ? "▲" : "▼"} ${esc(k.d)}</div>` : ""}</div>`).join("")}</div>`;
    case "donut": return card(b.title, `<div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
      <div>${donut(b.segments, b.total)}</div>
      <div style="flex:1;min-width:150px">${b.segments.map((s) => `<div class="viz-row"><span class="rd" style="background:${s.color}"></span><span class="rl">${esc(s.label)}</span><span class="rv">${esc(typeof s.value === "number" ? "$" + s.value.toLocaleString() : s.value)}</span></div>`).join("")}</div></div>`);
    case "ring": return card("", `<div style="display:flex;gap:16px;align-items:center">${ring(b.pct, b.label)}<div><div class="rv" style="font-size:14px">${esc(b.caption || "")}</div></div></div>`);
    case "gauge": return card("", `<div style="display:flex;justify-content:center">${gauge(b.score, b.min, b.max)}</div>`);
    case "bars": return barsBlock(b);
    case "stacked": return stackedBlock(b);
    case "list": return card(b.title, b.rows.map((r) => `<div class="viz-row"><span class="rd" style="background:${r.dot || "var(--tv-text-muted)"}"></span><div class="rl">${esc(r.label)}<div class="rs">${esc(r.sub || "")}</div></div><span class="rv">${esc(r.val || "")}</span></div>`).join(""));
    case "factors": return card("What's affecting it", b.rows.map((r) => `<div style="padding:7px 0"><div style="display:flex;gap:8px;align-items:center;margin-bottom:5px"><span style="font-size:12.5px;font-weight:600">${esc(r.label)}</span><span class="rs">${r.weight}%</span><span class="viz-pill" style="margin-left:auto;background:rgba(127,127,127,.14);color:${TONE[r.tone]}">${esc(r.status)}</span></div><div style="height:6px;border-radius:4px;background:rgba(127,127,127,.14);overflow:hidden"><div style="width:${r.pct}%;height:100%;background:${TONE[r.tone]}"></div></div></div>`).join(""));
    case "verdict": return `<div class="viz-card" style="border-left:3px solid ${TONE[b.tone] || "var(--tv-warning)"}"><div style="font-weight:700;font-size:14px">${esc(b.title)}</div><div class="rs" style="margin-top:3px">${esc(b.detail || "")}</div></div>`;
    default: return card("Unknown block", `<div class="rs">type: ${esc(b.type)}</div>`);
  }
}
export function renderScreen(screen) {
  try { return `<div class="viz-sc">${screen.blocks.map(renderBlock).join("")}</div>`; }
  catch (e) { return `<div class="viz-sc"><div class="viz-card" style="color:var(--tv-negative)">Render error: ${esc(e.message)}</div></div>`; }
}
