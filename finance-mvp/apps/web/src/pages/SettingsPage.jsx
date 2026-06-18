import { useState, useEffect } from 'react';
import { api, setAuthToken, getStoredEmail, getStoredName } from '../api';
import { getTheme, applyTheme } from '../theme';
import { getSessionTimeoutMinutes, setSessionTimeoutMinutes } from '../hooks/useIdleLogout';

// Safe localStorage helpers for local-only preferences.
function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* non-fatal */ }
}

// Trigger a client-side file download from a text string.
function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Default notification preferences, used until the backend responds (or if it fails).
const DEFAULT_PREFS = {
  emailEnabled: true,
  pushEnabled: false,
  weeklySummary: true,
  budgetAlerts: true,
  paymentAlerts: true,
};

// Backend-backed notification toggles, in render order.
const NOTIFICATION_ROWS = [
  { key: 'emailEnabled', label: 'Email notifications', help: 'Account alerts and statements by email' },
  { key: 'pushEnabled', label: 'Push notifications', help: 'Real-time alerts on your devices' },
  { key: 'weeklySummary', label: 'Weekly summary', help: 'A digest of your activity every Monday' },
  { key: 'budgetAlerts', label: 'Budget alerts', help: 'Notify me when I approach budget limits' },
  { key: 'paymentAlerts', label: 'Payment alerts', help: 'Reminders for upcoming and completed payments' },
];

