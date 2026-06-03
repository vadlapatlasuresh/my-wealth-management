import React, { useState } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  NavLink,
  useLocation
} from 'react-router-dom';

// Placeholder for page components
const HomePage = () => <div id="page-home" className="page active">Home Page Content</div>;
const AccountsPage = () => <div id="page-accounts" className="page active">Accounts Page Content</div>;
const TransactionsPage = () => <div id="page-transactions" className="page active">Transactions Page Content</div>;
const BudgetsPage = () => <div id="page-budget" className="page active">Budgets Page Content</div>;
const BillPayPage = () => <div id="page-billpay" className="page active">Bill Pay Page Content</div>;
const DebtLabPage = () => <div id="page-debt" className="page active">Debt Lab Page Content</div>;
const InvestmentsPage = () => <div id="page-invest" className="page active">Investments Page Content</div>;
const PropertiesPage = () => <div id="page-realestate" className="page active">Properties Page Content</div>;
const DealRoomPage = () => <div id="page-dealroom" className="page active">Deal Room Page Content</div>;
const FractionalLLCPage = () => <div id="page-fractional" className="page active">Fractional LLC Page Content</div>;
const SecurityPage = () => <div id="page-security" className="page active">Security Page Content</div>;
const MessagesPage = () => <div id="page-messages" className="page active">Messages Page Content</div>;
const SettingsPage = () => <div id="page-settings" className="page active">Settings Page Content</div>;
const StyleGuidePage = () => <div id="page-styleguide" className="page active">Style Guide Page Content</div>;
const UIFlowMapPage = () => <div id="page-flowmap" className="page active">UI Flow Map Page Content</div>;


const navLabels = {
  '/': 'Home',
  '/accounts': 'Accounts',
  '/transactions': 'Transactions',
  '/budget': 'Budgets',
  '/billpay': 'Pay Bills',
  '/debt': 'Debt Lab',
  '/invest': 'Investments',
  '/realestate': 'Properties',
  '/dealroom': 'Deal Room',
  '/fractional': 'Fractional LLC',
  '/security': 'Security',
  '/messages': 'Messages',
  '/settings': 'Settings',
  '/styleguide': 'Style Guide',
  '/flowmap': 'UI Flow Map',
};

function Sidebar() {
  const location = useLocation();
  const getNavLinkClass = (path) =>
    `nav-item ${location.pathname === path ? 'active' : ''}`;

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
          <span className="nav-badge">3</span>
        </NavLink>
        <NavLink to="/debt" className={getNavLinkClass('/debt')}>
          <i className="ti ti-trending-down"></i> Debt Lab
        </NavLink>
        <NavLink to="/invest" className={getNavLinkClass('/invest')}>
          <i className="ti ti-chart-line"></i> Investments
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
        <div className="sidebar-user">
          <div className="user-avatar">AK</div>
          <div>
            <div className="user-name">Alex Kim</div>
            <div className="user-role">Accredited Investor</div>
          </div>
          <i className="ti ti-logout" style={{marginLeft:'auto',color:'rgba(255,255,255,.4)',fontSize:'16px'}} title="Sign out"></i>
        </div>
      </div>
    </aside>
  );
}

function Topbar() {
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


export default function AppLayout() {
  return (
    <Router>
      <div className="app-shell">
        <Sidebar />
        <div className="main-area">
          <Topbar />
          <OuterTabs />
          <div className="page-content">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/accounts" element={<AccountsPage />} />
              <Route path="/transactions" element={<TransactionsPage />} />
              <Route path="/budget" element={<BudgetsPage />} />
              <Route path="/billpay" element={<BillPayPage />} />
              <Route path="/debt" element={<DebtLabPage />} />
              <Route path="/invest" element={<InvestmentsPage />} />
              <Route path="/realestate" element={<PropertiesPage />} />
              <Route path="/dealroom" element={<DealRoomPage />} />
              <Route path="/fractional" element={<FractionalLLCPage />} />
              <Route path="/security" element={<SecurityPage />} />
              <Route path="/messages" element={<MessagesPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/styleguide" element={<StyleGuidePage />} />
              <Route path="/flowmap" element={<UIFlowMapPage />} />
            </Routes>
          </div>
        </div>
      </div>
    </Router>
  );
}
