import { useState } from 'react';

/* Mock active sessions — the first is the current device. */
const INITIAL_SESSIONS = [
  { id: 's1', device: 'MacBook Pro · Chrome', location: 'San Francisco, CA', lastActive: 'Active now', current: true },
  { id: 's2', device: 'iPhone 15 · Safari', location: 'San Francisco, CA', lastActive: '2 hours ago', current: false },
  { id: 's3', device: 'Windows PC · Edge', location: 'New York, NY', lastActive: 'Yesterday, 6:42 PM', current: false },
];

/* Mock recent login history. */
const LOGIN_HISTORY = [
  { id: 'l1', when: 'Jun 6, 2026 · 9:12 AM', location: 'San Francisco, CA', status: 'Success', tone: 'green' },
  { id: 'l2', when: 'Jun 5, 2026 · 7:48 PM', location: 'San Francisco, CA', status: 'Success', tone: 'green' },
  { id: 'l3', when: 'Jun 4, 2026 · 11:03 PM', location: 'Berlin, DE', status: 'Blocked', tone: 'red' },
  { id: 'l4', when: 'Jun 3, 2026 · 8:21 AM', location: 'San Francisco, CA', status: 'Success', tone: 'green' },
];

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
        <div>
          {LOGIN_HISTORY.map((l) => (
            <div className="list-item" key={l.id}>
              <div className={`item-icon ${l.tone === 'green' ? 'icon-green' : 'icon-red'}`}>
                <i className={`ti ${l.tone === 'green' ? 'ti-login-2' : 'ti-shield-x'}`}></i>
              </div>
              <div className="item-main">
                <div className="item-name">{l.when}</div>
                <div className="item-sub">{l.location}</div>
              </div>
              <div className="item-right">
                <span className={`badge badge-${l.tone}`}>{l.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
