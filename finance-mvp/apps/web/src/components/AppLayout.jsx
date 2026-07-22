import React, { useState, useEffect, useRef } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  NavLink,
  Navigate,
  useLocation,
  useNavigate
} from 'react-router-dom';
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { getTheme, applyTheme, nextTheme, THEME_META } from "../theme";
import { useRemoteConfig, resolveNav } from "../config/remoteConfig";
import { MODULE_REGISTRY } from "../config/moduleRegistry";
import { SubscriptionProvider, FeatureGate, TrialBanner, TrialOnboardingModal } from "../config/subscription";
import LanguageSwitcher from "./LanguageSwitcher";
import { setupAutoTranslate } from "../i18n/domTranslator";

// Lazy page components come from the module registry so modules code-split.
const TodayPage       = MODULE_REGISTRY.today.component;
const RecurringPage   = MODULE_REGISTRY.recurring.component;
const HealthScorePage = MODULE_REGISTRY.healthscore.component;
const CashFlowPage    = MODULE_REGISTRY.cashflow.component;
const AlertsPage      = MODULE_REGISTRY.alerts.component;
const SpendingPage    = MODULE_REGISTRY.spending.component;
const EmergencyFundPage = MODULE_REGISTRY.emergencyfund.component;
const CoachPage       = MODULE_REGISTRY.coach.component;
const HouseholdPage   = MODULE_REGISTRY.household.component;
const SharedMoneyPage = MODULE_REGISTRY.sharedmoney.component;
const HomePage        = MODULE_REGISTRY.home.component;
const AccountsPage    = MODULE_REGISTRY.accounts.component;
const TransactionsPage = MODULE_REGISTRY.transactions.component;
const InvestPage      = MODULE_REGISTRY.invest.component;
const PlanPage        = MODULE_REGISTRY.budget.component;
const MakePaymentPage = MODULE_REGISTRY.billpay.component;
const LearnPage       = MODULE_REGISTRY.learn.component;
const ProfilePage     = MODULE_REGISTRY.profile.component;
const RealEstatePage  = MODULE_REGISTRY.realestate.component;
const DealRoomPage    = MODULE_REGISTRY.dealroom.component;
const StyleGuidePage  = MODULE_REGISTRY.styleguide.component;
const UIFlowMapPage   = MODULE_REGISTRY.flowmap.component;
const GuidePage       = MODULE_REGISTRY.guide.component;
const MyBusinessPage  = MODULE_REGISTRY.mybusiness.component;
const AIAssistantPage = MODULE_REGISTRY['ai-assistant'].component;
const CalculatorsPage = MODULE_REGISTRY.calculators.component;
const GoalsPage       = MODULE_REGISTRY.goals.component;
const TaxPage         = MODULE_REGISTRY.tax.component;
const CpaMarketplacePage = MODULE_REGISTRY.cpa.component;
const FractionalLLCPage = MODULE_REGISTRY.fractional.component;
const SecurityPage    = MODULE_REGISTRY.security.component;
const MessagesPage    = MODULE_REGISTRY.messages.component;
const SettingsPage    = MODULE_REGISTRY.settings.component;
const DocumentCenterPage = MODULE_REGISTRY.documents.component;
const SubscriptionPage = MODULE_REGISTRY.subscription.component;
const PlanTierPage    = MODULE_REGISTRY.plantier.component;


const navLabels = {
  '/today': 'Today',
  '/alerts': 'Alerts',
  '/': 'Home',
  '/accounts': 'Accounts',
  '/transactions': 'Transactions',
  '/budget': 'Budgets',
  '/make-payment': 'Make Payment',
  '/recurring': 'Recurring',
  '/health-score': 'Health Score',
  '/cash-flow': 'Cash Flow',
  '/spending': 'Spending',
  '/emergency-fund': 'Emergency Fund',
  '/coach': 'Coach',
  '/household': 'Household',
  '/shared-money': 'Goals & Bills',
  '/debt': 'Debt Lab',
  '/invest': 'Investments',
  '/mybusiness': 'My Business',
  '/documents': 'Documents',
  '/ai-assistant': 'AI Assistant',
  '/calculators': 'Calculators',
  '/goals': 'Goals',
  '/tax': 'Taxes',
  '/cpa': 'Find a CPA',
  '/realestate': 'Properties',
  '/dealroom': 'Deal Room',
  '/fractional': 'Fractional LLC',
  '/security': 'Security',
  '/messages': 'Messages',
  '/settings': 'Settings',
  '/subscription': 'Subscription',
  '/styleguide': 'Style Guide',
  '/flowmap': 'UI Flow Map',
  '/guide': 'How to use',
  '/profile': 'Profile',
  '/admin': 'Admin · Analytics',
};

