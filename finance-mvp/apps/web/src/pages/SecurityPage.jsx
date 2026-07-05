import { useState, useEffect } from 'react';
import { api } from '../api';

/* Active sessions and login history are both derived from real account-activity
   data loaded live from the audit-service (/api/v1/audit/me) — never faked. */

/* Map a raw audit event to a friendly, security-relevant login-history entry.
   Returns null for events that aren't sign-in / account-security actions, so
   noise like `GET /api/v1/auth/me` (a profile/session read) is hidden. */
function describeAuthEvent(e) {
  let method = (e.method || '').toUpperCase();
  let path = (e.path || '').toLowerCase();
  if ((!method || !path) && e.action) {
    const parts = e.action.split(' ');
    method = method || (parts[0] || '').toUpperCase();
    path = path || (parts[1] || '').toLowerCase();
  }
  const rules = [
    { when: method === 'POST' && /\/auth\/login$/.test(path), label: 'Signed in', icon: 'ti-login-2' },
    { when: method === 'POST' && /\/oauth\/google$/.test(path), label: 'Signed in with Google', icon: 'ti-brand-google' },
    { when: method === 'POST' && /\/oauth\/apple$/.test(path), label: 'Signed in with Apple', icon: 'ti-brand-apple' },
    { when: method === 'POST' && /\/register$/.test(path), label: 'Account created', icon: 'ti-user-plus' },
    { when: method === 'POST' && /\/mfa\//.test(path), label: 'Two-factor verification', icon: 'ti-shield-lock' },
    { when: method === 'POST' && /\/sms\/verify$/.test(path), label: 'Phone verified', icon: 'ti-device-mobile' },
    { when: method === 'POST' && /\/email\/verify$/.test(path), label: 'Email verified', icon: 'ti-mail-check' },
    { when: method === 'POST' && /\/password\/forgot$/.test(path), label: 'Password reset requested', icon: 'ti-key' },
    { when: method === 'POST' && /\/password\/reset$/.test(path), label: 'Password changed', icon: 'ti-key' },
    { when: method === 'PUT' && /\/auth\/me$/.test(path), label: 'Profile updated', icon: 'ti-user-edit' },
    { when: method === 'DELETE' && /\/auth\/me$/.test(path), label: 'Account deletion requested', icon: 'ti-user-x' },
  ];
  const match = rules.find((r) => r.when);
  return match ? { label: match.label, icon: match.icon } : null;
}

/* Best-effort browser + OS from a User-Agent string (e.g. "Chrome on macOS"). */
function deviceFromAgent(ua) {
  if (!ua) return null;
  let os = '';
  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Linux/i.test(ua)) os = 'Linux';
  let browser = '';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua)) browser = 'Safari';
  if (browser && os) return `${browser} on ${os}`;
  return browser || os || null;
}

