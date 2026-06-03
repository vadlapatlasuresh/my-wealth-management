import React from 'react';
import { currency, formatDate } from '../utils/format';

export default function MyBusinessPage({ user, formatDate }) {
  // Mock Data for "My Business" page
  const businessValuation = 1200000;
  const valuationChange30d = 100000; // Example change
  const totalLoans = 350000;
  const loansChange30d = -7000; // Example change (decrease)
  const netProfit = 85000;
  const netProfitChange30d = 11000; // Example change
  const growthPct = 0.12; // 12%
  const growthPctChange30d = 0.01; // 1% change

  const businessLoans = [
    { id: 'loan1', name: 'Business Loan A', balance: 200000, apr: 6.5, monthlyPayment: 2500, type: 'Term Loan' },
    { id: 'loan2', name: 'Business Loan B', balance: 150000, apr: 8.0, monthlyPayment: 1800, type: 'Line of Credit' },
  ];

  const profitLossSummary = {
    revenue: 150000,
    expenses: 65000,
    netProfit: 85000,
  };

  const aiInsight = {
    title: "Profit Margin Improvement",
    description: "Your business profit margin improved by 8% this year due to optimized operational costs.",
    type: "positive",
    link: "#",
  };

  const getDeltaClass = (value) => (value >= 0 ? "pos" : "neg");
  const getDeltaIcon = (value) =>
    value >= 0 ? "ti ti-arrow-up-right" : "ti ti-arrow-down-right";

  return (
    <div id="page-mybusiness" className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">My Business</div>
          <div className="page-subtitle">Dashboard for {user?.email ? user.email.split('@')[0] : 'Your'} Business</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary btn-sm">
            <i className="ti ti-plus"></i> Add Business Account
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">
            <i className="ti ti-building-bank" style={{ fontSize: '13px', color: 'var(--tv-forest-light)' }}></i> Business Valuation
          </div>
          <div className="kpi-value">{currency(businessValuation)}</div>
          <div className={`kpi-delta ${getDeltaClass(valuationChange30d)}`}>
            <i className={getDeltaIcon(valuationChange30d)}></i> {valuationChange30d >= 0 ? '+' : ''}{currency(valuationChange30d)} ({(valuationChange30d / (businessValuation - valuationChange30d) * 100).toFixed(1)}%) 30d
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">
            <i className="ti ti-credit-card" style={{ fontSize: '13px', color: 'var(--tv-negative)' }}></i> Total Loans
          </div>
          <div className="kpi-value">{currency(totalLoans)}</div>
          <div className={`kpi-delta ${getDeltaClass(loansChange30d)}`}>
            <i className={getDeltaIcon(loansChange30d)}></i> {loansChange30d >= 0 ? '+' : ''}{currency(loansChange30d)} ({(loansChange30d / (totalLoans - loansChange30d) * 100).toFixed(1)}%) 30d
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">
            <i className="ti ti-chart-line" style={{ fontSize: '13px', color: 'var(--tv-positive)' }}></i> Net Profit
          </div>
          <div className="kpi-value">{currency(netProfit)}</div>
          <div className={`kpi-delta ${getDeltaClass(netProfitChange30d)}`}>
            <i className={getDeltaIcon(netProfitChange30d)}></i> {netProfitChange30d >= 0 ? '+' : ''}{currency(netProfitChange30d)} ({(netProfitChange30d / (netProfit - netProfitChange30d) * 100).toFixed(1)}%) 30d
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">
            <i className="ti ti-trending-up" style={{ fontSize: '13px', color: 'var(--tv-gold)' }}></i> Growth %
          </div>
          <div className="kpi-value">{(growthPct * 100).toFixed(1)}%</div>
          <div className={`kpi-delta ${getDeltaClass(growthPctChange30d)}`}>
            <i className={getDeltaIcon(growthPctChange30d)}></i> {growthPctChange30d >= 0 ? '+' : ''}{(growthPctChange30d * 100).toFixed(1)}% 30d
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: '16px' }}>
        {/* Business Performance Chart */}
        <div className="card col-span-2">
          <div className="section-header">
            <div className="section-title">Business Performance Over Time</div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button className="btn btn-secondary btn-sm" style={{ padding: '4px 10px' }}>1M</button>
              <button className="btn btn-primary btn-sm" style={{ padding: '4px 10px', background: 'var(--tv-forest)' }}>3M</button>
              <button className="btn btn-secondary btn-sm" style={{ padding: '4px 10px' }}>1Y</button>
              <button className="btn btn-secondary btn-sm" style={{ padding: '4px 10px' }}>All</button>
            </div>
          </div>
          {/* Placeholder SVG chart - similar to NetWorthChart */}
          <div className="chart-wrap">
            <svg viewBox="0 0 800 200" xmlns="http://www.w3.org/2000/svg">
              {/* Grid lines */}
              <line x1="0" y1="170" x2="800" y2="170" stroke="#DDE5E1" strokeWidth="0.5"/>
              <line x1="0" y1="130" x2="800" y2="130" stroke="#DDE5E1" strokeWidth="0.5"/>
              <line x1="0" y1="90"  x2="800" y2="90"  stroke="#DDE5E1" strokeWidth="0.5"/>
              <line x1="0" y1="50"  x2="800" y2="50"  stroke="#DDE5E1" strokeWidth="0.5"/>
              {/* Y labels */}
              <text x="0" y="174" fontSize="10" fill="#7A9086" fontFamily="DM Sans,sans-serif">$0k</text>
              <text x="0" y="134" fontSize="10" fill="#7A9086" fontFamily="DM Sans,sans-serif">$25k</text>
              <text x="0" y="94"  fontSize="10" fill="#7A9086" fontFamily="DM Sans,sans-serif">$50k</text>
              <text x="0" y="54"  fontSize="10" fill="#7A9086" fontFamily="DM Sans,sans-serif">$75k</text>
              {/* Area fill */}
              <defs>
                <linearGradient id="businessChartGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1A4D3B" stopOpacity="0.12"/>
                  <stop offset="100%" stopColor="#1A4D3B" stopOpacity="0"/>
                </linearGradient>
              </defs>
              <path d="M40,160 C60,155 100,140 140,130 C180,120 200,115 240,105 C280,95 300,90 340,80 C380,70 400,65 440,55 C480,45 500,40 540,35 C580,30 600,28 640,25 C680,22 720,20 760,15 L760,190 L40,190 Z" fill="url(#businessChartGrad)"/>
              {/* Line */}
              <path d="M40,160 C60,155 100,140 140,130 C180,120 200,115 240,105 C280,95 300,90 340,80 C380,70 400,65 440,55 C480,45 500,40 540,35 C580,30 600,28 640,25 C680,22 720,20 760,15" fill="none" stroke="#1A4D3B" strokeWidth="2.5" strokeLinecap="round"/>
              {/* Endpoint dot */}
              <circle cx="760" cy="15" r="5" fill="#1A4D3B"/>
              <circle cx="760" cy="15" r="9" fill="none" stroke="#1A4D3B" strokeWidth="1.5" opacity="0.3"/>
              {/* Tooltip callout */}
              <rect x="680" y="-5" width="105" height="26" rx="6" fill="#1A4D3B"/>
              <text x="732" y="12" textAnchor="middle" fontSize="11" fill="white" fontFamily="DM Sans,sans-serif" fontWeight="600">{currency(netProfit)}</text>
              {/* X labels */}
              <text x="40"  y="195" fontSize="10" fill="#7A9086" textAnchor="middle" fontFamily="DM Sans,sans-serif">Jan</text>
              <text x="200" y="195" fontSize="10" fill="#7A9086" textAnchor="middle" fontFamily="DM Sans,sans-serif">Mar</text>
              <text x="400" y="195" fontSize="10" fill="#7A9086" textAnchor="middle" fontFamily="DM Sans,sans-serif">May</text>
              <text x="600" y="195" fontSize="10" fill="#7A9086" textAnchor="middle" fontFamily="DM Sans,sans-serif">Jul</text>
              <text x="760" y="195" fontSize="10" fill="#7A9086" textAnchor="middle" fontFamily="DM Sans,sans-serif">Now</text>
            </svg>
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: '16px' }}>
        {/* Loan Breakdown */}
        <div className="card">
          <div className="section-title">Loan Breakdown</div>
          {businessLoans.map(loan => (
            <div className="list-item" key={loan.id}>
              <div className="item-icon icon-red"><i className="ti ti-currency-dollar"></i></div>
              <div className="item-main">
                <div className="item-name">{loan.name}</div>
                <div className="item-sub">{loan.type} · {loan.apr}% APR</div>
              </div>
              <div className="item-right">
                <div className="item-amount amount-neg">{currency(loan.balance)}</div>
                <div className="item-meta">Monthly: {currency(loan.monthlyPayment)}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Profit vs Loss Summary */}
        <div className="card">
          <div className="section-title">Profit vs Loss Summary</div>
          <div className="list-item">
            <div className="item-icon icon-green"><i className="ti ti-arrow-up"></i></div>
            <div className="item-main"><div className="item-name">Revenue</div></div>
            <div className="item-right"><div className="item-amount amount-pos">{currency(profitLossSummary.revenue)}</div></div>
          </div>
          <div className="list-item">
            <div className="item-icon icon-red"><i className="ti ti-arrow-down"></i></div>
            <div className="item-main"><div className="item-name">Expenses</div></div>
            <div className="item-right"><div className="item-amount amount-neg">{currency(profitLossSummary.expenses)}</div></div>
          </div>
          <hr className="divider" />
          <div className="list-item">
            <div className="item-icon icon-forest"><i className="ti ti-chart-bar"></i></div>
            <div className="item-main"><div className="item-name">Net Profit</div></div>
            <div className="item-right"><div className="item-amount amount-pos">{currency(profitLossSummary.netProfit)}</div></div>
          </div>
        </div>
      </div>

      {/* AI Insight Block */}
      <div className="card" style={{ background: 'linear-gradient(145deg, var(--tv-sage-pale) 0%, var(--tv-white) 60%)' }}>
        <div className="section-header">
          <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <i className="ti ti-sparkles" style={{ color: 'var(--tv-gold)' }}></i> AI Insight
          </div>
          <span className="badge badge-gold">Daily</span>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
          <div className={`item-icon ${aiInsight.type === 'positive' ? 'icon-green' : 'icon-red'}`} style={{ flexShrink: 0 }}>
            <i className={aiInsight.type === 'positive' ? 'ti ti-trending-up' : 'ti ti-credit-card'}></i>
          </div>
          <div>
            <div style={{ fontSize: '13.5px', fontWeight: '600', marginBottom: '3px' }}>{aiInsight.title}</div>
            <div style={{ fontSize: '12.5px', color: 'var(--tv-text-muted)' }}>{aiInsight.description}</div>
            <a href={aiInsight.link} style={{ fontSize: '12px', color: 'var(--tv-forest-light)', fontWeight: '500', cursor: 'pointer', display: 'block', marginTop: '5px' }}>View details →</a>
          </div>
        </div>
      </div>
    </div>
  );
}