// Map a route path to its translation key id (used to localize the topbar page
// label). Falls back to the English navLabels value when no key exists.
const PATH_TO_NAVID = {
  '/': 'home', '/accounts': 'accounts', '/transactions': 'transactions',
  '/budget': 'budget', '/make-payment': 'billpay', '/debt': 'debt',
  '/invest': 'invest', '/mybusiness': 'mybusiness', '/ai-assistant': 'ai-assistant',
  '/calculators': 'calculators', '/goals': 'goals', '/tax': 'tax', '/cpa': 'cpa',
  '/realestate': 'realestate', '/dealroom': 'dealroom', '/fractional': 'fractional',
  '/documents': 'documents', '/subscription': 'subscription',
  '/security': 'security', '/messages': 'messages', '/settings': 'settings',
  '/styleguide': 'styleguide', '/flowmap': 'flowmap', '/guide': 'guide',
  '/profile': 'profile', '/learn': 'learn',
};

/* Sidebar navigation is now config-driven: the sections + items are resolved
   from the remote config intersected with the module registry (see
   resolveNav). If the remote config is unavailable, resolveNav falls back to
   the bundled DEFAULT, which reproduces exactly the previous hardcoded nav. */

function Sidebar({ user, handleLogout, paymentIntents, navSections, onNavigate }) {
  const location = useLocation();
  const { t } = useTranslation();
  const getNavLinkClass = (path) =>
    `nav-item ${location.pathname === path ? 'active' : ''}`;

  const billPayBadge = paymentIntents.filter(p => p.status === 'PENDING').length;
  const badgeValue = (b) => (b === 'billpay' ? billPayBadge : b);

  // On mobile (drawer mode) clicking any link should close the drawer.
  const handleNavClick = (e) => {
    if (onNavigate && e.target.closest('a')) onNavigate();
  };

  return (
    <aside className="sidebar" onClick={handleNavClick}>
      <NavLink to="/" className="sidebar-brand" title="Go to Home"
        style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}>
        <div className="brand-mark">
          <svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg" aria-label="TerraVest">
            <defs>
              <linearGradient id="tvTile" x1="0" y1="0" x2="96" y2="96" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#1A4D3B"/><stop offset="1" stopColor="#2D6B52"/>
              </linearGradient>
              <linearGradient id="tvGold" x1="20" y1="72" x2="76" y2="22" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#C9973A"/><stop offset="1" stopColor="#F0C878"/>
              </linearGradient>
            </defs>
            <rect width="96" height="96" rx="24" fill="url(#tvTile)"/>
            <path d="M22 70 L48 50 L74 70 Z" fill="#8AB89A" opacity="0.30"/>
            <path d="M22 68 L40 54 L54 62 L74 30" stroke="url(#tvGold)" strokeWidth="6"
                  fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="74" cy="30" r="6.5" fill="url(#tvGold)"/>
          </svg>
        </div>
        <div className="brand-text">
          <div className="brand-name">TerraVest</div>
          <div className="brand-tagline">{t('brand.tagline')}</div>
        </div>
      </NavLink>

      <ul className="sidebar-nav" style={{paddingTop:'12px'}}>
        {navSections.map((section) => (
          <React.Fragment key={section.id}>
            <div className="sidebar-section" style={{ marginTop: 4 }}>
              <div className="sidebar-section-label">{t(`section.${section.id}`, section.label)}</div>
            </div>
            {section.items.map((item) => {
              const val = badgeValue(item.badge);
              const label = t(`nav.${item.id}`, item.label);
              return (
                <NavLink key={item.id} to={item.to} title={label} className={getNavLinkClass(item.to)}>
                  <i className={item.icon}></i>
                  <span className="nav-label">{label}</span>
                  {val > 0 && <span className="nav-badge">{val}</span>}
                </NavLink>
              );
            })}
          </React.Fragment>
        ))}

        {/* No Ops Portal launcher here by design: ops staff are separate accounts with their own
            login at /ops, so a member session can never reveal (or reach) staff tooling. */}
      </ul>

      <div className="sidebar-footer">
        <NavLink to="/profile" className="sidebar-user" title="Profile" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="user-avatar">{(user?.name || user?.email || 'U')[0].toUpperCase()}</div>
          <div className="user-meta">
            <div className="user-name">{user?.name || (user?.email ? user.email.split('@')[0] : 'User')}</div>
            <div className="user-role">View profile</div>
          </div>
          <i className="ti ti-chevron-right" style={{ marginLeft: 'auto', color: 'rgba(255,255,255,.45)', fontSize: '16px' }} />
        </NavLink>
        {/* Explicit, clearly-labeled sign-out control at the very bottom of the sidebar.
            (Collapses to an icon-only button when the sidebar is in rail mode.) */}
        <button type="button" className="sidebar-signout" onClick={handleLogout} title={t('nav.logout', 'Sign out')}>
          <i className="ti ti-logout"></i>
          <span className="nav-label">{t('nav.logout', 'Sign out')}</span>
        </button>
      </div>
    </aside>
  );
}

