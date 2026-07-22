import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { currency, currency0 } from "../utils/format";
import { totalSpend, spendByCategory, topMerchants, monthOverMonth } from "../utils/spending";

/* SpendingInsightsPage — where the money actually goes (Phase 2).
   Category breakdown, biggest movers vs last month, and top merchants — all computed
   client-side from transactions (utils/spending.js). feature_key: individual.spendInsights. */

const RANGES = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "12 months" },
];

// A stable, on-brand color per category slice.
const PALETTE = [
  "var(--tv-forest, #2f7a5b)", "var(--tv-gold, #c9973a)", "#7a5bd6",
  "#1E5FAD", "#c0392b", "#3f8f6f", "#b4713a", "#5b8fd6",
];

export default function SpendingInsightsPage({ transactions = [] }) {
  const navigate = useNavigate();
  const [days, setDays] = useState(30);

  const total = useMemo(() => totalSpend(transactions, days), [transactions, days]);
  const byCategory = useMemo(() => spendByCategory(transactions, days), [transactions, days]);
  const merchants = useMemo(() => topMerchants(transactions, days, 5), [transactions, days]);
  const movers = useMemo(() => monthOverMonth(transactions), [transactions]);

  const hasData = byCategory.length > 0;

  return (
    <div className="page active">
      <div style={{ marginBottom: 18 }}>
        <div className="page-title">Spending insights</div>
        <div className="page-subtitle">Where your money actually goes — and what changed.</div>
      </div>

      {!hasData ? (
        <div className="card" style={{ padding: 28, textAlign: "center" }}>
          <i className="ti ti-chart-donut" style={{ fontSize: 34, color: "var(--tv-forest, #2f7a5b)" }} />
          <div className="page-title" style={{ fontSize: 18, marginTop: 10 }}>No spending to analyze yet</div>
          <div className="page-subtitle" style={{ marginBottom: 16 }}>
            Once transactions sync from your linked accounts, your category breakdown appears here.
          </div>
          <button className="btn btn-primary" onClick={() => navigate("/accounts")}>
            <i className="ti ti-plus" /> Link accounts
          </button>
        </div>
      ) : (
        <>
          {/* Range + headline total */}
          <div className="card" style={{ padding: 18, marginBottom: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>Total spent · last {RANGES.find((r) => r.days === days)?.label}</div>
                <div style={{ fontSize: 28, fontWeight: 800 }}>{currency0(total)}</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {RANGES.map((r) => (
                  <button
                    key={r.days}
                    className={`btn btn-sm ${days === r.days ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => setDays(r.days)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Biggest movers vs last month */}
          {movers.length > 0 && (
            <div className="card" style={{ padding: 18, marginBottom: 18 }}>
              <div className="page-title" style={{ fontSize: 16, marginBottom: 10 }}>What changed vs last month</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {movers.slice(0, 4).map((m) => {
                  const up = m.diff > 0;
                  const color = up ? "var(--tv-red, #c0392b)" : "var(--tv-forest, #2f7a5b)";
                  return (
                    <div key={m.category} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <i className={up ? "ti ti-arrow-up-right" : "ti ti-arrow-down-right"} style={{ color, fontSize: 18 }} />
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13.5 }}>
                        <strong style={{ textTransform: "capitalize" }}>{m.category}</strong>{" "}
                        {m.deltaPct === null
                          ? <>is new this month — {currency0(m.current)}</>
                          : <>{up ? "up" : "down"} {Math.abs(Math.round(m.deltaPct))}% — {currency0(m.current)} vs {currency0(m.previous)}</>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Category breakdown */}
          <div className="card" style={{ padding: 18, marginBottom: 18 }}>
            <div className="page-title" style={{ fontSize: 16, marginBottom: 12 }}>By category</div>
            {/* Single stacked bar for proportion at a glance */}
            <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden", marginBottom: 14 }}>
              {byCategory.map((c, i) => (
                <div key={c.category} title={`${c.category} ${Math.round(c.share * 100)}%`}
                     style={{ width: `${c.share * 100}%`, background: PALETTE[i % PALETTE.length] }} />
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {byCategory.slice(0, 8).map((c, i) => (
                <div key={c.category} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i < Math.min(byCategory.length, 8) - 1 ? "1px solid var(--tv-border, rgba(0,0,0,.06))" : "none" }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: PALETTE[i % PALETTE.length], flex: "0 0 auto" }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, textTransform: "capitalize", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.category}</span>
                  <span className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>{Math.round(c.share * 100)}%</span>
                  <span style={{ fontWeight: 700, fontSize: 14, minWidth: 78, textAlign: "right" }}>{currency0(c.total)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top merchants */}
          <div className="card" style={{ padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div className="page-title" style={{ fontSize: 16, margin: 0 }}>Top merchants</div>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate("/transactions")}>All transactions</button>
            </div>
            {merchants.map((m, i) => (
              <div key={m.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: i < merchants.length - 1 ? "1px solid var(--tv-border, rgba(0,0,0,.06))" : "none" }}>
                <span style={{ display: "inline-flex", width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 8, background: "rgba(0,0,0,.04)", color: "var(--tv-muted, #7a8a83)", fontSize: 12, fontWeight: 700, flex: "0 0 auto" }}>
                  {i + 1}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div>
                  <div className="page-subtitle" style={{ margin: 0, fontSize: 12 }}>{m.count} charge{m.count === 1 ? "" : "s"}</div>
                </div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{currency(m.total)}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
