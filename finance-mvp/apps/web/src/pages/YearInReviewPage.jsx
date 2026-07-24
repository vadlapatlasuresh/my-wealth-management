import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { currency0 } from "../utils/format";
import { yearInReview, availableYears } from "../utils/yearInReview";
import { categoryColor } from "../utils/categoryPalette";
import StackedBarChart from "../components/viz/StackedBarChart";
import DonutChart from "../components/viz/DonutChart";

/* YearInReviewPage — "Wrapped for your money" (Phase 4). A shareable annual recap
   computed entirely client-side (utils/yearInReview.js). Design direction: IMG_1678
   (stacked category bars + top-categories legend + top tabs) on the dark glass canvas.
   feature_key: individual.yearInReview. */

const TABS = [
  { id: "spending", label: "Spending" },
  { id: "income", label: "Income" },
  { id: "cashflow", label: "Cash Flow" },
];

function StatChip({ label, value, sub, accent }) {
  return (
    <div className="kpi-card" style={{ "--kpi-accent": accent || "var(--tv-forest)" }}>
      <div className="page-subtitle" style={{ margin: 0, fontSize: 12 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, color: accent || "var(--tv-text-primary)" }}>{value}</div>
      {sub && <div className="page-subtitle" style={{ margin: 0, fontSize: 11.5 }}>{sub}</div>}
    </div>
  );
}

