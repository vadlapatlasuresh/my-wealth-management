import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import NetWorthChart from "../components/NetWorthChart";
// import RealEstateWidget from "../components/RealEstateWidget"; // Removed
import { currency, currency0, greeting, formatDateTime } from "../utils/format"; // formatDate is now passed as a prop
import { computeDownfall, computeContributors, deriveUpcomingBills } from "../utils/netWorth";
import LastRefreshed from "../components/LastRefreshed";
import { api } from "../api";

/* Dashboard greeting + live clock. Self-contained so its per-minute tick re-renders
   only this header — not the net-worth chart below it. Uses the user's system locale
   and timezone by default; pass `locale`/`timeZone` later to let users switch. */
function DashboardGreeting({ user, locale, timeZone, hour12 }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    // Tick at the top of each minute so the clock + greeting stay accurate without
    // re-rendering every second. Re-aligns to the next minute boundary each tick.
    let timer;
    const schedule = () => {
      const msToNextMinute = 60000 - (Date.now() % 60000);
      timer = setTimeout(() => { setNow(new Date()); schedule(); }, msToNextMinute + 50);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);

  const name = user?.name || (user?.email ? user.email.split("@")[0] : "there");
  const { dateStr, timeStr } = formatDateTime(now, { locale, timeZone, hour12 });

  return (
    <div>
      <div className="page-title">{greeting(now)}, {name}</div>
      <div className="page-subtitle">
        {dateStr} · {timeStr} &mdash; Here's your financial picture
      </div>
    </div>
  );
}

const RANGES = ["1H", "1D", "1W", "1M", "3M", "1Y", "All"];

// Net-worth chart layout options. Area = trend at a glance (default), Line =
// clean read, Bar = period-over-period comparison.
const CHART_TYPES = [
  { id: "area", icon: "ti ti-chart-area-line", label: "Area" },
  { id: "line", icon: "ti ti-chart-line", label: "Line" },
  { id: "bar", icon: "ti ti-chart-bar", label: "Bars" },
];

/* One KPI tile: an accent-colored icon chip, the amount, and a delta badge.
   The badge has three honest states — up, down, and flat (no green "+$0.00"
   when nothing moved). `invert` flips sentiment for debt, where a rise is bad.
   Percent is the change relative to the prior value (guarded against /0). */
function KpiCard({ icon, accent, label, value, change = 0, invert = false, onClick, title }) {
  const prior = value - change;
  const pct = prior !== 0 ? (change / Math.abs(prior)) * 100 : 0;
  const flat = Math.abs(change) < 0.005;
  const favorable = invert ? change < 0 : change > 0;
  const state = flat ? "flat" : favorable ? "pos" : "neg";
  const arrow = flat
    ? "ti ti-minus"
    : change > 0 ? "ti ti-arrow-up-right" : "ti ti-arrow-down-right";
  // Compact whole-dollar amount for the delta (cents add width without meaning).
  const amtStr = `${change > 0 ? "+" : ""}${currency0(change)}`;

  return (
    <div
      className="kpi-card kpi-clickable"
      style={{ "--kpi-accent": accent }}
      title={title}
      onClick={onClick}
    >
      <div className="kpi-label">
        <span className="kpi-icon"><i className={icon}></i></span>
        <span className="kpi-label-text">{label}</span>
        <i className="ti ti-chevron-right kpi-chevron"></i>
      </div>
      <div className="kpi-value">{currency(value)}</div>
      <div className={`kpi-delta ${state}`}>
        <span className="kpi-delta-badge">
          <i className={arrow}></i>
          {flat ? "No change" : `${change > 0 ? "+" : ""}${pct.toFixed(1)}%`}
        </span>
        <span className="kpi-delta-sub">
          {!flat && <span className="kpi-delta-amt">{amtStr}</span>}
          <span className="kpi-delta-period">30d</span>
        </span>
      </div>
    </div>
  );
}

