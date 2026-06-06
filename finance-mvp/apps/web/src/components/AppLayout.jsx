import React, { useState } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  NavLink,
  useLocation
} from 'react-router-dom';

// Import actual page components
import HomePage from "../pages/HomePage";
import AccountsPage from "../pages/AccountsPage";
import TransactionsPage from "../pages/TransactionsPage"; // Import actual TransactionsPage
import CashPage from "../pages/CashPage";
import InvestPage from "../pages/InvestPage";
import PlanPage from "../pages/PlanPage";
import BillPayPage from "../pages/BillPayPage";
import LearnPage from "../pages/LearnPage";
import ProfilePage from "../pages/ProfilePage";
import RealEstatePage from "../pages/RealEstatePage";
import DealRoomPage from "../pages/DealRoomPage";
import StyleGuidePage from "../pages/StyleGuidePage";
import UIFlowMapPage from "../pages/UIFlowMapPage";
import MyBusinessPage from "../pages/MyBusinessPage";
import AIAssistantPage from "../pages/AIAssistantPage";

// Placeholder for pages not yet fully implemented or mapped
const FractionalLLCPage = (props) => <div id="page-fractional" className="page active">Fractional LLC Page Content</div>;
const SecurityPage = (props) => <div id="page-security" className="page active">Security Page Content</div>;
const MessagesPage = (props) => <div id="page-messages" className="page active">Messages Page Content</div>;
const SettingsPage = (props) => <div id="page-settings" className="page active">Settings Page Content</div>;


const navLabels = {
  '/': 'Home',
  '/accounts': 'Accounts',
  '/transactions': 'Transactions',
  '/budget': 'Budgets',
  '/billpay': 'Pay Bills',
  '/debt': 'Debt Lab',
  '/invest': 'Investments',
  '/mybusiness': 'My Business',
  '/ai-assistant': 'AI Assistant',
  '/realestate': 'Properties',
  '/dealroom': 'Deal Room',
  '/fractional': 'Fractional LLC',
  '/security': 'Security',
  '/messages': 'Messages',
  '/settings': 'Settings',
  '/styleguide': 'Style Guide',
  '/flowmap': 'UI Flow Map',
  '/profile': 'Profile',
};