export default function YearInReviewPage({ transactions = [] }) {
  const navigate = useNavigate();
  const years = useMemo(() => availableYears(transactions), [transactions]);
  const [year, setYear] = useState(() => availableYears(transactions)[0] || new Date().getFullYear());
  const [tab, setTab] = useState("spending");

  const r = useMemo(() => yearInReview(transactions, year), [transactions, year]);

  // Stacked-bar periods coloured by the canonical palette (same colours as everywhere).
  const periods = useMemo(() => r.months.map((m) => ({
    label: m.label,
    segments: (m.segments || []).map((s) => ({
      key: s.key,
      value: tab === "income" ? 0 : s.value,
      color: s.key === "Other" ? "var(--tv-neutral, #9AAEA4)" : categoryColor(s.key),
    })),
  })), [r.months, tab]);

  const donutData = useMemo(
    () => r.topCategories.slice(0, 8).map((c) => ({ label: c.category, value: c.total, color: categoryColor(c.category) })),
    [r.topCategories]
  );

  if (!r.hasData) {
    return (
      <div className="page active">
        <div style={{ marginBottom: 18 }}>
          <div className="page-title">Your year in money</div>
          <div className="page-subtitle">A shareable recap of where {year} went.</div>
        </div>
        <div className="card" style={{ padding: 28, textAlign: "center" }}>
          <i className="ti ti-confetti" style={{ fontSize: 34, color: "var(--tv-gold)" }} />
          <div className="page-title" style={{ fontSize: 18, marginTop: 10 }}>No recap yet for {year}</div>
          <div className="page-subtitle" style={{ marginBottom: 16 }}>
            Once a year of transactions has synced from your linked accounts, your "Wrapped" appears here.
          </div>
          <button className="btn btn-primary" onClick={() => navigate("/accounts")}>
            <i className="ti ti-plus" /> Link accounts
          </button>
        </div>
      </div>
    );
  }

  const netPositive = r.net >= 0;

  return (
    <div className="page active">
      {/* Header + year selector */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <div className="page-title">Your year in money</div>
          <div className="page-subtitle">A shareable recap of where your money went — computed from your real numbers.</div>
        </div>
        <select className="form-select" style={{ maxWidth: 130 }} value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {(years.length ? years : [year]).map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Hero — the headline numbers, big white with green net */}
      <div className="card" style={{ padding: 22, marginBottom: 18 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 28 }}>
          <div>
            <div className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>You spent</div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 40, lineHeight: 1.05 }}>{currency0(r.totalSpent)}</div>
            <div className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>across {r.transactionCount.toLocaleString()} transactions in {year}</div>
          </div>
          <div style={{ borderLeft: "1px solid var(--tv-border)", paddingLeft: 28 }}>
            <div className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>You earned</div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 40, lineHeight: 1.05 }}>{currency0(r.totalIncome)}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: netPositive ? "var(--tv-positive)" : "var(--tv-negative)" }}>
              <i className={netPositive ? "ti ti-arrow-up-right" : "ti ti-arrow-down-right"} />{" "}
              {netPositive ? "+" : "−"}{currency0(Math.abs(r.net))} net
            </div>
          </div>
        </div>
      </div>

      {/* Top tabs like IMG_1678 */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, background: "var(--tv-neutral-bg, rgba(255,255,255,.06))", padding: 4, borderRadius: 999, width: "fit-content" }}>
        {TABS.map((tb) => (
          <button
            key={tb.id}
            className={`btn btn-sm ${tab === tb.id ? "btn-primary" : "btn-ghost"}`}
            style={{ borderRadius: 999 }}
            onClick={() => setTab(tb.id)}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {/* Stacked-bar spending over the year */}
      <div className="card" style={{ padding: 18, marginBottom: 18 }}>
        <div className="page-title" style={{ fontSize: 16, marginBottom: 4 }}>
          {tab === "income" ? "Income" : "Spending"} by month
        </div>
        {tab === "income" ? (
          <div className="page-subtitle" style={{ fontSize: 12.5, marginBottom: 8 }}>
            Total earned in {year}: <strong style={{ color: "var(--tv-positive)" }}>{currency0(r.totalIncome)}</strong>
          </div>
        ) : (
          <div className="page-subtitle" style={{ fontSize: 12.5, marginBottom: 8 }}>
            {r.biggestMonth ? <>Biggest month was <strong>{r.biggestMonth.label}</strong> at {currency0(r.biggestMonth.total)}.</> : null}
          </div>
        )}
        <StackedBarChart periods={periods} height={200} currency={currency0} highlightLabel={r.biggestMonth?.label} />
        {/* Legend — top categories with canonical colours + totals */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 20px", marginTop: 14 }}>
          {r.topCategories.slice(0, 6).map((c) => (
            <div key={c.category} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 150 }}>
              <span style={{ width: 11, height: 11, borderRadius: 3, background: categoryColor(c.category), flex: "0 0 auto" }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, textTransform: "capitalize", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.category}</div>
                <div className="page-subtitle" style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "var(--tv-text-secondary)" }}>{currency0(c.total)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Donut + top merchants side by side */}
      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", marginBottom: 18 }}>
        <div className="card" style={{ padding: 18 }}>
          <div className="page-title" style={{ fontSize: 16, marginBottom: 12 }}>Where it went</div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <DonutChart size={210} thickness={28} centerValue={currency0(r.totalSpent)} centerLabel="Total spent" data={donutData} />
          </div>
        </div>
        <div className="card" style={{ padding: 18 }}>
          <div className="page-title" style={{ fontSize: 16, marginBottom: 12 }}>Your top merchants</div>
          {r.topMerchants.map((m, i) => (
            <div key={m.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: i < r.topMerchants.length - 1 ? "1px solid var(--tv-border-light)" : "none" }}>
              <span style={{ display: "inline-flex", width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 8, background: "var(--tv-neutral-bg, rgba(255,255,255,.06))", color: "var(--tv-text-secondary)", fontSize: 12, fontWeight: 800, flex: "0 0 auto" }}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div>
                <div className="page-subtitle" style={{ margin: 0, fontSize: 12 }}>{m.count} charge{m.count === 1 ? "" : "s"}</div>
              </div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{currency0(m.total)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Fun-facts row */}
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <StatChip label="Avg spend / mo" value={currency0(r.avgPerMonth)} accent="var(--tv-gold)" />
        {r.biggestMonth && <StatChip label="Biggest month" value={r.biggestMonth.label} sub={currency0(r.biggestMonth.total)} accent="var(--tv-forest-light)" />}
        {r.biggestPurchase && <StatChip label="Biggest purchase" value={currency0(r.biggestPurchase.amount)} sub={r.biggestPurchase.name} accent="var(--tv-negative)" />}
        {r.topCategories[0] && <StatChip label="Top category" value={r.topCategories[0].category} sub={`${Math.round(r.topCategories[0].share * 100)}% of spend`} accent={categoryColor(r.topCategories[0].category)} />}
      </div>

      <div className="page-subtitle" style={{ fontSize: 12, marginTop: 16 }}>
        Every figure here is computed from your own transactions — never estimated or generated. Share it, or head to{" "}
        <button className="btn btn-ghost btn-sm" onClick={() => navigate("/spending")}>Spending insights</button> for the month-by-month view.
      </div>
    </div>
  );
}