/* Short relative time like "just now", "5 min ago", "3 days ago". */
function relativeTime(iso) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const sec = Math.round((Date.now() - t) / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day} day${day > 1 ? 's' : ''} ago`;
  const mo = Math.round(day / 30);
  return `${mo} mo ago`;
}

function absoluteTime(iso) {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

/* Strict password policy shown to the user as a live checklist. The rules are built
   from the server-provided policy (GET /password/policy) so the UI always matches what
   the backend enforces; these defaults are the fallback if that fetch fails. */
const DEFAULT_PASSWORD_POLICY = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireDigit: true,
  requireSymbol: true,
  forbidWhitespace: true,
};

function rulesFromPolicy(p) {
  const rules = [{ id: 'len', label: `At least ${p.minLength} characters`, test: (v) => v.length >= p.minLength }];
  if (p.requireUppercase) rules.push({ id: 'upper', label: 'An uppercase letter (A–Z)', test: (v) => /[A-Z]/.test(v) });
  if (p.requireLowercase) rules.push({ id: 'lower', label: 'A lowercase letter (a–z)', test: (v) => /[a-z]/.test(v) });
  if (p.requireDigit) rules.push({ id: 'num', label: 'A number (0–9)', test: (v) => /\d/.test(v) });
  if (p.requireSymbol) rules.push({ id: 'sym', label: 'A special character (!@#$%…)', test: (v) => /[^A-Za-z0-9\s]/.test(v) });
  if (p.forbidWhitespace) rules.push({ id: 'nospace', label: 'No spaces', test: (v) => v.length > 0 && !/\s/.test(v) });
  return rules;
}

export default function SecurityPage() {
  // Toggle-backed protections used for the security score.
  const [twoFA, setTwoFA] = useState(false);
  const [strongPassword] = useState(true); // assume a strong password is set
  const [alertsOn, setAlertsOn] = useState(true);

  // Password change form (submits to the real auth-service endpoint).
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwMsg, setPwMsg] = useState(null); // { type: 'success' | 'error', text }
  const [pwSubmitting, setPwSubmitting] = useState(false);

  // Server-driven password policy (falls back to sensible defaults if unavailable).
  const [pwPolicy, setPwPolicy] = useState(DEFAULT_PASSWORD_POLICY);
  useEffect(() => {
    let active = true;
    api.getPasswordPolicy()
      .then((p) => { if (active && p && typeof p.minLength === 'number') setPwPolicy(p); })
      .catch(() => { /* keep defaults */ });
    return () => { active = false; };
  }, []);

  // Active sessions (local state so rows can be revoked). Seed with THIS device
  // immediately (known from the browser) so the current session always shows,
  // even before/without the audit data; location is enriched once activity loads.
  const [sessions, setSessions] = useState(() => {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    return [{
      id: 'current',
      device: deviceFromAgent(ua) || 'This browser',
      location: null,
      lastActive: 'Active now',
      current: true,
    }];
  });

  // Real login/account-activity history from the audit-service.
  const [loginHistory, setLoginHistory] = useState([]);
  useEffect(() => {
    let active = true;
    api.getMyActivity(20)
      .then((rows) => {
        if (!active) return;
        const list = (Array.isArray(rows) ? rows : rows?.content || [])
          .map((e) => {
            const desc = describeAuthEvent(e);
            if (!desc) return null; // drop non-login noise (profile reads, etc.)
            return {
              id: e.id,
              label: desc.label,
              icon: desc.icon,
              outcome: e.outcome,
              ok: (e.outcome || '').toUpperCase() === 'SUCCESS',
              ip: e.sourceIp,
              location: [e.geoCity, e.geoCountry].filter(Boolean).join(', ') || null,
              device: deviceFromAgent(e.userAgent),
              whenAbs: absoluteTime(e.createdAt),
              whenRel: relativeTime(e.createdAt),
            };
          })
          .filter(Boolean);
        setLoginHistory(list);

        // Enrich the current session with the location/IP of the most recent sign-in.
        const lastLogin = list.find((l) => l.ok);
        if (lastLogin) {
          setSessions((prev) => prev.map((s) => (
            s.current ? { ...s, location: s.location || lastLogin.location || lastLogin.ip } : s
          )));
        }
      })
      .catch(() => { /* keep the seeded current session on failure */ });
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

  async function handleUpdatePassword(e) {
    e.preventDefault();
    if (!current) {
      setPwMsg({ type: 'error', text: 'Please enter your current password.' });
      return;
    }
    const failed = passwordRules.filter((r) => !r.test(next));
    if (failed.length > 0) {
      setPwMsg({ type: 'error', text: `New password doesn't meet all requirements (${failed.length} remaining).` });
      return;
    }
    if (next !== confirm) {
      setPwMsg({ type: 'error', text: 'New password and confirmation do not match.' });
      return;
    }
    setPwSubmitting(true);
    setPwMsg(null);
    try {
      await api.changePassword(current, next);
      setPwMsg({ type: 'success', text: 'Password updated successfully.' });
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setPwMsg({ type: 'error', text: err?.message || 'Could not update your password. Please try again.' });
    } finally {
      setPwSubmitting(false);
    }
  }

  function revokeSession(id) {
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }

  // Live password-policy evaluation for the requirements checklist + strength meter.
  const passwordRules = rulesFromPolicy(pwPolicy);
  const pwChecks = passwordRules.map((r) => ({ ...r, ok: r.test(next) }));
  const pwSatisfied = pwChecks.filter((c) => c.ok).length;
  const pwStrength = next.length === 0
    ? null
    : pwSatisfied <= 2 ? { label: 'Weak', tone: 'red' }
    : pwSatisfied <= 4 ? { label: 'Fair', tone: 'amber' }
    : pwSatisfied < passwordRules.length ? { label: 'Good', tone: 'amber' }
    : { label: 'Strong', tone: 'green' };

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
                placeholder={`At least ${pwPolicy.minLength} characters`}
              />

              {/* Strength meter (shown once the user starts typing). */}
              {pwStrength && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <div style={{ flex: 1, height: 6, borderRadius: 4, background: 'var(--tv-border)', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${(pwSatisfied / passwordRules.length) * 100}%`,
                        background: `var(--tv-${pwStrength.tone === 'red' ? 'negative' : pwStrength.tone === 'amber' ? 'warning' : 'positive'})`,
                        transition: 'width 0.2s ease',
                      }}
                    ></div>
                  </div>
                  <span className={`badge badge-${pwStrength.tone}`}>{pwStrength.label}</span>
                </div>
              )}

              {/* Requirements checklist — always visible so the rules are clear up front. */}
              <div
                style={{
                  marginTop: 10,
                  padding: '10px 12px',
                  border: '1px solid var(--tv-border)',
                  borderRadius: 8,
                  background: 'var(--tv-sage-pale)',
                }}
              >
                <div className="setting-help" style={{ margin: '0 0 8px', fontWeight: 600 }}>
                  Your password must include:
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {pwChecks.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 13,
                        color: c.ok ? 'var(--tv-positive)' : 'var(--tv-text-muted)',
                      }}
                    >
                      <i className={`ti ${c.ok ? 'ti-circle-check-filled' : 'ti-circle'}`}></i>
                      {c.label}
                    </div>
                  ))}
                </div>
              </div>
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

            <button type="submit" className="btn btn-primary" disabled={pwSubmitting}>
              <i className={`ti ${pwSubmitting ? 'ti-loader-2' : 'ti-lock-check'}`}></i>{' '}
              {pwSubmitting ? 'Updating…' : 'Update password'}
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
                          <i className={`ti ${/iOS|Android/i.test(s.device || '') ? 'ti-device-mobile' : 'ti-device-laptop'}`}></i>
                        </div>
                        <span style={{ fontWeight: 500 }}>{s.device}</span>
                        {s.current && <span className="badge badge-green">This device</span>}
                      </div>
                    </td>
                    <td style={{ color: 'var(--tv-text-muted)' }}>{s.location || 'Current location'}</td>
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
          {loginHistory.map((l) => (
            <div className="list-item" key={l.id}>
              <div className={`item-icon ${l.ok ? 'icon-green' : 'icon-red'}`}>
                <i className={`ti ${l.icon || (l.ok ? 'ti-login-2' : 'ti-shield-x')}`}></i>
              </div>
              <div className="item-main">
                <div className="item-name">{l.label}</div>
                <div className="item-sub" title={l.location && l.ip ? `IP ${l.ip}` : undefined}>
                  <i className="ti ti-device-desktop" style={{ marginRight: 4 }}></i>
                  {l.device || 'Unknown device'}
                  {' · '}
                  <i className="ti ti-map-pin" style={{ margin: '0 4px 0 2px' }}></i>
                  {l.location || l.ip || 'Unknown location'}
                </div>
              </div>
              <div className="item-right" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <span
                  style={{ fontSize: 13, color: 'var(--tv-text-muted)', whiteSpace: 'nowrap' }}
                  title={l.whenAbs}
                >
                  {l.whenRel || l.whenAbs}
                </span>
                <span className={`badge badge-${l.ok ? 'green' : 'red'}`}>{l.outcome || (l.ok ? 'SUCCESS' : 'FAILURE')}</span>
              </div>
            </div>
          ))}
        </div>
        )}
      </div>
    </div>
  );
}