function Topbar({ snapshot, syncWithIntegrator, loadAll, error, formatDate, onToggleSidebar, collapsed }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const navId = PATH_TO_NAVID[location.pathname];
  const currentPageLabel = navId
    ? t(`nav.${navId}`, navLabels[location.pathname] || 'TerraVest')
    : (navLabels[location.pathname] || 'TerraVest');

  const [notifs, setNotifs] = useState([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [search, setSearch] = useState('');
  const [theme, setTheme] = useState(getTheme());
  const bellRef = useRef(null);

  const cycleTheme = () => setTheme((t) => applyTheme(nextTheme(t)));

  useEffect(() => {
    let active = true;
    api.getNotifications()
      .then((res) => { if (active) setNotifs(res?.items ?? []); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // Close the dropdown when clicking outside it.
  useEffect(() => {
    function onDocClick(e) {
      if (bellRef.current && !bellRef.current.contains(e.target)) setShowNotifs(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const unread = notifs.filter((n) => !n.read).length;

  function onSearchKey(e) {
    if (e.key === 'Enter') navigate('/transactions');
  }

  const typeIcon = (t) => ({
    BUDGET: 'ti ti-chart-pie', PAYMENT: 'ti ti-receipt',
    ACCOUNT: 'ti ti-building-bank', SYSTEM: 'ti ti-bell',
  }[t] || 'ti ti-bell');

  return (
    <div className="topbar">
      <button
        className="icon-btn hamburger"
        onClick={onToggleSidebar}
        title={collapsed ? t('topbar.expandMenu') : t('topbar.collapseMenu')}
        aria-label={t('topbar.toggleMenu')}
      >
        <i className="ti ti-menu-2"></i>
      </button>
      <div className="topbar-search">
        <i className="ti ti-search"></i>
        <input
          type="text"
          placeholder={t('topbar.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={onSearchKey}
        />
      </div>
      <div className="topbar-right">
        <div ref={bellRef} style={{ position: 'relative' }}>
          <button className="icon-btn" onClick={() => setShowNotifs((s) => !s)} title="Notifications">
            <i className="ti ti-bell"></i>
            {unread > 0 && <span className="dot"></span>}
          </button>
          {showNotifs && (
            <div style={{
              position: 'absolute', right: 0, top: 40, width: 340, background: 'var(--tv-white)',
              border: '1px solid var(--tv-border)', borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-lg)', zIndex: 50, overflow: 'hidden'
            }}>
              <div className="section-header" style={{ padding: '12px 14px', marginBottom: 0, borderBottom: '1px solid var(--tv-border-light)' }}>
                <div className="section-title" style={{ marginBottom: 0 }}>{t('topbar.notifications')}</div>
                {unread > 0 && <span className="badge badge-forest">{t('topbar.new', { count: unread })}</span>}
              </div>
              <div style={{ maxHeight: 320, overflowY: 'auto', padding: '4px 14px' }}>
                {notifs.length === 0 ? (
                  <div className="empty-state" style={{ padding: '24px 8px' }}>
                    <i className="ti ti-bell-off"></i>
                    <p>{t('topbar.noNotifications')}</p>
                  </div>
                ) : notifs.slice(0, 6).map((n) => (
                  <div className="list-item" key={n.id}>
                    <div className="item-icon icon-forest" style={{ width: 32, height: 32, fontSize: 15 }}>
                      <i className={typeIcon(n.type)}></i>
                    </div>
                    <div className="item-main">
                      <div className="item-name" style={{ fontWeight: n.read ? 400 : 600 }}>{n.title}</div>
                      <div className="item-sub" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.body}</div>
                    </div>
                    {!n.read && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--tv-forest-light)', flexShrink: 0 }}></span>}
                  </div>
                ))}
              </div>
              <div style={{ padding: '10px 14px', borderTop: '1px solid var(--tv-border-light)' }}>
                <button className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => { setShowNotifs(false); navigate('/messages'); }}>
                  {t('topbar.viewAllMessages')}
                </button>
              </div>
            </div>
          )}
        </div>
        <button className="icon-btn" title={t('topbar.help')} onClick={() => navigate('/learn')}>
          <i className="ti ti-help-circle"></i>
        </button>
        <LanguageSwitcher />
        <button className="icon-btn" title={t('topbar.themeTip', { theme: THEME_META[theme].label })} onClick={cycleTheme}>
          <i className={THEME_META[theme].icon}></i>
        </button>
        <div style={{width:'1px',height:'22px',background:'var(--tv-border)',margin:'0 4px'}}></div>
        <span id="topbar-label" className="topbar-page-label">{currentPageLabel}</span>
      </div>
    </div>
  );
}

function OuterTabs() {
  const location = useLocation();
  const getOuterTabClass = (path) =>
    `outer-tab ${location.pathname === path ? 'active' : ''}`;

  // Quick-access tabs: user-facing features only (internal dev screens like the Style Guide and
  // UI Flow Map are intentionally not surfaced here). Each tab routes straight to its screen.
  const TABS = [
    { to: '/',            icon: 'ti ti-layout-dashboard', label: 'Home' },
    { to: '/budget',      icon: 'ti ti-chart-pie',        label: 'Budgets' },
    { to: '/make-payment', icon: 'ti ti-receipt',         label: 'Make Payment' },
    { to: '/tax',         icon: 'ti ti-receipt-tax',      label: 'Taxes' },
    { to: '/debt',        icon: 'ti ti-trending-down',    label: 'Debt Lab' },
    { to: '/dealroom',    icon: 'ti ti-briefcase',        label: 'Deal Room' },
    { to: '/mybusiness',  icon: 'ti ti-building-store',   label: 'My Business' },
    { to: '/ai-assistant', icon: 'ti ti-sparkles',        label: 'AI Assistant' },
  ];

  return (
    <div className="outer-tabs">
      {TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} className={getOuterTabClass(tab.to)}>
          <i className={tab.icon}></i>{tab.label}
        </NavLink>
      ))}
    </div>
  );
}


// Whole-page auto-translation. Re-runs whenever the language or route changes,
// translating everything inside .page-content via the machine-translation
// provider (see i18n/domTranslator). A MutationObserver keeps async-loaded
// content translated too. No-op in English.
function AutoTranslate() {
  const location = useLocation();
  const { i18n } = useTranslation();
  useEffect(() => {
    const lang = (i18n.language || 'en').split('-')[0];
    const root = document.querySelector('.page-content');
    if (!root) return undefined;
    // setupAutoTranslate does an initial pass; its MutationObserver covers lazy /
    // suspended page chunks and async data that arrive afterwards.
    const cleanup = setupAutoTranslate(root, lang);
    return cleanup;
  }, [i18n.language, location.pathname]);
  return null;
}

export default function AppLayout(props) {
  const {
    snapshot, accounts, transactions, insights, paymentIntents,
    debtScenarios, debtBaseline, debtLoading, strategy, extraPayment, planTab,
    billPayStep, user, billPayForm, billPaySubmitting, lastBillPayIntent,
    properties, creditCards, fundingAccounts, loading, error,
    setPage, setAuthMode, setAuthForm, setSnapshot, setAccounts,
    setTransactions, setInsights, setPaymentIntents, setDebtScenarios,
    setDebtLoading, setStrategy, setExtraPayment, setPlanTab,
    setBillPayStep, setUser, setBillPayForm, setBillPaySubmitting,
    setLastBillPayIntent, setProperties, setError, setLoading,
    loadAll, syncWithIntegrator, submitAuth, submitBillPay, dataLoadFailed,
    cancelPaymentIntent,
    runAllDebtScenarios, handleLogout, openBillPay, formatDate
  } = props;

  // Collapsible sidebar (icon rail) — persisted so it survives reloads.
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('tv_sidebar_collapsed') === '1'
  );
  // On mobile the sidebar is an off-canvas drawer toggled by the hamburger.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isMobile = () =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches;
  const toggleSidebar = () => {
    if (isMobile()) {
      setMobileNavOpen((o) => !o);
      return;
    }
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem('tv_sidebar_collapsed', next ? '1' : '0');
      return next;
    });
  };
  const closeMobileNav = () => setMobileNavOpen(false);

  // Config-driven nav: resolves from remote config + module registry, with a
  // built-in fallback to the default (current) nav when config is unavailable.
  const { config, flags } = useRemoteConfig();
  const navSections = resolveNav(config, MODULE_REGISTRY, flags);

  const memberShell = (
    <SubscriptionProvider>
      <TrialOnboardingModal />
      <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''} ${mobileNavOpen ? 'mobile-nav-open' : ''}`}>
        <div className="mobile-nav-backdrop" onClick={closeMobileNav} aria-hidden="true"></div>
        <Sidebar user={user} handleLogout={handleLogout} paymentIntents={paymentIntents} navSections={navSections} onNavigate={closeMobileNav} />
        <div className="main-area">
          <Topbar
            snapshot={snapshot}
            syncWithIntegrator={syncWithIntegrator}
            loadAll={loadAll}
            error={error}
            formatDate={formatDate}
            onToggleSidebar={toggleSidebar}
            collapsed={collapsed}
          />
          <OuterTabs />
          <div className="page-content">
            {/* Time-sensitive subscription notices (trial ending, expired, past due). */}
            <TrialBanner />
            {/* A partial load failure used to be console-only, so every data-driven screen
                silently rendered its "link an account" empty state even for users WITH data.
                Say it out loud instead, and offer a retry. */}
            {dataLoadFailed && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                padding: '10px 14px', margin: '0 0 14px', borderRadius: 'var(--radius-md, 10px)',
                background: 'rgba(192,57,43,.10)', border: '1px solid var(--tv-negative, #c0392b)',
              }}>
                <i className="ti ti-cloud-off" style={{ color: 'var(--tv-negative, #c0392b)', fontSize: 18 }}></i>
                <span style={{ flex: 1, minWidth: 180, fontSize: 13.5 }}>
                  We couldn't load your accounts or transactions. Screens below may look empty —
                  that's this error, not missing data.
                </span>
                <button className="btn btn-primary btn-sm" onClick={() => loadAll && loadAll()}>
                  Retry
                </button>
              </div>
            )}
            {/* {error && <p className="error banner-error">{error}</p>} */}
            {/* {loading && !snapshot && <p className="status">Loading TerraVest…</p>} */}
            <React.Suspense fallback={<div className="page active"><div className="empty-state"><i className="ti ti-loader spin"></i><p>Loading…</p></div></div>}>
            <Routes>
              <Route path="/alerts" element={<AlertsPage accounts={accounts} transactions={transactions} />} />
              <Route path="/today" element={
                <TodayPage
                  snapshot={snapshot}
                  accounts={accounts}
                  transactions={transactions}
                  paymentIntents={paymentIntents}
                  insights={insights}
                  user={user}
                  formatDate={formatDate}
                />
              } />
              <Route path="/recurring" element={<RecurringPage />} />
              <Route path="/health-score" element={<HealthScorePage accounts={accounts} transactions={transactions} snapshot={snapshot} />} />
              <Route path="/cash-flow" element={<CashFlowPage accounts={accounts} transactions={transactions} paymentIntents={paymentIntents} />} />
              <Route path="/spending" element={<SpendingPage transactions={transactions} />} />
              <Route path="/emergency-fund" element={<EmergencyFundPage accounts={accounts} transactions={transactions} />} />
              <Route path="/coach" element={<CoachPage accounts={accounts} transactions={transactions} snapshot={snapshot} insights={insights} />} />
              <Route path="/household" element={<HouseholdPage />} />
              <Route path="/shared-money" element={<SharedMoneyPage />} />
              <Route path="/" element={
                <HomePage
                  snapshot={snapshot}
                  accounts={accounts}
                  transactions={transactions}
                  creditCards={creditCards}
                  properties={properties}
                  onPay={openBillPay}
                  loadAll={loadAll}
                  user={user}
                  insights={insights}
                  paymentIntents={paymentIntents}
                  formatDate={formatDate}
                />
              } />
              <Route path="/accounts" element={<AccountsPage accounts={accounts} loadAll={loadAll} />} />
              <Route path="/transactions" element={<TransactionsPage transactions={transactions} accounts={accounts} loadAll={loadAll} />} />
              <Route path="/budget" element={
                <PlanPage
                  planTab={planTab}
                  setPlanTab={setPlanTab}
                  strategy={strategy}
                  setStrategy={setStrategy}
                  extraPayment={extraPayment}
                  setExtraPayment={setExtraPayment}
                  debtScenarios={debtScenarios}
                  debtBaseline={debtBaseline}
                  onRunAllScenarios={runAllDebtScenarios}
                  debtLoading={debtLoading}
                  formatDate={formatDate}
                />
              } />
              {/* Legacy deep link — /billpay keeps working for saved links and old clients. */}
              <Route path="/billpay" element={<Navigate to="/make-payment" replace />} />
              <Route path="/make-payment" element={
                <MakePaymentPage
                  step={billPayStep}
                  setStep={setBillPayStep}
                  accounts={accounts}
                  fundingAccounts={fundingAccounts}
                  billPayForm={billPayForm}
                  setBillPayForm={setBillPayForm}
                  paymentIntents={paymentIntents}
                  onSubmit={submitBillPay}
                  onStartOver={openBillPay}
                  onCancelIntent={cancelPaymentIntent}
                  submitting={billPaySubmitting}
                  lastIntent={lastBillPayIntent}
                  formatDate={formatDate}
                />
              } />
              <Route path="/debt" element={
                <PlanPage // Reusing PlanPage for Debt Lab as per original structure
                  planTab="debt" // Force debt tab
                  setPlanTab={setPlanTab}
                  strategy={strategy}
                  setStrategy={setStrategy}
                  extraPayment={extraPayment}
                  setExtraPayment={setExtraPayment}
                  debtScenarios={debtScenarios}
                  debtBaseline={debtBaseline}
                  onRunAllScenarios={runAllDebtScenarios}
                  debtLoading={debtLoading}
                  formatDate={formatDate}
                />
              } />
              <Route path="/invest" element={<InvestPage snapshot={snapshot} accounts={accounts} loadAll={loadAll} />} />
              <Route path="/mybusiness" element={
                <FeatureGate feature="business.multiEntity" title="Multi-business dashboards">
                  <MyBusinessPage user={user} formatDate={formatDate} accounts={accounts} transactions={transactions} loadAll={loadAll} />
                </FeatureGate>
              } />
              <Route path="/ai-assistant" element={<AIAssistantPage user={user} />} />
              <Route path="/calculators" element={<CalculatorsPage />} />
              <Route path="/goals" element={<GoalsPage />} />
              <Route path="/tax" element={<TaxPage />} />
              <Route path="/cpa" element={<CpaMarketplacePage />} />
              <Route path="/realestate" element={<RealEstatePage properties={properties} />} />
              <Route path="/dealroom" element={
                <FeatureGate feature="business.dealroom" title="Deal Room">
                  <DealRoomPage />
                </FeatureGate>
              } />
              <Route path="/fractional" element={
                <FeatureGate feature="business.fractional" title="Fractional LLC">
                  <FractionalLLCPage />
                </FeatureGate>
              } />
              <Route path="/documents" element={<DocumentCenterPage user={user} formatDate={formatDate} />} />
              <Route path="/security" element={<SecurityPage />} />
              <Route path="/messages" element={<MessagesPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/subscription" element={<SubscriptionPage />} />
              <Route path="/plans/:planKey" element={<PlanTierPage />} />
              <Route
                path="/profile"
                element={<ProfilePage user={user} accounts={accounts} onLogout={handleLogout} />}
              />
              <Route path="/learn" element={<LearnPage />} />
              <Route path="/guide" element={<GuidePage />} />
              <Route path="/styleguide" element={<StyleGuidePage />} />
              <Route path="/flowmap" element={<UIFlowMapPage />} />
            </Routes>
            </React.Suspense>
          </div>
        </div>
      </div>
    </SubscriptionProvider>
  );

  // The member app, and only the member app.
  //
  // The Ops Portal used to render here at /ops. It now lives on its own origin
  // (ops.terravest.app) with its own bundle — see apps/web/src/ops-main.jsx and
  // vite.ops.config.js. Two reasons it moved once ops gained the power to issue refunds:
  //  - a different origin means a different localStorage, so an XSS in this app cannot read
  //    an ops session that can move money;
  //  - no ops screens or permission logic are shipped to members. Not route-guarded — simply
  //    not in this bundle. (api.js is still shared, so its ops URL builders remain here as
  //    dead code; they are not a capability — see ops-main.jsx.)
  return (
    <Router>
      <AutoTranslate />
      {memberShell}
    </Router>
  );
}