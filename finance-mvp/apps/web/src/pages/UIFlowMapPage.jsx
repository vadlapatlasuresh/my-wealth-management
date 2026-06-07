import React from 'react';
import { useNavigate } from 'react-router-dom';

/* The app's navigation architecture, mirroring the sidebar plus utility routes.
   Data-driven so it stays complete as features are added. */
const SECTIONS = [
  {
    label: 'Finance', color: 'var(--tv-forest)',
    items: [
      { to: '/', icon: 'ti ti-layout-dashboard', label: 'Home', sub: 'Dashboard' },
      { to: '/accounts', icon: 'ti ti-wallet', label: 'Accounts', sub: 'Linked banks' },
      { to: '/transactions', icon: 'ti ti-arrows-exchange-2', label: 'Transactions', sub: 'Search · sort · export' },
      { to: '/budget', icon: 'ti ti-chart-pie', label: 'Budgets', sub: 'Category limits' },
      { to: '/billpay', icon: 'ti ti-receipt', label: 'Pay Bills', sub: '5-step wizard' },
      { to: '/debt', icon: 'ti ti-trending-down', label: 'Debt Lab', sub: 'Strategy compare' },
      { to: '/invest', icon: 'ti ti-chart-line', label: 'Investments', sub: 'Portfolio' },
      { to: '/mybusiness', icon: 'ti ti-briefcase', label: 'My Business', sub: 'P&L · invoices' },
      { to: '/ai-assistant', icon: 'ti ti-sparkles', label: 'AI Assistant', sub: 'Insights · chat' },
    ],
  },
  {
    label: 'Real Estate', color: 'var(--tv-gold)',
    items: [
      { to: '/realestate', icon: 'ti ti-building-estate', label: 'Properties', sub: 'Value & equity' },
      { to: '/dealroom', icon: 'ti ti-briefcase', label: 'Deal Room', sub: 'Opportunity detail' },
      { to: '/fractional', icon: 'ti ti-brand-stackshare', label: 'Fractional LLC', sub: 'Co-investment' },
    ],
  },
  {
    label: 'Account & Help', color: 'var(--tv-forest-light)',
    items: [
      { to: '/security', icon: 'ti ti-shield-lock', label: 'Security', sub: '2FA · sessions' },
      { to: '/messages', icon: 'ti ti-message-2', label: 'Messages', sub: 'Inbox' },
      { to: '/settings', icon: 'ti ti-settings', label: 'Settings', sub: 'Preferences' },
      { to: '/profile', icon: 'ti ti-user', label: 'Profile', sub: 'Your account' },
      { to: '/guide', icon: 'ti ti-compass', label: 'How to use', sub: 'Feature guide' },
      { to: '/learn', icon: 'ti ti-book-2', label: 'Learn', sub: 'Education' },
    ],
  },
];

/* Key end-to-end journeys, as ordered steps. */
const JOURNEYS = [
  {
    title: 'Onboarding', icon: 'ti ti-rocket',
    steps: ['Sign up', 'Link account (Plaid)', 'Dashboard populates', 'Set a budget'],
  },
  {
    title: 'Pay a bill', icon: 'ti ti-receipt',
    steps: ['Pick card / biller', 'Amount', 'Funding account', 'Review', 'Done ✓'],
  },
  {
    title: 'Plan debt payoff', icon: 'ti ti-trending-down',
    steps: ['Add debts', 'Set extra payment', 'Run strategies', 'Compare savings'],
  },
  {
    title: 'Fractional invest', icon: 'ti ti-brand-stackshare',
    steps: ['Browse deals', 'Review docs', 'Invest', 'Track returns'],
  },
  {
    title: 'AI insight → action', icon: 'ti ti-sparkles',
    steps: ['Read insight', 'Ask assistant', 'Open suggested screen', 'Act'],
  },
];

export default function UIFlowMapPage() {
  const navigate = useNavigate();

  return (
    <div id="page-flowmap" className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">UI Flow Map</div>
          <div className="page-subtitle">Navigation architecture and key user journeys — click any node to open it</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/guide')}>
            <i className="ti ti-book-2"></i> Open the how-to guide
          </button>
        </div>
      </div>

      {/* Navigation architecture */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="section-title" style={{ marginBottom: 14 }}>Application navigation architecture</div>
        <div style={{ display: 'grid', gap: 18 }}>
          {SECTIONS.map((section) => (
            <div key={section.label}>
              <div className="guide-group-label" style={{ color: section.color }}>{section.label}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {section.items.map((item) => (
                  <button
                    key={item.to}
                    className="flow-node"
                    style={{ '--node-accent': section.color }}
                    onClick={() => navigate(item.to)}
                    title={`Open ${item.label}`}
                  >
                    <span className="flow-node-icon"><i className={item.icon}></i></span>
                    <span style={{ textAlign: 'left', minWidth: 0 }}>
                      <span className="flow-node-label">{item.label}</span>
                      <span className="flow-node-sub">{item.sub}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Key user journeys */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="section-title" style={{ marginBottom: 14 }}>Key user journeys</div>
        <div style={{ display: 'grid', gap: 16 }}>
          {JOURNEYS.map((j) => (
            <div key={j.title}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tv-text-secondary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className={j.icon} style={{ color: 'var(--tv-forest-light)' }}></i> {j.title}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                {j.steps.map((step, i) => (
                  <React.Fragment key={step}>
                    <span className={`flow-step ${i === j.steps.length - 1 ? 'flow-step-end' : ''}`}>{step}</span>
                    {i < j.steps.length - 1 && <i className="ti ti-arrow-right" style={{ color: 'var(--tv-text-muted)', fontSize: 14 }}></i>}
                  </React.Fragment>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Responsive notes */}
      <div className="card">
        <div className="section-title">Responsive &amp; mobile notes</div>
        <div className="grid-2" style={{ gap: '16px', marginTop: '4px' }}>
          <div>
            <div style={{ fontSize: '13.5px', fontWeight: '600', marginBottom: '8px' }}><i className="ti ti-device-desktop" style={{ marginRight: '6px', color: 'var(--tv-forest-light)' }}></i>Desktop (≥1024px)</div>
            <ul style={{ fontSize: '13px', color: 'var(--tv-text-secondary)', lineHeight: '2', paddingLeft: '18px' }}>
              <li>Full 228px sidebar always visible</li>
              <li>2–3 column content grids</li>
              <li>KPI row: 6 cards in one row</li>
              <li>Side-by-side chart + widget layouts</li>
            </ul>
          </div>
          <div>
            <div style={{ fontSize: '13.5px', fontWeight: '600', marginBottom: '8px' }}><i className="ti ti-device-mobile" style={{ marginRight: '6px', color: 'var(--tv-gold)' }}></i>Mobile (&lt;768px)</div>
            <ul style={{ fontSize: '13px', color: 'var(--tv-text-secondary)', lineHeight: '2', paddingLeft: '18px' }}>
              <li>Sidebar collapses to bottom nav bar</li>
              <li>Single-column stacked layout</li>
              <li>KPI row: 2×3 grid scrollable</li>
              <li>Modals slide up from bottom</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
