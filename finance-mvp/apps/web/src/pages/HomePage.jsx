import { useState } from "react";
import { useNavigate } from "react-router-dom";
import NetWorthChart from "../components/NetWorthChart";
// import RealEstateWidget from "../components/RealEstateWidget"; // Removed
import { currency } from "../utils/format"; // formatDate is now passed as a prop
import LastRefreshed from "../components/LastRefreshed";
import { api } from "../api";

const RANGES = ["1H", "1D", "1W", "1M", "3M", "1Y", "All"];

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
  formatDate // Passed as prop from AppLayout
}) {
  const navigate = useNavigate();
  const [range, setRange] = useState("3M");
  const [chartSnapshot, setChartSnapshot] = useState(null);
  const [showCustom, setShowCustom] = useState(false);
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

  const realEstateEquity = properties.reduce((sum, p) => sum + (p.equity || 0), 0);
  const totalRealEstateValue = properties.reduce((sum, p) => sum + (p.currentValue || 0), 0);
  // const totalAssets = (snapshot?.components?.cash || 0) + (snapshot?.components?.investments || 0) + totalRealEstateValue; // Not directly used in new KPI grid

  const getDeltaClass = (value) => (value >= 0 ? "pos" : "neg");
  const getDeltaIcon = (value) =>
    value >= 0 ? "ti ti-arrow-up-right" : "ti ti-arrow-down-right";

  // Mock data for upcoming bills for now, will be replaced with actual data from props
  const upcomingBills = [
    { id: 'mortgage', name: 'Mortgage', dueDate: 'Jun 15', amount: 1842.00, icon: 'ti ti-home', iconClass: 'icon-forest' },
    { id: 'electricity', name: 'Electricity', dueDate: 'Jun 17', amount: 87.64, icon: 'ti ti-bolt', iconClass: 'icon-amber' },
    { id: 'internet', name: 'Internet', dueDate: 'Jun 21', amount: 65.00, icon: 'ti ti-wifi', iconClass: 'icon-blue' },
  ];
  const totalBillsDue = upcomingBills.reduce((sum, bill) => sum + bill.amount, 0);

  // Mock AI Insights for now, will be replaced with actual data from props
  const aiInsights = insights.slice(0, 2); // Take top 2 insights

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Good morning, {user?.name || (user?.email ? user.email.split('@')[0] : 'there')}</div>
          <div className="page-subtitle">
            {formatDate(new Date())} &mdash; Here's your financial picture
          </div>
        </div>
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
        <div className="kpi-card kpi-clickable" style={{ cursor: 'pointer' }} title="View accounts" onClick={() => navigate('/accounts')}>
          <div className="kpi-label">
            <i className="ti ti-trending-up" style={{ fontSize: '13px', color: 'var(--tv-forest-light)' }}></i> Net Worth
            <i className="ti ti-chevron-right" style={{ marginLeft: 'auto', fontSize: '13px', color: 'var(--tv-text-muted)' }}></i>
          </div>
          <div className="kpi-value">{currency(netTotal)}</div>
          <div className={`kpi-delta ${getDeltaClass(change30)}`}>
            <i className={getDeltaIcon(change30)}></i> {currency(change30)} ({(change30 / (netTotal - change30) * 100).toFixed(1)}%) 30d
          </div>
        </div>
        <div className="kpi-card kpi-clickable" title="View accounts" onClick={() => navigate('/accounts')}>
          <div className="kpi-label">
            <i className="ti ti-wallet" style={{ fontSize: '13px', color: '#1E5FAD' }}></i> Cash
            <i className="ti ti-chevron-right" style={{ marginLeft: 'auto', fontSize: '13px', color: 'var(--tv-text-muted)' }}></i>
          </div>
          <div className="kpi-value">{currency(snapshot?.components?.cash ?? 0)}</div>
          <div className={`kpi-delta ${getDeltaClass(snapshot?.components?.cash_change_30d ?? 0)}`}>
            <i className={getDeltaIcon(snapshot?.components?.cash_change_30d ?? 0)}></i> {currency(snapshot?.components?.cash_change_30d ?? 0)} ({(snapshot?.components?.cash_change_30d / ((snapshot?.components?.cash ?? 0) - (snapshot?.components?.cash_change_30d ?? 0)) * 100).toFixed(1)}%) 30d
          </div>
        </div>
        <div className="kpi-card kpi-clickable" title="View investments" onClick={() => navigate('/invest')}>
          <div className="kpi-label">
            <i className="ti ti-chart-line" style={{ fontSize: '13px', color: '#6B46C1' }}></i> Investments
            <i className="ti ti-chevron-right" style={{ marginLeft: 'auto', fontSize: '13px', color: 'var(--tv-text-muted)' }}></i>
          </div>
          <div className="kpi-value">{currency(snapshot?.components?.investments ?? 0)}</div>
          <div className={`kpi-delta ${getDeltaClass(snapshot?.components?.investments_change_30d ?? 0)}`}>
            <i className={getDeltaIcon(snapshot?.components?.investments_change_30d ?? 0)}></i> {currency(snapshot?.components?.investments_change_30d ?? 0)} ({(snapshot?.components?.investments_change_30d / ((snapshot?.components?.investments ?? 0) - (snapshot?.components?.investments_change_30d ?? 0)) * 100).toFixed(1)}%) 30d
          </div>
        </div>
        <div className="kpi-card kpi-clickable" title="View properties" onClick={() => navigate('/realestate')}>
          <div className="kpi-label">
            <i className="ti ti-building-estate" style={{ fontSize: '13px', color: 'var(--tv-gold)' }}></i> Real Estate
            <i className="ti ti-chevron-right" style={{ marginLeft: 'auto', fontSize: '13px', color: 'var(--tv-text-muted)' }}></i>
          </div>
          <div className="kpi-value">{currency(totalRealEstateValue)}</div>
          <div className={`kpi-delta ${getDeltaClass(snapshot?.components?.real_estate_value_change_30d ?? 0)}`}>
            <i className={getDeltaIcon(snapshot?.components?.real_estate_value_change_30d ?? 0)}></i> {currency(snapshot?.components?.real_estate_value_change_30d ?? 0)} ({(snapshot?.components?.real_estate_value_change_30d / (totalRealEstateValue - (snapshot?.components?.real_estate_value_change_30d ?? 0)) * 100).toFixed(1)}%) 30d
          </div>
        </div>
        <div className="kpi-card kpi-clickable" title="View properties" onClick={() => navigate('/realestate')}>
          <div className="kpi-label">
            <i className="ti ti-home-dollar" style={{ fontSize: '13px', color: 'var(--tv-forest-light)' }}></i> RE Equity
            <i className="ti ti-chevron-right" style={{ marginLeft: 'auto', fontSize: '13px', color: 'var(--tv-text-muted)' }}></i>
          </div>
          <div className="kpi-value">{currency(realEstateEquity)}</div>
          <div className={`kpi-delta ${getDeltaClass(snapshot?.components?.real_estate_equity_change_30d ?? 0)}`}>
            <i className={getDeltaIcon(snapshot?.components?.real_estate_equity_change_30d ?? 0)}></i> {currency(snapshot?.components?.real_estate_equity_change_30d ?? 0)} ({(snapshot?.components?.real_estate_equity_change_30d / (realEstateEquity - (snapshot?.components?.real_estate_equity_change_30d ?? 0)) * 100).toFixed(1)}%) 30d
          </div>
        </div>
        <div className="kpi-card kpi-clickable" title="Go to Debt Lab" onClick={() => navigate('/debt')}>
          <div className="kpi-label">
            <i className="ti ti-credit-card" style={{ fontSize: '13px', color: 'var(--tv-negative)' }}></i> Total Debt
            <i className="ti ti-chevron-right" style={{ marginLeft: 'auto', fontSize: '13px', color: 'var(--tv-text-muted)' }}></i>
          </div>
          <div className="kpi-value">{currency(snapshot?.components?.credit_cards ?? 0)}</div>
          <div className={`kpi-delta ${getDeltaClass(snapshot?.components?.credit_cards_change_30d ?? 0)}`}>
            <i className={getDeltaIcon(snapshot?.components?.credit_cards_change_30d ?? 0)}></i> {currency(snapshot?.components?.credit_cards_change_30d ?? 0)} ({(snapshot?.components?.credit_cards_change_30d / ((snapshot?.components?.credit_cards ?? 0) - (snapshot?.components?.credit_cards_change_30d ?? 0)) * 100).toFixed(1)}%) 30d
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid-2" style={{ marginBottom: '16px' }}>
        {/* Net Worth Chart */}
        <div className="card col-span-2">
          <div className="section-header">
            <div className="section-title">Net worth over time</div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', position: 'relative', flexWrap: 'wrap' }}>
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
          {/* NetWorthChart component will need to be updated to match the new SVG design */}
          <NetWorthChart total={chartTotal} change30d={chartChange} series={chartSeries} />
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
            {aiInsights.map((insight, index) => (
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
