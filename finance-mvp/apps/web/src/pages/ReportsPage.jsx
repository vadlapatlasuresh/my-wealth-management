import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { currency0 } from "../utils/format";
import { deriveUpcomingBills } from "../utils/netWorth";
import { monthlyBuckets, averages, incomeBySource, cashFlowSankey } from "../utils/cashflow";
import { spendByCategory, topMerchants } from "../utils/spending";
import { categoryColor, categoryBucket } from "../utils/categoryPalette";
import { useChartPref } from "../utils/chartPrefs";
import ChartSelector from "../components/viz/ChartSelector";
import SankeyChart from "../components/viz/SankeyChart";
import ComboBarChart from "../components/viz/ComboBarChart";
import DonutChart from "../components/viz/DonutChart";
import StackedBarChart from "../components/viz/StackedBarChart";
import BankLogo from "../components/viz/BankLogo";

/* ReportsPage — the unified Reports hub (reference IMG_1736/1737/1716): Cash Flow · Spending ·
   Income sub-tabs sharing one summary + one chart system. Every visualization comes from the
   shared viz components and the per-section ChartSelector (utils/chartPrefs), so a chart-type
   choice here matches the standalone Cash Flow / Spending pages. Bank brand marks sit beside
   income figures (BankLogo). All client-computed from linked accounts + transactions. */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const BUCKET_EMOJI = {
  housing: "🏠", groceries: "🍎", food: "🍽️", shopping: "🛍️", auto: "🚗", utilities: "💡",
  medical: "💊", entertainment: "🎬", travel: "✈️", education: "🎓", personal: "💆",
  subscriptions: "🔁", income: "💰", transfer: "🔀", fees: "🏛️", misc: "＄", uncategorized: "＄",
};
const iconFor = (name) => BUCKET_EMOJI[categoryBucket(name) || "misc"] || "＄";

const TABS = [
  { id: "cashflow", label: "Cash Flow", icon: "ti ti-arrows-exchange" },
  { id: "spending", label: "Spending", icon: "ti ti-chart-donut" },
  { id: "income", label: "Income", icon: "ti ti-cash" },
];

// Income grouped by merchant/payer (amount < 0), largest first — the income "by merchant" view.
function incomeByMerchant(transactions = [], days = 365, limit = 8) {
  const cutoff = Date.now() - days * 86400000;
  const acc = {};
  for (const t of transactions || []) {
    const amt = Number(t.amount) || 0;
    if (amt >= 0) continue;
    const ts = t.date ? new Date(t.date).getTime() : NaN;
    if (Number.isNaN(ts) || ts < cutoff) continue;
    const k = t.merchant || t.name || t.description || "Income";
    acc[k] = acc[k] || { name: k, total: 0, count: 0 };
    acc[k].total += -amt;
    acc[k].count += 1;
  }
  return Object.values(acc).sort((a, b) => b.total - a.total).slice(0, limit);
}

