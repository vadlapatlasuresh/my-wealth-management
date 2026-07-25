import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { currency0 } from "../utils/format";
import { deriveUpcomingBills } from "../utils/netWorth";
import { monthlyBuckets, averages, safeToSpend, incomeBySource, cashFlowSankey } from "../utils/cashflow";
import { spendByCategory } from "../utils/spending";
import { categoryColor, categoryBucket } from "../utils/categoryPalette";
import { useChartPref } from "../utils/chartPrefs";
import ChartSelector from "../components/viz/ChartSelector";
import SankeyChart from "../components/viz/SankeyChart";
import ComboBarChart from "../components/viz/ComboBarChart";

/* CashFlowPage — money in vs out, visualized. Cash flow DEFAULTS to a Sankey (income sources →
   an Income hub → expense categories, reference IMG_1737/1738) and the shared ChartSelector
   lets the user switch to a Bar+projection view or a Profit & Loss table — the choice persists
   app-wide via utils/chartPrefs. Everything is computed client-side from linked accounts,
   transactions and scheduled bills. feature_key: individual.cashflow. */

function liquidCash(accounts = []) {
  return (accounts || [])
    .filter((a) => (a.type || "").toLowerCase() === "depository")
    .reduce((s, a) => s + (Number(a.currentBalance ?? a.balance ?? 0) || 0), 0);
}

// Small thematic emoji per canonical bucket — gives Sankey nodes the reference's icon flavor.
const BUCKET_EMOJI = {
  housing: "🏠", groceries: "🍎", food: "🍽️", shopping: "🛍️", auto: "🚗", utilities: "💡",
  medical: "💊", entertainment: "🎬", travel: "✈️", education: "🎓", personal: "💆",
  subscriptions: "🔁", income: "💰", transfer: "🔀", fees: "🏛️", misc: "＄", uncategorized: "＄",
};
const iconFor = (name) => BUCKET_EMOJI[categoryBucket(name) || "misc"] || "＄";

// Group income sources into Business vs Personal when "Split by business" is on.
const BUSINESS_RE = /business|invoice|self.?employ|1099|contract|consult|freelance|payout|stripe/i;
function splitIncome(sources, split) {
  if (!split) return sources;
  const groups = { "Business income": 0, "Personal income": 0 };
  for (const s of sources) groups[BUSINESS_RE.test(s.name) ? "Business income" : "Personal income"] += s.total;
  const total = sources.reduce((a, b) => a + b.total, 0) || 1;
  return Object.entries(groups)
    .filter(([, v]) => v > 0)
    .map(([name, t]) => ({ name, total: t, share: t / total }));
}

