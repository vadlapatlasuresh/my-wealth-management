import React, { useEffect, useState } from 'react';
import { api, getOpsName, getOpsEmail, getOpsRoles, getOpsPermissions, hasOpsPermission } from '../api';
import CustomerCarePage from '../pages/CustomerCarePage';
import AdminDashboardPage from '../pages/AdminDashboardPage';
import OpsAccountsPage from '../pages/OpsAccountsPage';
import OpsMoneyPage from '../pages/OpsMoneyPage';
import CpaModeration from './CpaModeration';

/* OPS_SUPERVISOR → "Supervisor". The OPS_ prefix is meaningful in the token, not to a human. */
function roleLabels(roles) {
  return roles
    .map((r) => r.replace(/^OPS_/, ''))
    .map((r) => r.charAt(0) + r.slice(1).toLowerCase())
    .join(' · ');
}

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

  async function load() {
    setError('');
    try {
      // The agent is derived from the token server-side — no id to pass, and none to get wrong.
      const res = await api.opsMyActivity(50);
      setRows(Array.isArray(res) ? res : []);
    } catch (e) {
      setError(e.message || 'Could not load activity');
      setRows([]);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

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
  const roles = getOpsRoles();
  const agentInitial = (getOpsName() || getOpsEmail() || 'A')[0].toUpperCase();

  // Nav is permission-gated, not role-gated: a retuned role takes effect without a code change.
  // Items the agent can't use are ABSENT rather than disabled — a greyed-out button that exists
  // only to say "not for you" is noise on a screen meant for working a live call.
  const NAV = [
    { key: 'customers', label: 'Customers', icon: 'ti ti-users', show: hasOpsPermission('customer.search') },
    // The money desk: approval + anomaly queues. Visible to whoever can work either one.
    { key: 'money', label: 'Money desk', icon: 'ti ti-cash', show: hasOpsPermission('finance.adjustment.approve') || hasOpsPermission('finance.anomaly.review') },
    { key: 'analytics', label: 'Analytics', icon: 'ti ti-chart-dots', show: hasOpsPermission('ops.analytics.view') },
    { key: 'cpas', label: 'CPA Listings', icon: 'ti ti-user-check', show: hasOpsPermission('cpa.moderate') },
    { key: 'accounts', label: 'Ops Accounts', icon: 'ti ti-shield-lock', show: hasOpsPermission('ops.user.manage') },
    { key: 'session', label: 'My session log', icon: 'ti ti-clipboard-check', show: true },
  ].filter((n) => n.show);

  // Land on the first thing this agent can actually open, not a hardcoded tab they may lack.
  const [view, setView] = useState(() => (NAV[0] ? NAV[0].key : 'session'));

  return (
    <div className="ops-shell">
      {/* Top bar */}
      <div className="ops-topbar">
        <div className="ops-brand">
          <div className="ops-mark"><i className="ti ti-headset"></i></div>
          <div><span className="ops-brand-name">TerraVest</span> <span className="ops-brand-tag">Ops Portal</span></div>
        </div>
        <span className="ops-audit-pill"><i className="ti ti-shield-check"></i> Auditing on · {roleLabels(roles) || 'Staff'}</span>
        <div className="ops-spacer" />
        {/* No "Back to app" link: an ops session is not a member session, so there is nothing
            to go back to. Signing in as a customer is a separate login at /. */}
        <div className="ops-agent">
          <span className="ops-agent-av">{agentInitial}</span>
          <div>
            <div className="ops-agent-name">{getOpsName() || getOpsEmail()}</div>
            <div className="ops-agent-role">{roleLabels(roles) || 'STAFF'}</div>
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
              You hold {getOpsPermissions().length} permission{getOpsPermissions().length === 1 ? '' : 's'}.
              Ask an ops admin if you need more.
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
          {view === 'money' && <OpsMoneyPage />}
          {view === 'accounts' && <OpsAccountsPage />}
          {view === 'session' && <SessionLog />}
        </main>
      </div>
    </div>
  );
}