function Sidebar({ user, handleLogout, paymentIntents }) {
  const location = useLocation();
  const getNavLinkClass = (path) =>
    `nav-item ${location.pathname === path ? 'active' : ''}`;

  const billPayBadge = paymentIntents.filter(p => p.status === 'PENDING').length;

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L3 9v13h7v-7h4v7h7V9L12 2z"/>
          </svg>
        </div>
        <div>
          <div className="brand-name">TerraVest</div>
          <div className="brand-tagline">Finance &amp; Land</div>
        </div>
      </div>

      <ul className="sidebar-nav" style={{paddingTop:'12px'}}>
        <div className="sidebar-section">
          <div className="sidebar-section-label">Finance</div>
        </div>
        <NavLink to="/" className={getNavLinkClass('/')}>
          <i className="ti ti-layout-dashboard"></i> Home
        </NavLink>
        <NavLink to="/accounts" className={getNavLinkClass('/accounts')}>
          <i className="ti ti-wallet"></i> Accounts
        </NavLink>
        <NavLink to="/transactions" className={getNavLinkClass('/transactions')}>
          <i className="ti ti-arrows-exchange-2"></i> Transactions
        </NavLink>
        <NavLink to="/budget" className={getNavLinkClass('/budget')}>
          <i className="ti ti-chart-pie"></i> Budgets
        </NavLink>
        <NavLink to="/billpay" className={getNavLinkClass('/billpay')}>
          <i className="ti ti-receipt"></i> Pay Bills
          {billPayBadge > 0 && <span className="nav-badge">{billPayBadge}</span>}
        </NavLink>
        <NavLink to="/debt" className={getNavLinkClass('/debt')}>
          <i className="ti ti-trending-down"></i> Debt Lab
        </NavLink>
        <NavLink to="/invest" className={getNavLinkClass('/invest')}>
          <i className="ti ti-chart-line"></i> Investments
        </NavLink>
        <NavLink to="/mybusiness" className={getNavLinkClass('/mybusiness')}>
          <i className="ti ti-briefcase"></i> My Business
        </NavLink>
        <NavLink to="/ai-assistant" className={getNavLinkClass('/ai-assistant')}>
          <i className="ti ti-sparkles"></i> AI Assistant
        </NavLink>

        <div className="sidebar-section" style={{marginTop:'16px'}}>
          <div className="sidebar-section-label">Real Estate</div>
        </div>
        <NavLink to="/realestate" className={getNavLinkClass('/realestate')}>
          <i className="ti ti-building-estate"></i> Properties
        </NavLink>
        <NavLink to="/dealroom" className={getNavLinkClass('/dealroom')}>
          <i className="ti ti-briefcase"></i> Deal Room
        </NavLink>
        <NavLink to="/fractional" className={getNavLinkClass('/fractional')}>
          <i className="ti ti-brand-stackshare"></i> Fractional LLC
        </NavLink>

        <div className="sidebar-section" style={{marginTop:'16px'}}>
          <div className="sidebar-section-label">Settings</div>
        </div>
        <NavLink to="/security" className={getNavLinkClass('/security')}>
          <i className="ti ti-shield-lock"></i> Security
        </NavLink>
        <NavLink to="/messages" className={getNavLinkClass('/messages')}>
          <i className="ti ti-message-2"></i> Messages
          <span className="nav-badge">2</span>
        </NavLink>
        <NavLink to="/settings" className={getNavLinkClass('/settings')}>
          <i className="ti ti-settings"></i> Settings
        </NavLink>
      </ul>

      <div className="sidebar-footer">
        <NavLink to="/profile" className="sidebar-user" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="user-avatar">{user?.email ? user.email[0].toUpperCase() : 'U'}</div>
          <div>
            <div className="user-name">{user?.email ? user.email.split('@')[0] : 'User'}</div>
            <div className="user-role">View profile</div>
          </div>
          <i
            className="ti ti-logout"
            style={{ marginLeft: 'auto', color: 'rgba(255,255,255,.4)', fontSize: '16px' }}
            title="Sign out"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleLogout();
            }}
          />
        </NavLink>
      </div>
    </aside>
  );
}

