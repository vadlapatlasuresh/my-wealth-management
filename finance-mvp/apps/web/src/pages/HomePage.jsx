import NetWorthChart from "../components/NetWorthChart";
// import RealEstateWidget from "../components/RealEstateWidget"; // Removed
import { currency } from "../utils/format"; // formatDate is now passed as a prop

export default function HomePage({
  snapshot,
  accounts = [],
  transactions = [],
  creditCards = [],
  properties = [],
  onPay,
  // onSync, // Removed
  user, // Added user prop
  insights = [], // Added insights prop
  formatDate // Passed as prop from AppLayout
}) {
  const totalUtil =
    creditCards.length > 0
      ? creditCards.reduce(
          (s, c) => s + (c.balance || 0) / (c.creditLimit || c.balance || 1),
          0
        ) / creditCards.length
      : 0;

  const netTotal = snapshot?.net_worth?.total ?? 0;
  const change30 = snapshot?.net_worth?.change_30d ?? 0;

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
          <div className="page-title">Good morning, {user?.email ? user.email.split('@')[0] : 'Alex'}</div>
          <div className="page-subtitle">
            {formatDate(new Date())} &mdash; Here's your financial picture
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm">
            <i className="ti ti-download"></i> Export
          </button>
          <button className="btn btn-primary btn-sm">
            <i className="ti ti-plus"></i> Add Account
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">
            <i className="ti ti-trending-up" style={{ fontSize: '13px', color: 'var(--tv-forest-light)' }}></i> Net Worth
          </div>
          <div className="kpi-value">{currency(netTotal)}</div>
          <div className={`kpi-delta ${getDeltaClass(change30)}`}>
            <i className={getDeltaIcon(change30)}></i> {currency(change30)} ({(change30 / (netTotal - change30) * 100).toFixed(1)}%) 30d
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">
            <i className="ti ti-wallet" style={{ fontSize: '13px', color: '#1E5FAD' }}></i> Cash
          </div>
          <div className="kpi-value">{currency(snapshot?.components?.cash ?? 0)}</div>
          <div className={`kpi-delta ${getDeltaClass(snapshot?.components?.cash_change_30d ?? 0)}`}>
            <i className={getDeltaIcon(snapshot?.components?.cash_change_30d ?? 0)}></i> {currency(snapshot?.components?.cash_change_30d ?? 0)} ({(snapshot?.components?.cash_change_30d / ((snapshot?.components?.cash ?? 0) - (snapshot?.components?.cash_change_30d ?? 0)) * 100).toFixed(1)}%) 30d
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">
            <i className="ti ti-chart-line" style={{ fontSize: '13px', color: '#6B46C1' }}></i> Investments
          </div>
          <div className="kpi-value">{currency(snapshot?.components?.investments ?? 0)}</div>
          <div className={`kpi-delta ${getDeltaClass(snapshot?.components?.investments_change_30d ?? 0)}`}>
            <i className={getDeltaIcon(snapshot?.components?.investments_change_30d ?? 0)}></i> {currency(snapshot?.components?.investments_change_30d ?? 0)} ({(snapshot?.components?.investments_change_30d / ((snapshot?.components?.investments ?? 0) - (snapshot?.components?.investments_change_30d ?? 0)) * 100).toFixed(1)}%) 30d
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">
            <i className="ti ti-building-estate" style={{ fontSize: '13px', color: 'var(--tv-gold)' }}></i> Real Estate
          </div>
          <div className="kpi-value">{currency(totalRealEstateValue)}</div>
          <div className={`kpi-delta ${getDeltaClass(snapshot?.components?.real_estate_value_change_30d ?? 0)}`}>
            <i className={getDeltaIcon(snapshot?.components?.real_estate_value_change_30d ?? 0)}></i> {currency(snapshot?.components?.real_estate_value_change_30d ?? 0)} ({(snapshot?.components?.real_estate_value_change_30d / (totalRealEstateValue - (snapshot?.components?.real_estate_value_change_30d ?? 0)) * 100).toFixed(1)}%) 30d
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">
            <i className="ti ti-home-dollar" style={{ fontSize: '13px', color: 'var(--tv-forest-light)' }}></i> RE Equity
          </div>
          <div className="kpi-value">{currency(realEstateEquity)}</div>
          <div className={`kpi-delta ${getDeltaClass(snapshot?.components?.real_estate_equity_change_30d ?? 0)}`}>
            <i className={getDeltaIcon(snapshot?.components?.real_estate_equity_change_30d ?? 0)}></i> {currency(snapshot?.components?.real_estate_equity_change_30d ?? 0)} ({(snapshot?.components?.real_estate_equity_change_30d / (realEstateEquity - (snapshot?.components?.real_estate_equity_change_30d ?? 0)) * 100).toFixed(1)}%) 30d
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">
            <i className="ti ti-credit-card" style={{ fontSize: '13px', color: 'var(--tv-negative)' }}></i> Total Debt
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
            <div style={{ display: 'flex', gap: '6px' }}>
              <button className="btn btn-secondary btn-sm" style={{ padding: '4px 10px' }}>1M</button>
              <button className="btn btn-primary btn-sm" style={{ padding: '4px 10px', background: 'var(--tv-forest)' }}>3M</button>
              <button className="btn btn-secondary btn-sm" style={{ padding: '4px 10px' }}>1Y</button>
              <button className="btn btn-secondary btn-sm" style={{ padding: '4px 10px' }}>All</button>
            </div>
          </div>
          {/* NetWorthChart component will need to be updated to match the new SVG design */}
          <NetWorthChart total={netTotal} change30d={change30} series={snapshot?.series} />
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
            <a onClick={onPay} style={{ fontSize: '12.5px', color: 'var(--tv-forest-light)', cursor: 'pointer', fontWeight: '500' }}>View all →</a>
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
                  <button className="btn btn-primary btn-sm" style={{ marginTop: '4px', padding: '4px 10px', fontSize: '11.5px' }} onClick={onPay}>Pay</button>
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
            <a href="/transactions" style={{ fontSize: '12.5px', color: 'var(--tv-forest-light)', cursor: 'pointer', fontWeight: '500' }}>View all →</a>
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
                    <a href={insight.link} style={{ fontSize: '12px', color: 'var(--tv-forest-light)', fontWeight: '500', cursor: 'pointer', display: 'block', marginTop: '5px' }}>See recommendation →</a>
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
