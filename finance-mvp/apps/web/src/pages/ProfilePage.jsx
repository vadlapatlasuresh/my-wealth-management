import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

/* Derive up-to-two-letter initials from an email address. */
function initialsFromEmail(email) {
  if (!email) return '?';
  const local = String(email).split('@')[0] || '';
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length === 0) return (email[0] || '?').toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function ProfilePage({ user, accounts, onLogout }) {
  const navigate = useNavigate();
  const email = user?.email;
  const initials = initialsFromEmail(email);
  const linkedCount = accounts?.length ?? 0;

  // Backend-backed notification preferences (api shape) + local-only darkMode.
  const [prefs, setPrefs] = useState({
    emailEnabled: true,
    pushEnabled: false,
    weeklySummary: true,
    budgetAlerts: true,
    paymentAlerts: true,
    darkMode: false,
  });
  const [prefsError, setPrefsError] = useState('');

  // Load saved notification preferences on mount; fall back to defaults on failure.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await api.getNotificationPreferences();
        if (cancelled || !saved) return;
        setPrefs((prev) => ({
          ...prev,
          emailEnabled: saved.emailEnabled ?? prev.emailEnabled,
          pushEnabled: saved.pushEnabled ?? prev.pushEnabled,
          weeklySummary: saved.weeklySummary ?? prev.weeklySummary,
          budgetAlerts: saved.budgetAlerts ?? prev.budgetAlerts,
          paymentAlerts: saved.paymentAlerts ?? prev.paymentAlerts,
        }));
      } catch {
        // Keep defaults; surface a gentle, non-blocking error.
        if (!cancelled) setPrefsError('Could not load your preferences.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Build the full backend payload (excludes local-only fields like darkMode).
  const toPayload = (p) => ({
    emailEnabled: p.emailEnabled,
    pushEnabled: p.pushEnabled,
    weeklySummary: p.weeklySummary,
    budgetAlerts: p.budgetAlerts,
    paymentAlerts: p.paymentAlerts,
  });

  // Local-only toggle (no persistence).
  const toggleLocalPref = (key) =>
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));

  // Optimistic toggle for backend-backed prefs; revert on failure.
  const toggleBackendPref = async (key) => {
    const prevPrefs = prefs;
    const next = { ...prevPrefs, [key]: !prevPrefs[key] };
    setPrefs(next);
    setPrefsError('');
    try {
      await api.putNotificationPreferences(toPayload(next));
    } catch {
      setPrefs(prevPrefs);
      setPrefsError('Could not save your change. Please try again.');
    }
  };

  return (
    <div id="page-profile" className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">Profile</div>
          <div className="page-subtitle">Manage your account, security, and preferences</div>
        </div>
      </div>

      {/* Profile header card */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            className="user-avatar"
            style={{
              width: 56,
              height: 56,
              fontSize: 20,
              background: 'var(--tv-forest)',
            }}
          >
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="item-name" style={{ fontSize: 16 }}>
              {email || 'Unknown user'}
            </div>
            <div className="item-sub">{linkedCount} linked account{linkedCount === 1 ? '' : 's'}</div>
          </div>
          <span className="badge badge-forest">
            <i className="ti ti-user-check"></i> Member
          </span>
        </div>
      </div>

      <div className="grid-2">
        {/* Account card */}
        <div className="card">
          <div className="card-title">Account</div>

          <div className="setting-row">
            <div>
              <div className="setting-label">Email</div>
              <div className="setting-help">Your sign-in address</div>
            </div>
            <span style={{ color: 'var(--tv-text-muted)', fontSize: 13 }}>
              {email || '—'}
            </span>
          </div>

          <div className="setting-row">
            <div>
              <div className="setting-label">Linked accounts</div>
              <div className="setting-help">Connected institutions</div>
            </div>
            <span className="badge badge-gray">{linkedCount}</span>
          </div>

          <div className="setting-row">
            <div>
              <div className="setting-label">Plan tier</div>
              <div className="setting-help">Your current subscription</div>
            </div>
            <span className="badge badge-gold">
              <i className="ti ti-crown"></i> TerraVest Premium
            </span>
          </div>
        </div>

        {/* Preferences card */}
        <div className="card">
          <div className="card-title">Preferences</div>

          {prefsError ? (
            <div
              className="setting-help"
              role="alert"
              style={{ color: 'var(--tv-danger, #c0392b)', marginBottom: 8 }}
            >
              <i className="ti ti-alert-circle"></i> {prefsError}
            </div>
          ) : null}

          <div className="setting-row">
            <div>
              <div className="setting-label">Email notifications</div>
              <div className="setting-help">Account alerts and statements by email</div>
            </div>
            <div
              className={`toggle ${prefs.emailEnabled ? 'on' : ''}`}
              role="switch"
              aria-checked={prefs.emailEnabled}
              onClick={() => toggleBackendPref('emailEnabled')}
            ></div>
          </div>

          <div className="setting-row">
            <div>
              <div className="setting-label">Push notifications</div>
              <div className="setting-help">Real-time alerts on your devices</div>
            </div>
            <div
              className={`toggle ${prefs.pushEnabled ? 'on' : ''}`}
              role="switch"
              aria-checked={prefs.pushEnabled}
              onClick={() => toggleBackendPref('pushEnabled')}
            ></div>
          </div>

          <div className="setting-row">
            <div>
              <div className="setting-label">Weekly summary</div>
              <div className="setting-help">A digest of your activity every Monday</div>
            </div>
            <div
              className={`toggle ${prefs.weeklySummary ? 'on' : ''}`}
              role="switch"
              aria-checked={prefs.weeklySummary}
              onClick={() => toggleBackendPref('weeklySummary')}
            ></div>
          </div>

          <div className="setting-row">
            <div>
              <div className="setting-label">Budget alerts</div>
              <div className="setting-help">Notify me when I approach budget limits</div>
            </div>
            <div
              className={`toggle ${prefs.budgetAlerts ? 'on' : ''}`}
              role="switch"
              aria-checked={prefs.budgetAlerts}
              onClick={() => toggleBackendPref('budgetAlerts')}
            ></div>
          </div>

          <div className="setting-row">
            <div>
              <div className="setting-label">Payment alerts</div>
              <div className="setting-help">Reminders for upcoming and completed payments</div>
            </div>
            <div
              className={`toggle ${prefs.paymentAlerts ? 'on' : ''}`}
              role="switch"
              aria-checked={prefs.paymentAlerts}
              onClick={() => toggleBackendPref('paymentAlerts')}
            ></div>
          </div>

          <div className="setting-row">
            <div>
              <div className="setting-label">Dark mode</div>
              <div className="setting-help">Use a darker color theme</div>
            </div>
            <div
              className={`toggle ${prefs.darkMode ? 'on' : ''}`}
              role="switch"
              aria-checked={prefs.darkMode}
              onClick={() => toggleLocalPref('darkMode')}
            ></div>
          </div>
        </div>
      </div>

      {/* Security card */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">Security</div>

        <div className="setting-row">
          <div>
            <div className="setting-label">Two-factor authentication</div>
            <div className="setting-help">Add an extra layer of protection at sign-in</div>
          </div>
          <div className="item-right" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="badge badge-gray">Not enabled</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate('/security')}>
              <i className="ti ti-shield-lock"></i> Enable
            </button>
          </div>
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">Password</div>
            <div className="setting-help">Last updated a while ago</div>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate('/security')}>
            <i className="ti ti-key"></i> Change
          </button>
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">Active sessions</div>
            <div className="setting-help">Manage devices signed in to your account</div>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate('/security')}>
            <i className="ti ti-devices"></i> Manage
          </button>
        </div>
      </div>

      {/* Sign out */}
      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-danger" onClick={onLogout}>
          <i className="ti ti-logout"></i> Sign out
        </button>
      </div>
    </div>
  );
}