export default function CashFlowPage({ accounts = [], transactions = [], paymentIntents = [] }) {
  const navigate = useNavigate();
  const [type] = useChartPref("cashflow");
  const [includeBills, setIncludeBills] = useState(true);
  const [split, setSplit] = useState(false);

  const buckets = useMemo(() => monthlyBuckets(transactions, 6), [transactions]);
  const { avgIncome, avgSpend, avgNet } = useMemo(() => averages(buckets), [buckets]);
  const cash = useMemo(() => liquidCash(accounts), [accounts]);
  const upcomingTotal = useMemo(
    () => deriveUpcomingBills(paymentIntents).reduce((s, b) => s + (b.amount || 0), 0),
    [paymentIntents]
  );
  const sts = safeToSpend(cash, upcomingTotal);

  // Sankey / P&L source data — annual window so the flow reads as a whole picture.
  const income = useMemo(() => splitIncome(incomeBySource(transactions, 365), split), [transactions, split]);
  const spend = useMemo(() => {
    const base = spendByCategory(transactions, 365);
    if (includeBills && upcomingTotal > 0) return [...base, { category: "Scheduled bills", total: upcomingTotal, share: 0 }];
    return base;
  }, [transactions, includeBills, upcomingTotal]);

  const sankey = useMemo(
    () => cashFlowSankey({ income, spend, colorFor: categoryColor }),
    [income, spend]
  );

  // Bar view: monthly income/expense/net + a projected next month from the running average.
  const barPeriods = useMemo(() => {
    const past = buckets.map((b) => ({ label: b.label, income: b.income, expense: b.spend, net: b.net }));
    if (avgIncome > 0 || avgSpend > 0) {
      const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const next = new Date();
      next.setMonth(next.getMonth() + 1);
      past.push({ label: MONTHS[next.getMonth()], income: avgIncome, expense: avgSpend, net: avgNet, projected: true });
    }
    return past;
  }, [buckets, avgIncome, avgSpend, avgNet]);

  const totalIncome = sankey.inTotal;
  const totalExpense = sankey.outTotal;
  const savings = totalIncome - totalExpense;

  const hasData = buckets.some((b) => b.income > 0 || b.spend > 0) || totalIncome > 0 || totalExpense > 0;

  return (
    <div className="page active">
      <div style={{ marginBottom: 18 }}>
        <div className="page-title">Cash flow</div>
        <div className="page-subtitle">Where money comes from, and where it goes.</div>
      </div>

      {!hasData ? (
        <div className="card" style={{ padding: 28, textAlign: "center" }}>
          <i className="ti ti-arrows-exchange" style={{ fontSize: 34, color: "var(--tv-forest, #2f7a5b)" }} />
          <div className="page-title" style={{ fontSize: 18, marginTop: 10 }}>No cash flow yet</div>
          <div className="page-subtitle" style={{ marginBottom: 16 }}>
            Once you have a few months of linked transactions, your income and spending flow appears here.
          </div>
          <button className="btn btn-primary" onClick={() => navigate("/accounts")}>
            <i className="ti ti-plus" /> Link accounts
          </button>
        </div>
      ) : (
        <>
          {/* Safe-to-spend headline */}
          <div className="card" style={{ padding: 18, marginBottom: 16, display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ display: "inline-flex", width: 46, height: 46, alignItems: "center", justifyContent: "center", borderRadius: 12, background: sts >= 0 ? "var(--tv-positive-bg)" : "var(--tv-negative-bg)", color: sts >= 0 ? "var(--tv-forest, #2f7a5b)" : "var(--tv-red, #c0392b)", flex: "0 0 auto" }}>
              <i className="ti ti-wallet" style={{ fontSize: 22 }} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>Safe to spend right now</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: sts >= 0 ? "inherit" : "var(--tv-red, #c0392b)" }}>{currency0(sts)}</div>
              <div className="page-subtitle" style={{ margin: 0, fontSize: 12 }}>
                {currency0(cash)} cash − {currency0(upcomingTotal)} scheduled bills
              </div>
            </div>
          </div>

          {/* Summary cards — income (green) / expenses (red) / savings */}
          <div className="cf-summary" style={{ marginBottom: 16 }}>
            <div className="cf-summary-item">
              <span className="cf-dot" style={{ background: "var(--tv-positive)" }} />
              <span className="cf-summary-label">Total income</span>
              <span className="cf-summary-val" style={{ color: "var(--tv-positive)" }}>{currency0(totalIncome)}</span>
            </div>
            <div className="cf-summary-item">
              <span className="cf-dot" style={{ background: "var(--tv-negative)" }} />
              <span className="cf-summary-label">Total expenses</span>
              <span className="cf-summary-val" style={{ color: "var(--tv-negative)" }}>{currency0(totalExpense)}</span>
            </div>
            <div className="cf-summary-item">
              <span className="cf-dot" style={{ background: "var(--tv-text-muted)" }} />
              <span className="cf-summary-label">Savings</span>
              <span className="cf-summary-val" style={{ color: savings >= 0 ? "var(--tv-text-primary)" : "var(--tv-negative)" }}>{currency0(savings)}</span>
            </div>
          </div>

          {/* Chart card: shared selector + the chosen visualization */}
          <div className="card" style={{ padding: 18, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
              <div className="page-title" style={{ fontSize: 16, margin: 0 }}>Cash flow</div>
              <ChartSelector section="cashflow" split={split} onSplit={setSplit} compact />
            </div>

            {type === "sankey" && (
              sankey.nodes.length > 0 ? (
                <SankeyChart model={sankey} currency={currency0} iconFor={iconFor} />
              ) : (
                <div className="page-subtitle" style={{ textAlign: "center", padding: 20 }}>Not enough income and expense history to draw a flow yet.</div>
              )
            )}

            {type === "bar" && (
              <>
                <ComboBarChart periods={barPeriods} currency={currency0} onShare={() => {}} />
                <div style={{ display: "flex", gap: 16, fontSize: 12, marginTop: 8, color: "var(--tv-text-muted)" }}>
                  <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "var(--tv-positive-bg)", marginRight: 5 }} />Income</span>
                  <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "var(--tv-negative-bg)", marginRight: 5 }} />Expense</span>
                  <span><span style={{ display: "inline-block", width: 14, height: 3, verticalAlign: "middle", background: "var(--tv-text-primary)", marginRight: 5 }} />Net · <span style={{ color: "var(--tv-positive)" }}>dashed = projected</span></span>
                </div>
              </>
            )}

            {type === "pnl" && (
              <ProfitLossTable income={income} spend={spend} totalIncome={totalIncome} totalExpense={totalExpense} />
            )}
          </div>

          {/* Include bills toggle */}
          <label className="chart-toggle" style={{ marginBottom: 8 }}>
            <span>Include scheduled bills in expenses</span>
            <button type="button" role="switch" aria-checked={includeBills} className={`switch ${includeBills ? "on" : ""}`} onClick={() => setIncludeBills((v) => !v)}>
              <span className="knob" />
            </button>
          </label>

          <div className="page-subtitle" style={{ fontSize: 12, marginTop: 6 }}>
            An estimate for guidance, not financial advice. "Safe to spend" subtracts only bills we can see scheduled.
          </div>
        </>
      )}
    </div>
  );
}

// Profit & Loss table view (reference IMG_1738 "Profit & Loss" chart option).
function ProfitLossTable({ income, spend, totalIncome, totalExpense }) {
  const net = totalIncome - totalExpense;
  const Row = ({ name, value, color }) => (
    <div className="pnl-row">
      <span className="pnl-name">{name}</span>
      <span className="pnl-val" style={color ? { color } : undefined}>{currency0(value)}</span>
    </div>
  );
  return (
    <div className="pnl-table">
      <div className="pnl-head">Income</div>
      {income.map((i) => <Row key={i.name} name={i.name} value={i.total} color="var(--tv-positive)" />)}
      <div className="pnl-total"><span>Total income</span><span style={{ color: "var(--tv-positive)" }}>{currency0(totalIncome)}</span></div>

      <div className="pnl-head" style={{ marginTop: 12 }}>Expenses</div>
      {spend.map((s) => <Row key={s.category} name={s.category} value={s.total} color="var(--tv-negative)" />)}
      <div className="pnl-total"><span>Total expenses</span><span style={{ color: "var(--tv-negative)" }}>{currency0(totalExpense)}</span></div>

      <div className="pnl-total pnl-net"><span>Net {net >= 0 ? "profit" : "loss"}</span><span style={{ color: net >= 0 ? "var(--tv-positive)" : "var(--tv-negative)" }}>{currency0(net)}</span></div>
    </div>
  );
}
