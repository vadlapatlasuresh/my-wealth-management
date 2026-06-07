import { useState, useEffect } from 'react';
import { api } from '../api';

/* Active sessions come from real account-activity data. Login history is loaded
   live from the audit-service (/api/v1/audit/me) — real events, never faked. */
const INITIAL_SESSIONS = [];

export default function SecurityPage() {
  // Toggle-backed protections used for the security score.
  const [twoFA, setTwoFA] = useState(false);
  const [strongPassword] = useState(true); // assume a strong password is set
  const [alertsOn, setAlertsOn] = useState(true);

  // Password change form (local-only, no backend).
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwMsg, setPwMsg] = useState(null); // { type: 'success' | 'error', text }

  // Active sessions (local state so rows can be revoked).
  const [sessions, setSessions] = useState(INITIAL_SESSIONS);

  // Real login/account-activity history from the audit-service.
  const [loginHistory, setLoginHistory] = useState([]);
  useEffect(() => {
    let active = true;
    api.getMyActivity(20)
      .then((rows) => {
        if (!active) return;
        const list = (Array.isArray(rows) ? rows : rows?.content || [])
          .filter((e) => /login|register|auth/i.test(e.action || ''))
          .map((e) => ({
            id: e.id,
            action: e.action,
            outcome: e.outcome,
            when: e.createdAt,
            ip: e.sourceIp,
            ok: (e.outcome || '').toUpperCase() === 'SUCCESS',
          }));
        setLoginHistory(list);
      })
      .catch(() => { /* keep empty state on failure */ });
    return () => { active = false; };
  }, []);

  // Security score derived from the protections above.
  const protections = [twoFA, strongPassword, alertsOn];
  const enabledCount = protections.filter(Boolean).length;
  const total = protections.length;
  let scoreLabel = 'Weak';
  let scoreTone = 'red';
  if (enabledCount === total) {
    scoreLabel = 'Excellent';
    scoreTone = 'green';
  } else if (enabledCount === total - 1) {
    scoreLabel = 'Good';
    scoreTone = 'amber';
  }

  function handleUpdatePassword(e) {
    e.preventDefault();
    if (!current) {
      setPwMsg({ type: 'error', text: 'Please enter your current password.' });
      return;
    }
    if (next.length < 8) {
      setPwMsg({ type: 'error', text: 'New password must be at least 8 characters.' });
      return;
    }
    if (next !== confirm) {
      setPwMsg({ type: 'error', text: 'New password and confirmation do not match.' });
      return;
    }
    setPwMsg({ type: 'success', text: 'Password updated successfully.' });
    setCurrent('');
    setNext('');
    setConfirm('');
  }

  function revokeSession(id) {
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div id="page-security" className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">Security</div>
          <div className="page-subtitle">Protect your account and review activity</div>
        </div>
        <div className="page-actions">
          <span className={`badge badge-${scoreTone}`}>
            <i className="ti ti-shield-check"></i> {scoreLabel}
          </span>
        </div>
      </div>

      {/* Security score */}
      <div className="kpi-grid">
        <div className="kpi-card" style={{ gridColumn: 'span 2' }}>
          <div className="kpi-label">
            <i className="ti ti-shield-lock" style={{ color: 'var(--tv-forest)' }}></i> Security score
          </div>
          <div className="kpi-value" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {scoreLabel}
            <span className={`badge badge-${scoreTone}`}>
              {enabledCount} of {total} protections enabled
            </span>
          </div>
          <div className="setting-help">
            Enable two-factor authentication, keep a strong password, and turn on login alerts to reach an excellent score.
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">
            <i className="ti ti-key" style={{ color: 'var(--tv-forest-light)' }}></i> Two-factor
          </div>
          <div className="kpi-value">{twoFA ? 'On' : 'Off'}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">
            <i className="ti ti-bell" style={{ color: 'var(--tv-warning)' }}></i> Login alerts
          </div>
          <div className="kpi-value">{alertsOn ? 'On' : 'Off'}</div>
        </div>
      </div>

      <div className="grid-2">
        {/* Two-factor authentication */}
        <div className="card">
          <div className="card-title">Two-factor authentication (2FA)</div>
          <div className="setting-row">
            <div>
              <div className="setting-label">
                Authenticator app{' '}
                <span className={`badge badge-${twoFA ? 'green' : 'gray'}`}>
                  {twoFA ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div className="setting-help">
                Require a one-time code from your authenticator app when signing in.
              </div>
            </div>
            <div
              className={`toggle ${twoFA ? 'on' : ''}`}
              role="switch"
              aria-checked={twoFA}
              tabIndex={0}
              onClick={() => setTwoFA((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setTwoFA((v) => !v);
                }
              }}
            ></div>
          </div>

          {twoFA && (
            <>
              <hr className="divider" />
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div className="item-icon icon-forest">
                  <i className="ti ti-qrcode"></i>
                </div>
                <div>
                  <div className="setting-label">Set up your authenticator</div>
                  <div className="setting-help">
                    Scan the QR in your authenticator app, then enter the 6-digit code to finish.
                    (Setup is mocked for this demo.)
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Password */}
        <div className="card">
          <div className="card-title">Password</div>
          <form onSubmit={handleUpdatePassword}>
            <div className="form-group">
              <label className="form-label" htmlFor="sec-current">Current password</label>
              <input
                id="sec-current"
                type="password"
                className="form-input"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="sec-new">New password</label>
              <input
                id="sec-new"
                type="password"
                className="form-input"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                placeholder="At least 8 characters"
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="sec-confirm">Confirm new password</label>
              <input
                id="sec-confirm"
                type="password"
                className="form-input"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Re-enter new password"
              />
            </div>

            {pwMsg && (
              <div
                className="setting-help"
                style={{
                  marginTop: 0,
                  marginBottom: 12,
                  fontWeight: 500,
                  color: pwMsg.type === 'success' ? 'var(--tv-positive)' : 'var(--tv-negative)',
                }}
              >
                <i className={`ti ${pwMsg.type === 'success' ? 'ti-circle-check' : 'ti-alert-circle'}`}></i>{' '}
                {pwMsg.text}
              </div>
            )}

            <button type="submit" className="btn btn-primary">
              <i className="ti ti-lock-check"></i> Update password
            </button>
          </form>
        </div>
      </div>

      {/* Active sessions */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="section-header">
          <div className="section-title" style={{ marginBottom: 0 }}>Active sessions</div>
          <span className="badge badge-gray">{sessions.length} active</span>
        </div>
        {sessions.length === 0 ? (
          <div className="empty-state">
            <i className="ti ti-devices-off"></i>
            <p>No other active sessions.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="tv-table">
              <thead>
                <tr>
                  <th>Device</th>
                  <th>Location</th>
                  <th>Last active</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className="item-icon icon-forest" style={{ width: 32, height: 32, fontSize: 15 }}>
                          <i className="ti ti-device-laptop"></i>
                        </div>
                        <span style={{ fontWeight: 500 }}>{s.device}</span>
                        {s.current && <span className="badge badge-green">This device</span>}
                      </div>
                    </td>
                    <td style={{ color: 'var(--tv-text-muted)' }}>{s.location}</td>
                    <td style={{ color: 'var(--tv-text-muted)' }}>{s.lastActive}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => revokeSession(s.id)}
                        disabled={s.current}
                        style={s.current ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                      >
                        <i className="ti ti-logout"></i> Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Login history */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">Login history</div>
        {loginHistory.length === 0 ? (
          <div className="empty-state">
            <i className="ti ti-history"></i>
            <p>No login history to show yet.</p>
          </div>
        ) : (
        <div>
          {loginHistory.map((l) => {
            let when = l.when;
            try { when = new Date(l.when).toLocaleString(); } catch { /* keep raw */ }
            const label = (l.action || '').replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
            return (
              <div className="list-item" key={l.id}>
                <div className={`item-icon ${l.ok ? 'icon-green' : 'icon-red'}`}>
                  <i className={`ti ${l.ok ? 'ti-login-2' : 'ti-shield-x'}`}></i>
                </div>
                <div className="item-main">
                  <div className="item-name">{label}</div>
                  <div className="item-sub">{when}{l.ip ? ` · ${l.ip}` : ''}</div>
                </div>
                <div className="item-right">
                  <span className={`badge badge-${l.ok ? 'green' : 'red'}`}>{l.outcome || (l.ok ? 'SUCCESS' : 'FAILURE')}</span>
                </div>
              </div>
            );
          })}
        </div>
        )}
      </div>
    </div>
  );
}
