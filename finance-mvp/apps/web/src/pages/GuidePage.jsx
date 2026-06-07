import { useNavigate } from 'react-router-dom';

/* Feature walkthrough content, grouped to mirror the sidebar.
   Each entry: where it lives (to), an icon + color, a one-line "what it is",
   and the concrete steps to use it. This doubles as a product demo script. */
const GUIDE_GROUPS = [
  {
    label: 'Finance',
    features: [
      {
        to: '/', icon: 'ti ti-layout-dashboard', cls: 'icon-forest', title: 'Home dashboard',
        what: 'Your whole financial picture in one view.',
        steps: [
          'See net worth plus KPIs for cash, investments, real estate and debt.',
          'Click any KPI card to jump straight to its detail screen.',
          'Switch the net-worth chart range (1H → All) or pick a custom range.',
          'Pay an upcoming bill or review recent activity without leaving Home.',
        ],
      },
      {
        to: '/accounts', icon: 'ti ti-wallet', cls: 'icon-blue', title: 'Accounts',
        what: 'Every linked bank, card and balance, grouped by type.',
        steps: [
          'Click "Link account" and connect through Plaid.',
          'In the sandbox use bank login user_good / pass_good (OTP 123456).',
          'Review grouped balances and per-group KPIs.',
          'Hit Refresh any time to re-sync the latest balances.',
        ],
      },
      {
        to: '/transactions', icon: 'ti ti-arrows-exchange-2', cls: 'icon-green', title: 'Transactions',
        what: 'Search, filter, sort and export all your activity.',
        steps: [
          'Search by description or category.',
          'Filter by category, direction (income/spending), date and amount.',
          'Click a column header to sort; click again to flip direction.',
          'Export the current filtered view to CSV.',
        ],
      },
      {
        to: '/budget', icon: 'ti ti-chart-pie', cls: 'icon-amber', title: 'Budgets',
        what: 'Set monthly category limits and track spending against them.',
        steps: [
          'Pick the month you want to plan.',
          'Add a category and set its monthly limit.',
          'Watch progress bars fill as spending comes in.',
          'Apply a rule preset (e.g. 50/30/20) to start fast.',
        ],
      },
      {
        to: '/billpay', icon: 'ti ti-receipt', cls: 'icon-forest', title: 'Pay Bills',
        what: 'A guided wizard to pay a card or an external biller.',
        steps: [
          'Choose to pay one of your cards or an outside biller.',
          'Enter the amount and the funding account.',
          'Pay now or schedule it for later.',
          'Review, confirm, and track the pending payment.',
        ],
      },
      {
        to: '/debt', icon: 'ti ti-trending-down', cls: 'icon-red', title: 'Debt Lab',
        what: 'Compare payoff strategies and see interest saved.',
        steps: [
          'Add your debts (balance, rate, minimum).',
          'Set an extra monthly payment amount.',
          'Run Avalanche, Snowball and Hybrid scenarios.',
          'Compare payoff time and total interest side by side.',
        ],
      },
      {
        to: '/invest', icon: 'ti ti-chart-line', cls: 'icon-purple', title: 'Investments',
        what: 'Holdings, linked brokers, alternatives and the marketplace.',
        steps: [
          'View holdings and your allocation breakdown.',
          'Link a brokerage to pull positions.',
          'Add alternative assets you hold elsewhere.',
          'Browse marketplace offerings.',
        ],
      },
      {
        to: '/mybusiness', icon: 'ti ti-briefcase', cls: 'icon-blue', title: 'My Business',
        what: 'QuickBooks-style financials for your company.',
        steps: [
          'Connect a business profile.',
          'Review the P&L for MTD or YTD.',
          'Open invoices and expenses.',
          'Switch between multiple businesses.',
        ],
      },
      {
        to: '/ai-assistant', icon: 'ti ti-sparkles', cls: 'icon-amber', title: 'AI Assistant',
        what: 'Personalized insights and a chat that knows your money.',
        steps: [
          'Read the daily insight cards.',
          'Choose which areas (scopes) the assistant can see.',
          'Ask a question or tap a suggested prompt.',
          'Follow the recommendation through to the right screen.',
        ],
      },
    ],
  },
  {
    label: 'Real Estate',
    features: [
      {
        to: '/realestate', icon: 'ti ti-building-estate', cls: 'icon-amber', title: 'Properties',
        what: 'Track each property’s value, mortgage and equity.',
        steps: [
          'Add a property using address autocomplete.',
          'Get an automated valuation estimate.',
          'See current value, mortgage balance and equity.',
          'Re-value any time to refresh the estimate.',
        ],
      },
      {
        to: '/dealroom', icon: 'ti ti-briefcase', cls: 'icon-forest', title: 'Deal Room',
        what: 'Review a co-investment opportunity end to end.',
        steps: [
          'Read the deal terms, projected returns and risk factors.',
          'Open and acknowledge the deal documents.',
          'Subscribe to receive deal updates.',
          'Express interest when you’re ready.',
        ],
      },
      {
        to: '/fractional', icon: 'ti ti-brand-stackshare', cls: 'icon-purple', title: 'Fractional LLC',
        what: 'Co-invest in property through fractional shares.',
        steps: [
          'Tap “How it works” for a quick primer.',
          'Browse open offerings in the marketplace.',
          'Invest from the listed minimum.',
          'Track your holdings and returns in the portfolio.',
        ],
      },
    ],
  },
  {
    label: 'Account & Help',
    features: [
      {
        to: '/security', icon: 'ti ti-shield-lock', cls: 'icon-forest', title: 'Security',
        what: 'Keep your account protected.',
        steps: [
          'Enable two-factor authentication.',
          'Change your password.',
          'Review active sessions and login history.',
          'Revoke any device you don’t recognise.',
        ],
      },
      {
        to: '/messages', icon: 'ti ti-message-2', cls: 'icon-blue', title: 'Messages',
        what: 'Your notification inbox.',
        steps: [
          'Read alerts and statements.',
          'Filter by read / unread.',
          'Mark items as read.',
          'Search to find a specific message.',
        ],
      },
      {
        to: '/settings', icon: 'ti ti-settings', cls: 'icon-green', title: 'Settings',
        what: 'Preferences, notifications and your data.',
        steps: [
          'Toggle email, push and alert preferences.',
          'Set appearance (Compact mode) and your region.',
          'Export your data or download a statement.',
          'Manage account-level options.',
        ],
      },
      {
        to: '/learn', icon: 'ti ti-book-2', cls: 'icon-amber', title: 'Learn',
        what: 'Bite-sized financial education modules.',
        steps: [
          'Browse the available modules.',
          'Open a lesson to start learning.',
          'Track your progress as you complete modules.',
        ],
      },
    ],
  },
];

