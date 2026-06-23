import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getStoredName, getStoredEmail, getCurrentUserId, getUserRoles } from '../api';
import CustomerCarePage from '../pages/CustomerCarePage';
import AdminDashboardPage from '../pages/AdminDashboardPage';
import CpaModeration from './CpaModeration';

/* Short timestamp for the session log. */
function ts(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/**
 * The agent's own audited activity this session — proves "what the agent did, step by step."
 * Sourced from the same audit trail the support actions are written to.
 */
function SessionLog() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const agentId = getCurrentUserId();

  async function load() {
    setError('');
    try {
      const res = await api.supportGetUserActivity(agentId, false, 50);
      setRows(Array.isArray(res) ? res : []);
    } catch (e) {
      setError(e.message || 'Could not load activity');
      setRows([]);
    }
  }
  useEffect(() => { if (agentId) load(); /* eslint-disable-next-line */ }, [agentId]);

  return (
    <div className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">My session activity</div>
          <div className="page-subtitle">Everything you do here is recorded for compliance. This is your audited trail.</div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load}><i className="ti ti-refresh"></i> Refresh</button>
      </div>
      {error && <div className="card" style={{ borderColor: 'var(--tv-negative)', marginBottom: 12 }}><span style={{ color: 'var(--tv-negative)' }}><i className="ti ti-alert-triangle"></i> {error}</span></div>}
      <div className="card">
        {rows === null ? (
          <div className="empty-state"><i className="ti ti-loader spin"></i><p>Loading…</p></div>
        ) : rows.length === 0 ? (
          <div className="empty-state"><i className="ti ti-history"></i><p>No recorded activity yet this session.</p></div>
        ) : (
          <div className="table-scroll">
            <table className="tv-table">
              <thead><tr><th>When</th><th>Action</th><th>Service</th><th style={{ textAlign: 'center' }}>Status</th><th>IP</th></tr></thead>
              <tbody>
                {rows.map((e, i) => {
                  const failed = (e.outcome && e.outcome !== 'SUCCESS') || (e.status && e.status >= 400);
                  return (
                    <tr key={e.id ?? i}>
                      <td style={{ color: 'var(--tv-text-muted)', whiteSpace: 'nowrap' }}>{ts(e.createdAt)}</td>
                      <td style={{ fontWeight: 500 }}>{e.action || '—'}</td>
                      <td><span className="badge badge-gray">{e.service || '—'}</span></td>
                      <td style={{ textAlign: 'center' }}><span className={`badge ${failed ? 'badge-red' : 'badge-forest'}`}>{e.status ?? e.outcome ?? '—'}</span></td>
                      <td style={{ color: 'var(--tv-text-muted)', fontSize: 12 }}>{e.sourceIp || ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Dedicated Ops / Help-Desk portal — the single home for all CARE/ADMIN tooling, separate
 * from the member app (own shell, own URL space `/ops`). Hosts customer search + 360,
 * admin analytics, and the agent's audited session log. Access is gated by the caller
 * (AppLayout only renders this for CARE/ADMIN) and re-checked here.
 */
export default function OpsPortal({ handleLogout }) {
  const navigate = useNavigate();
  const [view, setView] = useState('customers'); // customers | analytics | session
  const roles = getUserRoles();
  const isAdmin = roles.includes('ADMIN');
  const agentInitial = (getStoredName() || getStoredEmail() || 'A')[0].toUpperCase();

  const NAV = [
    { key: 'customers', label: 'Customers', icon: 'ti ti-users', show: true },
    { key: 'analytics', label: 'Analytics', icon: 'ti ti-chart-dots', show: true },
    { key: 'cpas', label: 'CPA Listings', icon: 'ti ti-user-check', show: true },
    { key: 'session', label: 'My session log', icon: 'ti ti-clipboard-check', show: true },
  ].filter((n) => n.show);

  return (
    <div className="ops-shell">
      {/* Top bar */}
      <div className="ops-topbar">
        <div className="ops-brand">
          <div className="ops-mark"><i className="ti ti-headset"></i></div>
          <div><span className="ops-brand-name">TerraVest</span> <span className="ops-brand-tag">Ops Portal</span></div>
        </div>
        <span className="ops-audit-pill"><i className="ti ti-shield-check"></i> Auditing on · CARE / ADMIN</span>
        <div className="ops-spacer" />
        <button className="btn btn-secondary btn-sm" onClick={() => navigate('/')}><i className="ti ti-arrow-left"></i> Back to app</button>
        <div className="ops-agent">
          <span className="ops-agent-av">{agentInitial}</span>
          <div>
            <div className="ops-agent-name">{getStoredName() || getStoredEmail()}</div>
            <div className="ops-agent-role">{roles.filter((r) => r !== 'USER').join(' · ') || 'AGENT'}</div>
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={handleLogout} title="Sign out"><i className="ti ti-logout"></i></button>
      </div>

      <div className="ops-body">
        {/* Left nav */}
        <nav className="ops-nav">
          {NAV.map((n) => (
            <button key={n.key} className={`ops-nav-item ${view === n.key ? 'active' : ''}`} onClick={() => setView(n.key)}>
              <i className={n.icon}></i><span>{n.label}</span>
            </button>
          ))}
          <div className="ops-nav-foot">
            <div className="setting-help" style={{ padding: '0 14px' }}>
              {isAdmin
                ? 'You can grant CARE / ADMIN roles from a customer’s profile.'
                : 'CARE access: view-only. Ask an admin to change roles.'}
            </div>
          </div>
        </nav>

        {/* Active view */}
        <main className="ops-main">
          {view === 'customers' && <CustomerCarePage />}
          {view === 'analytics' && (
            <React.Suspense fallback={<div className="page active"><div className="empty-state"><i className="ti ti-loader spin"></i><p>Loading…</p></div></div>}>
              <AdminDashboardPage />
            </React.Suspense>
          )}
          {view === 'cpas' && <CpaModeration />}
          {view === 'session' && <SessionLog />}
        </main>
      </div>
    </div>
  );
}