function Topbar({ snapshot, syncWithIntegrator, loadAll, error, formatDate }) {
  const location = useLocation();
  const currentPageLabel = navLabels[location.pathname] || 'TerraVest';

  return (
    <div className="topbar">
      <div className="topbar-search">
        <i className="ti ti-search"></i>
        <input type="text" placeholder="Search accounts, transactions, categories…"/>
      </div>
      <div className="topbar-right">
        <button className="icon-btn"><i className="ti ti-bell"></i><span className="dot"></span></button>
        <button className="icon-btn"><i className="ti ti-help-circle"></i></button>
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

  return (
    <div className="outer-tabs">
      <NavLink to="/" className={getOuterTabClass('/')}><i className="ti ti-layout-dashboard"></i>Home</NavLink>
      <NavLink to="/budget" className={getOuterTabClass('/budget')}><i className="ti ti-chart-pie"></i>Budgets</NavLink>
      <NavLink to="/billpay" className={getOuterTabClass('/billpay')}><i className="ti ti-receipt"></i>Bill Pay</NavLink>
      <NavLink to="/debt" className={getOuterTabClass('/debt')}><i className="ti ti-trending-down"></i>Debt Lab</NavLink>
      <NavLink to="/dealroom" className={getOuterTabClass('/dealroom')}><i className="ti ti-briefcase"></i>Deal Room</NavLink>
      <NavLink to="/styleguide" className={getOuterTabClass('/styleguide')}><i className="ti ti-palette"></i>Style Guide</NavLink>
      <NavLink to="/flowmap" className={getOuterTabClass('/flowmap')}><i className="ti ti-git-merge"></i>UI Flow Map</NavLink>
    </div>
  );
}


export default function AppLayout(props) {
  const {
    snapshot, accounts, transactions, insights, paymentIntents,
    debtScenarios, debtLoading, strategy, extraPayment, planTab,
    billPayStep, user, billPayForm, billPaySubmitting, lastBillPayIntent,
    properties, creditCards, fundingAccounts, loading, error,
    setPage, setAuthMode, setAuthForm, setSnapshot, setAccounts,
    setTransactions, setInsights, setPaymentIntents, setDebtScenarios,
    setDebtLoading, setStrategy, setExtraPayment, setPlanTab,
    setBillPayStep, setUser, setBillPayForm, setBillPaySubmitting,
    setLastBillPayIntent, setProperties, setError, setLoading,
    loadAll, syncWithIntegrator, submitAuth, submitBillPay,
    runAllDebtScenarios, handleLogout, openBillPay, formatDate
  } = props;

  return (
    <Router>
      <div className="app-shell">
        <Sidebar user={user} handleLogout={handleLogout} paymentIntents={paymentIntents} />
        <div className="main-area">
          <Topbar
            snapshot={snapshot}
            syncWithIntegrator={syncWithIntegrator}
            loadAll={loadAll}
            error={error}
            formatDate={formatDate}
          />
          <OuterTabs />
          <div className="page-content">
            {/* {error && <p className="error banner-error">{error}</p>} */}
            {/* {loading && !snapshot && <p className="status">Loading TerraVest…</p>} */}
            <Routes>
              <Route path="/" element={
                <HomePage
                  snapshot={snapshot}
                  accounts={accounts}
                  transactions={transactions}
                  creditCards={creditCards}
                  properties={properties}
                  onPay={openBillPay}
                  user={user}
                  insights={insights}
                  formatDate={formatDate}
                />
              } />
              <Route path="/accounts" element={<AccountsPage accounts={accounts} loadAll={loadAll} />} />
              <Route path="/transactions" element={<TransactionsPage transactions={transactions} />} />
              <Route path="/budget" element={
                <PlanPage
                  planTab={planTab}
                  setPlanTab={setPlanTab}
                  strategy={strategy}
                  setStrategy={setStrategy}
                  extraPayment={extraPayment}
                  setExtraPayment={setExtraPayment}
                  debtScenarios={debtScenarios}
                  onRunAllScenarios={runAllDebtScenarios}
                  debtLoading={debtLoading}
                  formatDate={formatDate}
                />
              } />
              <Route path="/billpay" element={
                <BillPayPage
                  step={billPayStep}
                  setStep={setBillPayStep}
                  creditCards={creditCards}
                  fundingAccounts={fundingAccounts}
                  billPayForm={billPayForm}
                  setBillPayForm={setBillPayForm}
                  paymentIntents={paymentIntents}
                  onSubmit={submitBillPay}
                  onBack={() => { /* Implement navigation back if needed */ }}
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
                  onRunAllScenarios={runAllDebtScenarios}
                  debtLoading={debtLoading}
                  formatDate={formatDate}
                />
              } />
              <Route path="/invest" element={<InvestPage snapshot={snapshot} />} />
              <Route path="/mybusiness" element={<MyBusinessPage user={user} formatDate={formatDate} />} />
              <Route path="/ai-assistant" element={<AIAssistantPage user={user} />} />
              <Route path="/realestate" element={<RealEstatePage properties={properties} />} />
              <Route path="/dealroom" element={<DealRoomPage />} />
              <Route path="/fractional" element={<FractionalLLCPage />} />
              <Route path="/security" element={<SecurityPage />} />
              <Route path="/messages" element={<MessagesPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route
                path="/profile"
                element={<ProfilePage user={user} accounts={accounts} onLogout={handleLogout} />}
              />
              <Route path="/styleguide" element={<StyleGuidePage />} />
              <Route path="/flowmap" element={<UIFlowMapPage />} />
            </Routes>
          </div>
        </div>
      </div>
    </Router>
  );
}