function FeatureCard({ feature, onOpen }) {
  return (
    <div className="card guide-card">
      <div className="guide-card-head">
        <div className={`item-icon ${feature.cls}`} style={{ width: 40, height: 40, fontSize: 19, flexShrink: 0 }}>
          <i className={feature.icon}></i>
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="guide-card-title">{feature.title}</div>
          <div className="guide-card-what">{feature.what}</div>
        </div>
      </div>
      <ol className="guide-steps">
        {feature.steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      <button className="btn btn-secondary btn-sm" onClick={() => onOpen(feature.to)} style={{ marginTop: 'auto' }}>
        Open {feature.title} <i className="ti ti-arrow-right"></i>
      </button>
    </div>
  );
}

export default function GuidePage() {
  const navigate = useNavigate();
  const featureCount = GUIDE_GROUPS.reduce((n, g) => n + g.features.length, 0);

  return (
    <div id="page-guide" className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">How to use TerraVest</div>
          <div className="page-subtitle">
            A guided tour of all {featureCount} features — what each one does and how to use it.
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/flowmap')}>
            <i className="ti ti-sitemap"></i> View flow map
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/')}>
            <i className="ti ti-layout-dashboard"></i> Go to dashboard
          </button>
        </div>
      </div>

      {/* Quick-start banner */}
      <div className="card" style={{ marginBottom: 20, background: 'linear-gradient(135deg, var(--tv-forest) 0%, var(--tv-forest-mid) 100%)', color: '#fff', border: 'none' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div style={{ fontSize: 26, lineHeight: 1 }}><i className="ti ti-rocket" style={{ color: 'var(--tv-gold-light)' }}></i></div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, marginBottom: 6 }}>New here? Start in 3 steps</div>
            <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9, color: 'rgba(255,255,255,.9)', fontSize: 13.5 }}>
              <li><strong>Link an account</strong> on the Accounts page (sandbox: user_good / pass_good).</li>
              <li><strong>Check your dashboard</strong> — net worth and balances populate automatically.</li>
              <li><strong>Set a budget and ask the AI Assistant</strong> what to optimize first.</li>
            </ol>
            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <button className="btn btn-gold btn-sm" onClick={() => navigate('/accounts')}>
                <i className="ti ti-plus"></i> Link your first account
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => navigate('/ai-assistant')}>
                <i className="ti ti-sparkles"></i> Ask the AI Assistant
              </button>
            </div>
          </div>
        </div>
      </div>

      {GUIDE_GROUPS.map((group) => (
        <div key={group.label} style={{ marginBottom: 24 }}>
          <div className="guide-group-label">{group.label}</div>
          <div className="guide-grid">
            {group.features.map((f) => (
              <FeatureCard key={f.to + f.title} feature={f} onOpen={(to) => navigate(to)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