export default function ReportsPage({ accounts = [], transactions = [], paymentIntents = [] }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState("cashflow");

  const buckets = useMemo(() => monthlyBuckets(transactions, 6), [transactions]);
  const { avgIncome, avgSpend, avgNet } = useMemo(() => averages(buckets), [buckets]);
  const income = useMemo(() => incomeBySource(transactions, 365), [transactions]);
  const spend = useMemo(() => spendByCategory(transactions, 365), [transactions]);

  const totalIncome = useMemo(() => income.reduce((s, i) => s + i.total, 0), [income]);
  const totalExpense = useMemo(() => spend.reduce((s, i) => s + i.total, 0), [spend]);
  const savings = totalIncome - totalExpense;

  const hasData = totalIncome > 0 || totalExpense > 0;

  if (!hasData) {
    return (
      <div className="page active">
        <ReportsHeader />
        <div className="card" style={{ padding: 28, textAlign: "center" }}>
          <i className="ti ti-report-analytics" style={{ fontSize: 34, color: "var(--tv-forest, #2f7a5b)" }} />
          <div className="page-title" style={{ fontSize: 18, marginTop: 10 }}>No reports yet</div>
          <div className="page-subtitle" style={{ marginBottom: 16 }}>
            Link an account and once transactions sync, your cash-flow, spending and income reports appear here.
          </div>
          <button className="btn btn-primary" onClick={() => navigate("/accounts")}>
            <i className="ti ti-plus" /> Link accounts
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page active">
      <ReportsHeader />

      {/* Sub-tabs — filled dark active pill with light label (consistent tab styling). */}
      <div className="report-tabs" role="tablist" aria-label="Report type">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id}
            className={`report-tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
            <i className={t.icon} aria-hidden="true" /> {t.label}
          </button>
        ))}
      </div>

      {/* Shared summary — income (green) / expenses (red) / savings, across all tabs. */}
      <div className="cf-summary" style={{ margin: "16px 0" }}>
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

      {tab === "cashflow" && (
        <CashFlowReport income={income} spend={spend} buckets={buckets}
          avgIncome={avgIncome} avgSpend={avgSpend} avgNet={avgNet}
          totalIncome={totalIncome} totalExpense={totalExpense} paymentIntents={paymentIntents} />
      )}
      {tab === "spending" && <SpendingReport transactions={transactions} spend={spend} paymentIntents={paymentIntents} />}
      {tab === "income" && <IncomeReport transactions={transactions} income={income} accounts={accounts} buckets={buckets} totalIncome={totalIncome} />}
    </div>
  );
}

function ReportsHeader() {
  return (
    <div style={{ marginBottom: 16 }}>
      <div className="page-title">Reports</div>
      <div className="page-subtitle">Cash flow, spending and income — one clear picture.</div>
    </div>
  );
}

/* ---------- Cash Flow tab (Sankey default, Bar+projection, Profit & Loss) ---------- */
function CashFlowReport({ income, spend, buckets, avgIncome, avgSpend, avgNet, totalIncome, totalExpense, paymentIntents }) {
  const [type] = useChartPref("cashflow");
  const [split, setSplit] = useState(false);
  const [includeBills, setIncludeBills] = useState(true);

  const upcoming = useMemo(
    () => deriveUpcomingBills(paymentIntents).reduce((s, b) => s + (b.amount || 0), 0),
    [paymentIntents]
  );
  const BUSINESS_RE = /business|invoice|self.?employ|1099|contract|consult|freelance|payout|stripe/i;
  const incomeSplit = useMemo(() => {
    if (!split) return income;
    const g = { "Business income": 0, "Personal income": 0 };
    for (const s of income) g[BUSINESS_RE.test(s.name) ? "Business income" : "Personal income"] += s.total;
    const tot = income.reduce((a, b) => a + b.total, 0) || 1;
    return Object.entries(g).filter(([, v]) => v > 0).map(([name, t]) => ({ name, total: t, share: t / tot }));
  }, [income, split]);
  const spendBills = useMemo(
    () => (includeBills && upcoming > 0 ? [...spend, { category: "Scheduled bills", total: upcoming, share: 0 }] : spend),
    [spend, includeBills, upcoming]
  );
  const sankey = useMemo(() => cashFlowSankey({ income: incomeSplit, spend: spendBills, colorFor: categoryColor }), [incomeSplit, spendBills]);

  const barPeriods = useMemo(() => {
    const past = buckets.map((b) => ({ label: b.label, income: b.income, expense: b.spend, net: b.net }));
    if (avgIncome > 0 || avgSpend > 0) {
      const next = new Date(); next.setMonth(next.getMonth() + 1);
      past.push({ label: MONTHS[next.getMonth()], income: avgIncome, expense: avgSpend, net: avgNet, projected: true });
    }
    return past;
  }, [buckets, avgIncome, avgSpend, avgNet]);

  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div className="page-title" style={{ fontSize: 16, margin: 0 }}>Cash flow</div>
        <ChartSelector section="cashflow" split={split} onSplit={setSplit} compact />
      </div>

      {type === "sankey" && (sankey.nodes.length > 0
        ? <SankeyChart model={sankey} currency={currency0} iconFor={iconFor} />
        : <div className="page-subtitle" style={{ textAlign: "center", padding: 20 }}>Not enough history to draw a flow yet.</div>)}

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

      {type === "pnl" && <ProfitLossTable income={incomeSplit} spend={spendBills} totalIncome={totalIncome} totalExpense={totalExpense} />}

      <label className="chart-toggle" style={{ marginTop: 14 }}>
        <span>Include scheduled bills in expenses</span>
        <button type="button" role="switch" aria-checked={includeBills} className={`switch ${includeBills ? "on" : ""}`} onClick={() => setIncludeBills((v) => !v)}>
          <span className="knob" />
        </button>
      </label>
    </div>
  );
}

function ProfitLossTable({ income, spend, totalIncome, totalExpense }) {
  const net = totalIncome - totalExpense;
  const Row = ({ name, value, color }) => (
    <div className="pnl-row"><span className="pnl-name">{name}</span><span className="pnl-val" style={color ? { color } : undefined}>{currency0(value)}</span></div>
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

/* ---------- Spending tab (Donut default, Bar; Category / Merchant) ---------- */
function SpendingReport({ transactions, spend, paymentIntents }) {
  const [type] = useChartPref("spending");
  const [displayBy, setDisplayBy] = useState("category");
  const [showAll, setShowAll] = useState(false);
  const [includeBills, setIncludeBills] = useState(false);

  const upcoming = useMemo(() => deriveUpcomingBills(paymentIntents).reduce((s, b) => s + (b.amount || 0), 0), [paymentIntents]);
  const merchants = useMemo(() => topMerchants(transactions, 365, 12).map((m) => ({ category: m.name, total: m.total })), [transactions]);
  const rows = displayBy === "merchant" ? merchants : spend;
  const withBills = useMemo(
    () => (includeBills && upcoming > 0 && displayBy === "category" ? [...rows, { category: "Bills", total: upcoming }] : rows),
    [rows, includeBills, upcoming, displayBy]
  );
  const total = withBills.reduce((s, r) => s + r.total, 0);
  const shown = showAll ? withBills : withBills.slice(0, 6);

  const donutData = shown.map((r) => ({ label: r.category, value: r.total, color: categoryColor(r.category) }));
  const barPeriods = [{ label: "Spend", segments: shown.map((r) => ({ key: r.category, value: r.total, color: categoryColor(r.category) })) }];

  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div className="page-title" style={{ fontSize: 16, margin: 0 }}>Spending</div>
        <ChartSelector section="spending" compact
          displayBy={{ value: displayBy, onChange: setDisplayBy, options: [{ id: "category", label: "Category" }, { id: "merchant", label: "Merchant" }] }} />
      </div>

      <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
        {type === "donut" ? (
          <DonutChart data={donutData} size={190} centerValue={currency0(total)} centerLabel="Total spend" />
        ) : (
          <div style={{ minWidth: 120 }}><StackedBarChart periods={barPeriods} height={190} currency={currency0} /></div>
        )}
        <div style={{ flex: 1, minWidth: 220 }}>
          {shown.map((r, i) => (
            <div key={r.category + i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i < shown.length - 1 ? "1px solid var(--tv-border-light)" : "none" }}>
              <span style={{ width: 11, height: 11, borderRadius: 3, background: categoryColor(r.category), flex: "0 0 auto" }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, textTransform: "capitalize", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.category}</span>
              <span style={{ fontSize: 12, color: "var(--tv-text-muted)" }}>{total > 0 ? Math.round((r.total / total) * 100) : 0}%</span>
              <span style={{ fontWeight: 700, fontSize: 13.5, fontVariantNumeric: "tabular-nums" }}>{currency0(r.total)}</span>
            </div>
          ))}
          {withBills.length > 6 && (
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Show less" : `Show ${withBills.length - 6} more`}
            </button>
          )}
        </div>
      </div>

      {displayBy === "category" && (
        <label className="chart-toggle" style={{ marginTop: 14 }}>
          <span>Include bills</span>
          <button type="button" role="switch" aria-checked={includeBills} className={`switch ${includeBills ? "on" : ""}`} onClick={() => setIncludeBills((v) => !v)}>
            <span className="knob" />
          </button>
        </label>
      )}
    </div>
  );
}

/* ---------- Income tab (Bar default; Category / Merchant with bank logos) ---------- */
function IncomeReport({ transactions, income, buckets, totalIncome }) {
  const [type] = useChartPref("income");
  const [displayBy, setDisplayBy] = useState("merchant");

  const merchants = useMemo(() => incomeByMerchant(transactions, 365, 8), [transactions]);
  const monthPeriods = useMemo(
    () => buckets.map((b) => ({ label: b.label, segments: [{ key: "Income", value: b.income, color: "var(--tv-positive)" }] })),
    [buckets]
  );
  const rows = displayBy === "merchant" ? merchants.map((m) => ({ name: m.name, total: m.total })) : income;
  const donutData = rows.map((r) => ({ label: r.name, value: r.total, color: categoryColor(r.name) }));

  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div className="page-title" style={{ fontSize: 16, margin: 0 }}>Income</div>
        <ChartSelector section="income" compact
          displayBy={{ value: displayBy, onChange: setDisplayBy, options: [{ id: "merchant", label: "Merchant" }, { id: "category", label: "Category" }] }} />
      </div>

      {type === "donut"
        ? <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}><DonutChart data={donutData} size={190} centerValue={currency0(totalIncome)} centerLabel="Total income" /></div>
        : type === "line"
          ? <ComboBarChart periods={buckets.map((b) => ({ label: b.label, income: b.income, expense: 0, net: b.income }))} currency={currency0} />
          : <StackedBarChart periods={monthPeriods} height={200} currency={currency0} />}

      {/* Income breakdown — bank brand marks beside each payer (reference IMG_1736). */}
      <div style={{ marginTop: 8 }}>
        {rows.map((r, i) => {
          const isMerchant = displayBy === "merchant";
          const share = totalIncome > 0 ? Math.round((r.total / totalIncome) * 100) : 0;
          return (
            <div key={r.name + i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: i < rows.length - 1 ? "1px solid var(--tv-border-light)" : "none" }}>
              {isMerchant
                ? <BankLogo name={r.name} size={30} />
                : <span style={{ width: 30, height: 30, borderRadius: "50%", background: categoryColor(r.name), display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto", fontSize: 15 }}>{iconFor(r.name)}</span>}
              <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, textTransform: isMerchant ? "none" : "capitalize", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: "var(--tv-positive)", fontVariantNumeric: "tabular-nums" }}>
                {currency0(r.total)} <span style={{ color: "var(--tv-text-muted)", fontWeight: 500, fontSize: 12.5 }}>({share}%)</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