export default function HomePage({
  snapshot,
  accounts = [],
  transactions = [],
  creditCards = [],
  properties = [],
  onPay,
  loadAll, // refreshes all dashboard data
  // onSync, // Removed
  user, // Added user prop
  insights = [], // Added insights prop
  paymentIntents = [], // real scheduled/pending bill-pay intents
  formatDate // Passed as prop from AppLayout
}) {
  const navigate = useNavigate();
  const [range, setRange] = useState("3M");
  const [chartType, setChartType] = useState(
    () => localStorage.getItem("tv_nw_charttype") || "area"
  );
  const [chartSnapshot, setChartSnapshot] = useState(null);
  const [showCustom, setShowCustom] = useState(false);

  const pickChartType = (id) => {
    setChartType(id);
    try { localStorage.setItem("tv_nw_charttype", id); } catch { /* ignore */ }
  };
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // Active snapshot used by the chart: locally fetched data if available, else the prop.
  const activeSnapshot = chartSnapshot || snapshot;

  // Export the recent transactions to a CSV via a Blob download.
  const handleExport = () => {
    const escapeCell = (v) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ["Date", "Description", "Category", "Amount"];
    const rows = (transactions || []).map((tx) =>
      [tx.date, tx.description, tx.category, tx.amount].map(escapeCell).join(",")
    );
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "transactions.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Net-worth chart range selection: refresh chart data, fall back to prop on failure.
  const handleRange = async (nextRange) => {
    setRange(nextRange);
    setShowCustom(false);
    try {
      const s = await api.getSnapshot(nextRange);
      setChartSnapshot(s);
    } catch (e) {
      setChartSnapshot(null); // fall back to the snapshot prop
    }
  };

  // Apply a custom from→to date range. We request it from the snapshot endpoint
  // (extra query params are ignored gracefully if the backend can't slice yet).
  const applyCustomRange = async () => {
    if (!customFrom || !customTo) return;
    const label = `${customFrom} → ${customTo}`;
    setRange(label);
    try {
      const s = await api.getSnapshot(`custom&from=${customFrom}&to=${customTo}`);
      setChartSnapshot(s);
    } catch (e) {
      setChartSnapshot(null);
    }
    setShowCustom(false);
  };

  // Pay a bill: trigger onPay then go to the bill pay page.
  const handlePayBill = (bill) => {
    if (typeof onPay === "function") onPay(bill);
    navigate("/billpay");
  };

  const totalUtil =
    creditCards.length > 0
      ? creditCards.reduce(
          (s, c) => s + (c.balance || 0) / (c.creditLimit || c.balance || 1),
          0
        ) / creditCards.length
      : 0;

  const netTotal = snapshot?.net_worth?.total ?? 0;
  const change30 = snapshot?.net_worth?.change_30d ?? 0;

  // Chart-specific values follow the (locally fetched or prop) active snapshot.
  const chartTotal = activeSnapshot?.net_worth?.total ?? netTotal;
  const chartChange = activeSnapshot?.net_worth?.change_30d ?? change30;
  const chartSeries = activeSnapshot?.series ?? snapshot?.series;

  // --- Downfall detection + attribution (pure logic in utils/netWorth, tested) ---
  const { declinePct: nwDeclinePct, alert: nwAlert } = computeDownfall(
    chartSeries, chartTotal, chartChange
  );
  const contributors = computeContributors(activeSnapshot?.components || snapshot?.components);
  const negativeContributors = contributors.filter((c) => c.value < 0);

  const realEstateEquity = properties.reduce((sum, p) => sum + (p.equity || 0), 0);
  const totalRealEstateValue = properties.reduce((sum, p) => sum + (p.currentValue || 0), 0);
  // const totalAssets = (snapshot?.components?.cash || 0) + (snapshot?.components?.investments || 0) + totalRealEstateValue; // Not directly used in new KPI grid

  // Real upcoming bills from scheduled/pending intents (pure helper, tested).
  const upcomingBills = deriveUpcomingBills(paymentIntents, formatDate);
  const totalBillsDue = upcomingBills.reduce((sum, bill) => sum + bill.amount, 0);

  // AI Insights come from props (real insights). No fabricated placeholders.
  const aiInsights = insights.slice(0, 2); // Take top 2 insights

  return (
    <>
      <div className="page-header">
        <DashboardGreeting user={user} />
        <div className="page-actions" style={{ alignItems: "center" }}>
          <LastRefreshed onRefresh={loadAll} />
          <button className="btn btn-secondary btn-sm" onClick={handleExport}>
            <i className="ti ti-download"></i> Export
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/accounts')}>
            <i className="ti ti-plus"></i> Add Account
          </button>
        </div>
      </div>

      {/* How-to entry point — opens the full feature guide / demo walkthrough */}
      <div
        className="home-guide-banner"
        role="button"
        tabIndex={0}
        onClick={() => navigate('/guide')}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/guide'); } }}
        title="Open the feature guide"
      >
        <div className="item-icon icon-forest" style={{ width: 42, height: 42, fontSize: 20, flexShrink: 0 }}>
          <i className="ti ti-compass"></i>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, color: 'var(--tv-text-primary)' }}>
            New to TerraVest? Take the guided tour
          </div>
          <div style={{ fontSize: 13, color: 'var(--tv-text-muted)' }}>
            Learn what every feature does and how to use it — step by step.
          </div>
        </div>
        <span className="btn btn-primary btn-sm" style={{ flexShrink: 0 }}>
          <i className="ti ti-book-2"></i> How to use
        </span>
      </div>

      {/* KPI Row — each card navigates to its detail screen */}
      <div className="kpi-grid">
        <KpiCard
          icon="ti ti-trending-up" accent="var(--tv-forest-light)"
          label="Net Worth" value={netTotal} change={change30}
          title="View accounts" onClick={() => navigate('/accounts')}
        />
        <KpiCard
          icon="ti ti-wallet" accent="#1E5FAD"
          label="Cash" value={snapshot?.components?.cash ?? 0}
          change={snapshot?.components?.cash_change_30d ?? 0}
          title="View accounts" onClick={() => navigate('/accounts')}
        />
        <KpiCard
          icon="ti ti-chart-line" accent="#6B46C1"
          label="Investments" value={snapshot?.components?.investments ?? 0}
          change={snapshot?.components?.investments_change_30d ?? 0}
          title="View investments" onClick={() => navigate('/invest')}
        />
        <KpiCard
          icon="ti ti-building-estate" accent="var(--tv-gold)"
          label="Real Estate" value={totalRealEstateValue}
          change={snapshot?.components?.real_estate_value_change_30d ?? 0}
          title="View properties" onClick={() => navigate('/realestate')}
        />
        <KpiCard
          icon="ti ti-home-dollar" accent="var(--tv-forest-light)"
          label="RE Equity" value={realEstateEquity}
          change={snapshot?.components?.real_estate_equity_change_30d ?? 0}
          title="View properties" onClick={() => navigate('/realestate')}
        />
        <KpiCard
          icon="ti ti-credit-card" accent="var(--tv-negative)"
          label="Total Debt" value={snapshot?.components?.credit_cards ?? 0}
          change={snapshot?.components?.credit_cards_change_30d ?? 0}
          invert
          title="Go to Debt Lab" onClick={() => navigate('/debt')}
        />
      </div>

      {/* Main grid */}
      <div className="grid-2" style={{ marginBottom: '16px' }}>
        {/* Net Worth Chart */}
        <div className="card col-span-2">
          <div className="section-header">
            <div className="section-title">Net worth over time</div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', position: 'relative', flexWrap: 'wrap' }}>
              {/* Chart layout toggle: Area / Line / Bars */}
              <div
                role="group"
                aria-label="Chart type"
                style={{
                  display: 'inline-flex', border: '1px solid var(--tv-border)',
                  borderRadius: 'var(--radius-md)', overflow: 'hidden', marginRight: 4,
                }}
              >
                {CHART_TYPES.map((c, i) => {
                  const on = chartType === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => pickChartType(c.id)}
                      title={c.label}
                      aria-pressed={on}
                      data-no-translate
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '4px 9px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                        border: 'none',
                        borderRight: i < CHART_TYPES.length - 1 ? '1px solid var(--tv-border)' : 'none',
                        background: on ? 'var(--tv-forest)' : 'transparent',
                        color: on ? '#fff' : 'var(--tv-text-secondary)',
                      }}
                    >
                      <i className={c.icon} style={{ fontSize: 14 }}></i>
                    </button>
                  );
                })}
              </div>
              {RANGES.map((r) => (
                <button
                  key={r}
                  className={`btn btn-sm ${range === r ? 'btn-primary' : 'btn-secondary'}`}
                  style={range === r ? { padding: '4px 10px', background: 'var(--tv-forest)' } : { padding: '4px 10px' }}
                  onClick={() => handleRange(r)}
                >
                  {r}
                </button>
              ))}
              <button
                className={`btn btn-sm ${range.includes('→') ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '4px 10px', ...(range.includes('→') ? { background: 'var(--tv-forest)' } : {}) }}
                onClick={() => setShowCustom((s) => !s)}
                title="Custom date range"
              >
                <i className="ti ti-calendar-event"></i> {range.includes('→') ? range : 'Custom'}
              </button>
              {showCustom && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50,
                  background: 'var(--tv-card)', border: '1px solid var(--tv-border)',
                  borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', padding: 14, width: 260,
                }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 10, color: 'var(--tv-text-primary)' }}>Custom date range</div>
                  <div className="form-group" style={{ marginBottom: 8 }}>
                    <label className="form-label" style={{ fontSize: 11.5 }}>From</label>
                    <input type="date" className="form-input" value={customFrom} max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 12 }}>
                    <label className="form-label" style={{ fontSize: 11.5 }}>To</label>
                    <input type="date" className="form-input" value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowCustom(false)}>Cancel</button>
                    <button className="btn btn-primary btn-sm" disabled={!customFrom || !customTo} onClick={applyCustomRange}>Apply</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Downfall alert: shown only when net worth fell beyond the threshold */}
          {nwAlert && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', marginBottom: 12,
              background: 'var(--tv-negative-bg)', border: '1px solid var(--tv-negative)',
              borderLeft: '4px solid var(--tv-negative)', borderRadius: 'var(--radius-md)',
            }}>
              <i className="ti ti-alert-triangle" style={{ color: 'var(--tv-negative)', fontSize: 20, flexShrink: 0 }}></i>
              <div style={{ flex: 1, fontSize: 13, color: 'var(--tv-text-primary)', lineHeight: 1.5 }}>
                <strong style={{ color: 'var(--tv-negative)' }}>
                  Net worth fell {Math.abs(nwDeclinePct).toFixed(1)}% this period.
                </strong>
                {negativeContributors.length > 0 && (
                  <> Biggest drag: <strong>{negativeContributors[0].label}</strong> ({currency(negativeContributors[0].value)}).</>
                )}
              </div>
            </div>
          )}

          <NetWorthChart total={chartTotal} change30d={chartChange} series={chartSeries} chartType={chartType} alert={nwAlert} declinePct={nwDeclinePct} />

          {/* What moved net worth — color-coded contributions (green up / red down) */}
          {contributors.length > 0 && (
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
              marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--tv-border-light)',
            }}>
              <span style={{
                fontSize: 11, color: 'var(--tv-text-muted)', textTransform: 'uppercase',
                letterSpacing: '.04em', marginRight: 2,
              }}>
                What moved it · 30d
              </span>
              {contributors.map((c) => {
                const neg = c.value < 0;
                const emph = neg && nwAlert; // emphasize the draggers during a downfall
                return (
                  <span
                    key={c.key}
                    title={`${c.label}: ${currency(c.value)}`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '4px 9px', borderRadius: 999, fontSize: 12,
                      fontWeight: emph ? 700 : 600,
                      background: neg ? 'var(--tv-negative-bg)' : 'var(--tv-positive-bg)',
                      color: neg ? 'var(--tv-negative)' : 'var(--tv-positive)',
                      border: emph ? '1px solid var(--tv-negative)' : '1px solid transparent',
                    }}
                  >
                    <i className={c.icon}></i>
                    {c.label} {neg ? '' : '+'}{currency(c.value)}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: '16px' }}>
        {/* Credit Utilization */}
        <div className="card">
          <div className="section-title">Credit utilization</div>
          <div className="donut-wrap">
            <svg width="120" height="120" viewBox="0 0 120 120" style={{ flexShrink: 0 }}>
              <circle cx="60" cy="60" r="46" fill="none" stroke="var(--tv-border)" strokeWidth="14" />
              <circle cx="60" cy="60" r="46" fill="none" stroke="var(--tv-forest)" strokeWidth="14"
                strokeDasharray={`${Math.min(totalUtil * 290, 290)} 290`} strokeDashoffset="70" strokeLinecap="round" />
              <text x="60" y="56" textAnchor="middle" fontSize="18" fontWeight="600" fill="var(--tv-text-primary)" fontFamily="var(--font-display)">{Math.round(totalUtil * 100)}%</text>
              <text x="60" y="72" textAnchor="middle" fontSize="10" fill="var(--tv-text-muted)" fontFamily="var(--font-body)">Good</text>
            </svg>
            <div className="donut-labels">
              <div style={{ fontSize: '22px', fontFamily: 'var(--font-display)', color: 'var(--tv-text-primary)', marginBottom: '4px' }}>{currency(creditCards.reduce((sum, c) => sum + (c.balance || 0), 0))}</div>
              <div style={{ fontSize: '12px', color: 'var(--tv-text-muted)', marginBottom: '12px' }}>of {currency(creditCards.reduce((sum, c) => sum + (c.creditLimit || c.balance || 0), 0))} limit used</div>
              <div className="badge badge-green"><i className="ti ti-check"></i> Below 30% — ideal</div>
            </div>
          </div>
        </div>

        {/* Upcoming Bills */}
        <div className="card">
          <div className="section-header">
            <div className="section-title">Upcoming bills</div>
            <a onClick={() => navigate('/billpay')} style={{ fontSize: '12.5px', color: 'var(--tv-forest-light)', cursor: 'pointer', fontWeight: '500' }}>View all →</a>
          </div>
          {upcomingBills.length === 0 ? (
            <div className="empty-state">
              <i className="ti ti-calendar-off"></i>
              <p>No upcoming bills.</p>
            </div>
          ) : (
            <>
              <div>
                {upcomingBills.map(bill => (
                  <div className="list-item" key={bill.id}>
                    <div className={`item-icon ${bill.iconClass}`}><i className={bill.icon}></i></div>
                    <div className="item-main">
                      <div className="item-name">{bill.name}</div>
                      <div className="item-sub">Due {bill.dueDate}</div>
                    </div>
                    <div className="item-right">
                      <div className="item-amount">{currency(bill.amount)}</div>
                      <button className="btn btn-primary btn-sm" style={{ marginTop: '4px', padding: '4px 10px', fontSize: '11.5px' }} onClick={() => handlePayBill(bill)}>Pay</button>
                    </div>
                  </div>
                ))}
              </div>
              <hr className="divider" />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: '600' }}>
                <span style={{ color: 'var(--tv-text-muted)' }}>Total due</span>
                <span>{currency(totalBillsDue)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid-2">
        {/* Recent Transactions */}
        <div className="card">
          <div className="section-header">
            <div className="section-title">Recent transactions</div>
            {/* Assuming there will be a transactions page to navigate to */}
            <a onClick={() => navigate('/transactions')} style={{ fontSize: '12.5px', color: 'var(--tv-forest-light)', cursor: 'pointer', fontWeight: '500' }}>View all →</a>
          </div>
          {transactions.slice(0, 4).map(tx => (
            <div className="list-item" key={tx.id}>
              <div className={`item-icon ${tx.amount >= 0 ? 'icon-green' : 'icon-red'}`}>
                <i className={tx.amount >= 0 ? 'ti ti-building-bank' : 'ti ti-shopping-bag'}></i>
              </div>
              <div className="item-main">
                <div className="item-name">{tx.description}</div>
                <div className="item-sub">{formatDate(tx.date)} · {tx.category}</div>
              </div>
              <div className="item-right">
                <div className={`item-amount ${tx.amount >= 0 ? 'amount-pos' : 'amount-neg'}`}>{currency(tx.amount)}</div>
              </div>
            </div>
          ))}
        </div>

        {/* AI Insights */}
        <div className="card" style={{ background: 'linear-gradient(145deg, var(--tv-sage-pale) 0%, var(--tv-white) 60%)' }}>
          <div className="section-header">
            <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i className="ti ti-sparkles" style={{ color: 'var(--tv-gold)' }}></i> AI Insights
            </div>
            <span className="badge badge-gold">Updated daily</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {aiInsights.length === 0 ? (
              <div className="empty-state">
                <i className="ti ti-sparkles"></i>
                <p>No insights yet. Link accounts and we'll surface personalized insights here.</p>
              </div>
            ) : aiInsights.map((insight, index) => (
              <div key={index} style={{ background: 'white', border: '1px solid var(--tv-border)', borderRadius: 'var(--radius-md)', padding: '14px' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <div className={`item-icon ${insight.type === 'positive' ? 'icon-green' : 'icon-red'}`} style={{ flexShrink: 0 }}>
                    <i className={insight.type === 'positive' ? 'ti ti-trending-up' : 'ti ti-credit-card'}></i>
                  </div>
                  <div>
                    <div style={{ fontSize: '13.5px', fontWeight: '600', marginBottom: '3px' }}>{insight.title}</div>
                    <div style={{ fontSize: '12.5px', color: 'var(--tv-text-muted)' }}>{insight.description}</div>
                    <a onClick={() => navigate('/ai-assistant')} style={{ fontSize: '12px', color: 'var(--tv-forest-light)', fontWeight: '500', cursor: 'pointer', display: 'block', marginTop: '5px' }}>See recommendation →</a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