export default function SettingsPage() {
  // Backend-backed notification preferences.
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [prefsError, setPrefsError] = useState('');

  // Local-only appearance/regional preferences, persisted in localStorage so
  // selections survive a reload (lazy-initialised to avoid a flash of defaults).
  const [compactMode, setCompactMode] = useState(() => lsGet('tv-compact', false));
  // Dark mode is backed by the shared theme module (same `tv_theme` key the topbar
  // switcher uses), so the two stay in sync. We track a local mirror for the toggle.
  const [darkMode, setDarkMode] = useState(() => getTheme() === 'dark');
  const [currency, setCurrency] = useState(() => lsGet('tv-currency', 'USD'));
  const [language, setLanguage] = useState(() => lsGet('tv-language', 'en'));
  const [timezone, setTimezone] = useState(() => lsGet('tv-timezone', 'America/New_York'));

  // Persist + apply local prefs whenever they change.
  useEffect(() => { lsSet('tv-currency', currency); }, [currency]);
  useEffect(() => { lsSet('tv-language', language); }, [language]);
  useEffect(() => { lsSet('tv-timezone', timezone); }, [timezone]);
  useEffect(() => {
    lsSet('tv-compact', compactMode);
    document.body.classList.toggle('tv-compact', compactMode);
    return () => document.body.classList.remove('tv-compact');
  }, [compactMode]);
  // Apply the theme app-wide whenever the toggle changes (persisted by applyTheme).
  // Preserves a non-dark custom theme (e.g. "glass") by only switching the dark axis.
  useEffect(() => {
    applyTheme(darkMode ? 'dark' : (getTheme() === 'dark' ? 'light' : getTheme()));
  }, [darkMode]);

  // Data & privacy UI state.
  const [exportRequested, setExportRequested] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Security: auto-logout idle window (minutes). Default 5, max 30. Persisted to the
  // profile (so it follows the user across devices) and locally (so the idle timer uses
  // it immediately).
  const [sessionTimeout, setSessionTimeout] = useState(getSessionTimeoutMinutes());
  useEffect(() => {
    api
      .getProfile()
      .then((p) => {
        if (p && p.sessionTimeoutMinutes) {
          setSessionTimeout(p.sessionTimeoutMinutes);
          setSessionTimeoutMinutes(p.sessionTimeoutMinutes);
        }
      })
      .catch(() => {});
  }, []);
  async function changeSessionTimeout(minutes) {
    setSessionTimeout(minutes);
    setSessionTimeoutMinutes(minutes); // idle timer picks this up immediately
    try {
      await api.updateProfile({ sessionTimeoutMinutes: minutes });
    } catch {
      /* local setting still applies even if the save fails */
    }
  }

  // Load saved notification preferences on mount; fall back to defaults on failure.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await api.getNotificationPreferences();
        if (cancelled || !saved) return;
        setPrefs((prev) => ({
          emailEnabled: saved.emailEnabled ?? prev.emailEnabled,
          pushEnabled: saved.pushEnabled ?? prev.pushEnabled,
          weeklySummary: saved.weeklySummary ?? prev.weeklySummary,
          budgetAlerts: saved.budgetAlerts ?? prev.budgetAlerts,
          paymentAlerts: saved.paymentAlerts ?? prev.paymentAlerts,
        }));
      } catch {
        // Keep defaults; surface a gentle, non-blocking error.
        if (!cancelled) setPrefsError('Could not load your preferences. Showing defaults.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Build the full backend payload from a prefs object.
  const toPayload = (p) => ({
    emailEnabled: p.emailEnabled,
    pushEnabled: p.pushEnabled,
    weeklySummary: p.weeklySummary,
    budgetAlerts: p.budgetAlerts,
    paymentAlerts: p.paymentAlerts,
  });

  // Optimistic toggle for backend-backed prefs; revert + show error on failure.
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

  // Gather the user's data across services and download it as a real JSON file.
  // Each source is best-effort so one failing endpoint doesn't abort the whole export.
  const handleExport = async () => {
    setExporting(true);
    setExportRequested(false);
    const safe = async (fn) => { try { return await fn(); } catch { return null; } };
    try {
      const [profile, snapshot, accounts, transactions, goals, debts, properties, notifications] = await Promise.all([
        safe(() => ({ email: getStoredEmail(), name: getStoredName() })),
        safe(() => api.getSnapshot('All')),
        safe(() => api.getAccounts()),
        safe(() => api.getTransactions()),
        safe(() => api.getGoals()),
        safe(() => api.getDebts()),
        safe(() => api.getRealEstate()),
        safe(() => api.getNotifications()),
      ]);
      const payload = {
        exportedAt: new Date().toISOString(),
        app: 'TerraVest',
        profile,
        netWorthSnapshot: snapshot,
        accounts,
        transactions,
        goals,
        debts,
        properties,
        notifications,
        preferences: { prefs, currency, language, timezone, compactMode, darkMode },
      };
      downloadTextFile(
        `terravest-data-export-${new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify(payload, null, 2),
      );
      setExportRequested(true);
    } finally {
      setExporting(false);
    }
  };

  // Generate a basic monthly statement client-side so the action produces a real file.
  const handleDownloadStatement = () => {
    const now = new Date();
    const period = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    const lines = [
      'TERRAVEST — MONTHLY STATEMENT',
      `Period: ${period}`,
      `Generated: ${now.toLocaleString()}`,
      '',
      'This is a summary statement generated from your TerraVest account.',
      'A detailed PDF statement will be available when statement delivery is enabled.',
      '',
      `Display currency: ${currency}`,
      `Timezone: ${timezone}`,
    ];
    downloadTextFile(`terravest-statement-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}.txt`, lines.join('\n'));
  };

  // Permanently delete the account on the backend, then clear the local session
  // and reload so the app returns to the sign-in screen.
  const handleDeleteConfirmed = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      await api.deleteAccount();
      setAuthToken(null);
      window.location.reload();
    } catch {
      setDeleting(false);
      setDeleteError('Could not delete your account. Please try again.');
    }
  };

  return (
    <div id="page-settings" className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">Settings</div>
          <div className="page-subtitle">Manage your preferences, notifications, and data</div>
        </div>
      </div>

      <div className="grid-2">
        {/* Notifications card (backend-backed) */}
        <div className="card">
          <div className="card-title">Notifications</div>

          {prefsError ? (
            <div
              className="setting-help"
              role="alert"
              style={{ color: 'var(--tv-negative)', marginBottom: 8 }}
            >
              <i className="ti ti-alert-circle"></i> {prefsError}
            </div>
          ) : null}

          {loading ? (
            <div className="setting-help" style={{ padding: '8px 0' }}>
              <i className="ti ti-loader-2 spin"></i> Loading preferences…
            </div>
          ) : (
            NOTIFICATION_ROWS.map((row) => (
              <div className="setting-row" key={row.key}>
                <div>
                  <div className="setting-label">{row.label}</div>
                  <div className="setting-help">{row.help}</div>
                </div>
                <div
                  className={`toggle ${prefs[row.key] ? 'on' : ''}`}
                  role="switch"
                  aria-checked={prefs[row.key]}
                  aria-label={row.label}
                  onClick={() => toggleBackendPref(row.key)}
                ></div>
              </div>
            ))
          )}
        </div>

        {/* Security card (profile-backed) */}
        <div className="card">
          <div className="card-title">Security</div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="settings-session-timeout">
              Auto-logout after inactivity
            </label>
            <select
              id="settings-session-timeout"
              className="form-select"
              value={sessionTimeout}
              onChange={(e) => changeSessionTimeout(Number(e.target.value))}
            >
              <option value={5}>5 minutes (default)</option>
              <option value={10}>10 minutes</option>
              <option value={15}>15 minutes</option>
              <option value={20}>20 minutes</option>
              <option value={30}>30 minutes (max)</option>
            </select>
            <div className="setting-help">
              For your security, you'll be signed out automatically after this much inactivity.
            </div>
          </div>
        </div>

        {/* Appearance card (local-only) */}
        <div className="card">
          <div className="card-title">Appearance</div>

          <div className="setting-row">
            <div>
              <div className="setting-label">Compact mode</div>
              <div className="setting-help">Reduce spacing for a denser layout</div>
            </div>
            <div
              className={`toggle ${compactMode ? 'on' : ''}`}
              role="switch"
              aria-checked={compactMode}
              aria-label="Compact mode"
              onClick={() => setCompactMode((v) => !v)}
            ></div>
          </div>

          <div className="setting-row">
            <div>
              <div className="setting-label">Dark mode</div>
              <div className="setting-help">Use a darker color theme across the app</div>
            </div>
            <div
              className={`toggle ${darkMode ? 'on' : ''}`}
              role="switch"
              aria-checked={darkMode}
              aria-label="Dark mode"
              onClick={() => setDarkMode((v) => !v)}
            ></div>
          </div>

          <div className="divider" />

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="settings-currency">Display currency</label>
            <select
              id="settings-currency"
              className="form-select"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              <option value="USD">USD — US Dollar</option>
              <option value="EUR">EUR — Euro</option>
              <option value="GBP">GBP — British Pound</option>
            </select>
          </div>
        </div>

        {/* Regional card (local-only) */}
        <div className="card">
          <div className="card-title">Regional</div>

          <div className="form-group">
            <label className="form-label" htmlFor="settings-language">Language</label>
            <select
              id="settings-language"
              className="form-select"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <option value="en">English</option>
              <option value="es">Español</option>
              <option value="fr">Français</option>
              <option value="de">Deutsch</option>
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="settings-timezone">Timezone</label>
            <select
              id="settings-timezone"
              className="form-select"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            >
              <option value="America/New_York">Eastern Time (ET)</option>
              <option value="America/Chicago">Central Time (CT)</option>
              <option value="America/Denver">Mountain Time (MT)</option>
              <option value="America/Los_Angeles">Pacific Time (PT)</option>
              <option value="Europe/London">London (GMT)</option>
              <option value="Europe/Paris">Central European Time (CET)</option>
            </select>
          </div>
        </div>

        {/* Data & Privacy card */}
        <div className="card">
          <div className="card-title">Data &amp; Privacy</div>

          <div className="setting-row">
            <div>
              <div className="setting-label">Export my data</div>
              <div className="setting-help">Download a copy of your account data</div>
              {exportRequested ? (
                <div className="setting-help" style={{ color: 'var(--tv-forest)' }}>
                  <i className="ti ti-check"></i> Your data file has been downloaded.
                </div>
              ) : null}
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleExport} disabled={exporting}>
              <i className={`ti ${exporting ? 'ti-loader-2 spin' : 'ti-download'}`}></i> {exporting ? 'Preparing…' : 'Export'}
            </button>
          </div>

          <div className="setting-row">
            <div>
              <div className="setting-label">Download statements</div>
              <div className="setting-help">Get monthly PDF statements</div>
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleDownloadStatement}>
              <i className="ti ti-file-text"></i> Download
            </button>
          </div>

          <div className="setting-row">
            <div>
              <div className="setting-label">Delete account</div>
              <div className="setting-help">Permanently remove your account and data</div>
              {confirmingDelete ? (
                <div
                  className="setting-help"
                  role="alert"
                  style={{ color: 'var(--tv-negative)', marginTop: 6 }}
                >
                  Are you sure? This permanently deletes your account and cannot be undone.
                </div>
              ) : null}
              {deleteError ? (
                <div className="setting-help" role="alert" style={{ color: 'var(--tv-negative)', marginTop: 6 }}>
                  <i className="ti ti-alert-circle"></i> {deleteError}
                </div>
              ) : null}
            </div>
            {confirmingDelete ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={handleDeleteConfirmed}
                  disabled={deleting}
                >
                  <i className={`ti ${deleting ? 'ti-loader-2 spin' : 'ti-trash'}`}></i> {deleting ? 'Deleting…' : 'Confirm'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={deleting}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => setConfirmingDelete(true)}
              >
                <i className="ti ti-trash"></i> Delete account
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
