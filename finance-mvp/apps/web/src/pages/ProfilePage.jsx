import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import ProfileWizard from '../components/ProfileWizard';

/* Which core profile fields are still missing (drives the completion nudge). */
function missingProfileFields(p) {
  if (!p) return [];
  const checks = [
    [!p.firstName || !p.lastName, 'name'],
    [!p.dateOfBirth, 'date of birth'],
    [!p.addressLine1 || !p.postalCode, 'address'],
    [!p.ssnMasked, 'identity (SSN)'],
  ];
  return checks.filter(([missing]) => missing).map(([, label]) => label);
}

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

  // ── Full profile (auth/KYC) ─────────────────────────────────────────────
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState('');
  const [showSsn, setShowSsn] = useState(false);
  const [showEin, setShowEin] = useState(false);

  // Progressive-profiling wizard.
  const [showWizard, setShowWizard] = useState(false);

  // Edit mode + the editable draft.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(''); // success message
  const [saveErr, setSaveErr] = useState('');

  // Load the full profile on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await api.getProfile();
        if (cancelled) return;
        setProfile(p);
        // Progressive nudge: auto-open the wizard once per browser session when
        // core details are still missing (and the user hasn't dismissed it).
        if (missingProfileFields(p).length && !sessionStorage.getItem('tv_wizard_seen')) {
          sessionStorage.setItem('tv_wizard_seen', '1');
          setShowWizard(true);
        }
      } catch {
        if (!cancelled) setProfileError('Could not load your profile.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Open edit mode with a draft seeded from the loaded profile.
  const startEdit = () => {
    if (!profile) return;
    setDraft({
      name: profile.name || '',
      firstName: profile.firstName || '',
      lastName: profile.lastName || '',
      phone: profile.phone || '',
      dateOfBirth: profile.dateOfBirth || '',
      addressLine1: profile.addressLine1 || '',
      addressLine2: profile.addressLine2 || '',
      city: profile.city || '',
      state: profile.state || '',
      postalCode: profile.postalCode || '',
      country: profile.country || '',
      mfaChannel: profile.mfaChannel || 'EMAIL',
    });
    setSaveMsg('');
    setSaveErr('');
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft(null);
    setSaveErr('');
  };

  const setDraftField = (k, v) => setDraft((p) => ({ ...p, [k]: v }));

  const saveProfile = async () => {
    setSaving(true);
    setSaveErr('');
    setSaveMsg('');
    try {
      const updated = await api.updateProfile(draft);
      setProfile(updated || { ...profile, ...draft });
      setEditing(false);
      setDraft(null);
      setSaveMsg('Profile updated.');
    } catch (err) {
      setSaveErr(err?.message || 'Could not save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

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

      {/* Progressive-profiling nudge: shown only while core details are missing. */}
      {profile && missingProfileFields(profile).length > 0 && (
        <div className="card home-guide-banner" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
          <i className="ti ti-user-check" style={{ fontSize: 26, color: 'var(--tv-forest)' }}></i>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="item-name" style={{ fontSize: 15 }}>Finish setting up your profile</div>
            <div className="item-sub">
              Still needed: {missingProfileFields(profile).join(', ')}. It only takes a minute.
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowWizard(true)}>
            <i className="ti ti-arrow-right"></i> Complete
          </button>
        </div>
      )}

      {showWizard && (
        <ProfileWizard
          profile={profile}
          onClose={() => setShowWizard(false)}
          onComplete={async () => {
            // Re-fetch so the header card + completion nudge reflect every step
            // that was saved (the final step doesn't return a profile).
            try { setProfile(await api.getProfile()); } catch { /* keep current */ }
            setShowWizard(false);
          }}
        />
      )}

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

      {/* Personal details + KYC card */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Personal details</div>
          {!editing && profile && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={startEdit}>
              <i className="ti ti-edit"></i> Edit profile
            </button>
          )}
        </div>

        {profileError ? (
          <div className="setting-help" role="alert" style={{ color: 'var(--tv-danger, #c0392b)', marginTop: 8 }}>
            <i className="ti ti-alert-circle"></i> {profileError}
          </div>
        ) : !profile ? (
          <div className="setting-help" style={{ marginTop: 8 }}>Loading your profile…</div>
        ) : saveMsg && !editing ? (
          <div className="setting-help" style={{ color: 'var(--tv-positive, #2e7d32)', marginTop: 8 }}>
            <i className="ti ti-circle-check"></i> {saveMsg}
          </div>
        ) : null}

        {/* ── Read-only view ── */}
        {profile && !editing && (
          <div style={{ marginTop: 8 }}>
            <div className="setting-row">
              <div><div className="setting-label">Name</div><div className="setting-help">Your full name</div></div>
              <span style={{ color: 'var(--tv-text-muted)', fontSize: 13 }}>{profile.name || `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || '—'}</span>
            </div>

            <div className="setting-row">
              <div><div className="setting-label">Email</div><div className="setting-help">Your sign-in address</div></div>
              <div className="item-right" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'var(--tv-text-muted)', fontSize: 13 }}>{profile.email || '—'}</span>
                {profile.emailVerified ? (
                  <span className="badge badge-green"><i className="ti ti-shield-check"></i> Verified</span>
                ) : (
                  <span className="badge badge-gray">Unverified</span>
                )}
              </div>
            </div>

            <div className="setting-row">
              <div><div className="setting-label">Phone</div><div className="setting-help">Contact number</div></div>
              <div className="item-right" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'var(--tv-text-muted)', fontSize: 13 }}>{profile.phone || '—'}</span>
                {profile.phoneVerified ? (
                  <span className="badge badge-green"><i className="ti ti-shield-check"></i> Verified</span>
                ) : (
                  <span className="badge badge-gray">Unverified</span>
                )}
              </div>
            </div>

            <div className="setting-row">
              <div><div className="setting-label">Date of birth</div><div className="setting-help">Used for identity verification</div></div>
              <span style={{ color: 'var(--tv-text-muted)', fontSize: 13 }}>{profile.dateOfBirth || '—'}</span>
            </div>

            <div className="setting-row">
              <div><div className="setting-label">Address</div><div className="setting-help">Mailing / residential address</div></div>
              <span style={{ color: 'var(--tv-text-muted)', fontSize: 13, textAlign: 'right', maxWidth: 260 }}>
                {[profile.addressLine1, profile.addressLine2, [profile.city, profile.state].filter(Boolean).join(', '), profile.postalCode, profile.country]
                  .filter(Boolean).join(' · ') || '—'}
              </span>
            </div>

            <div className="setting-row">
              <div><div className="setting-label">Account type</div><div className="setting-help">{profile.accountType === 'BUSINESS' ? 'Business account' : 'Individual account'}</div></div>
              <span className="badge badge-forest">
                <i className={profile.accountType === 'BUSINESS' ? 'ti ti-building' : 'ti ti-user'}></i>{' '}
                {profile.accountType === 'BUSINESS' ? 'Business' : 'Individual'}
              </span>
            </div>

            {profile.businessName && (
              <div className="setting-row">
                <div><div className="setting-label">Business name</div><div className="setting-help">Registered company</div></div>
                <span style={{ color: 'var(--tv-text-muted)', fontSize: 13 }}>{profile.businessName}</span>
              </div>
            )}

            <div className="setting-row">
              <div><div className="setting-label">Identity verification</div><div className="setting-help">KYC status</div></div>
              {profile.identityVerified ? (
                <span className="badge badge-green"><i className="ti ti-shield-check"></i> Verified</span>
              ) : (
                <span className="badge badge-gray">Pending</span>
              )}
            </div>

            {/* SSN — masked, last-4 reveal only. The full SSN is never available. */}
            {profile.ssnMasked && (
              <div className="setting-row">
                <div><div className="setting-label">SSN</div><div className="setting-help">Only the last 4 digits are stored</div></div>
                <div className="item-right" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: 'var(--tv-text-muted)', fontSize: 13, letterSpacing: '0.05em' }}>
                    {showSsn ? profile.ssnMasked : '•••-••-••••'}
                  </span>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowSsn((s) => !s)} title={showSsn ? 'Hide' : 'Show'}>
                    <i className={showSsn ? 'ti ti-eye-off' : 'ti ti-eye'}></i> {showSsn ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
            )}

            {/* EIN — masked, last-4 reveal only. */}
            {profile.einMasked && (
              <div className="setting-row">
                <div><div className="setting-label">EIN</div><div className="setting-help">Only the last 4 digits are stored</div></div>
                <div className="item-right" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: 'var(--tv-text-muted)', fontSize: 13, letterSpacing: '0.05em' }}>
                    {showEin ? profile.einMasked : '••-•••••••'}
                  </span>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowEin((s) => !s)} title={showEin ? 'Hide' : 'Show'}>
                    <i className={showEin ? 'ti ti-eye-off' : 'ti ti-eye'}></i> {showEin ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
            )}

            <div className="setting-row">
              <div><div className="setting-label">Sign-in verification</div><div className="setting-help">Preferred MFA channel</div></div>
              <span className="badge badge-gray">
                <i className={profile.mfaChannel === 'SMS' ? 'ti ti-device-mobile' : 'ti ti-mail'}></i>{' '}
                {profile.mfaChannel === 'SMS' ? 'SMS' : 'Email'}
              </span>
            </div>
          </div>
        )}

        {/* ── Edit view ── */}
        {profile && editing && draft && (
          <div style={{ marginTop: 12 }}>
            {saveErr && (
              <div className="badge badge-red" style={{ display: 'flex', width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md)', marginBottom: 12 }}>
                <i className="ti ti-alert-circle"></i> {saveErr}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">First name</label>
                <input className="form-input" type="text" value={draft.firstName}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDraft((p) => ({ ...p, firstName: v, name: `${v} ${p.lastName || ''}`.trim() }));
                  }} />
              </div>
              <div className="form-group">
                <label className="form-label">Last name</label>
                <input className="form-input" type="text" value={draft.lastName}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDraft((p) => ({ ...p, lastName: v, name: `${p.firstName || ''} ${v}`.trim() }));
                  }} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Display name</label>
              <input className="form-input" type="text" value={draft.name} onChange={(e) => setDraftField('name', e.target.value)} />
            </div>

            <div className="form-group">
              <label className="form-label">Phone</label>
              <input className="form-input" type="tel" value={draft.phone} onChange={(e) => setDraftField('phone', e.target.value)} />
            </div>

            <div className="form-group">
              <label className="form-label">Date of birth</label>
              <input className="form-input" type="date" value={draft.dateOfBirth} onChange={(e) => setDraftField('dateOfBirth', e.target.value)} />
            </div>

            <div className="form-group">
              <label className="form-label">Address line 1</label>
              <input className="form-input" type="text" value={draft.addressLine1} onChange={(e) => setDraftField('addressLine1', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Address line 2</label>
              <input className="form-input" type="text" value={draft.addressLine2} onChange={(e) => setDraftField('addressLine2', e.target.value)} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">City</label>
                <input className="form-input" type="text" value={draft.city} onChange={(e) => setDraftField('city', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">State / Region</label>
                <input className="form-input" type="text" value={draft.state} onChange={(e) => setDraftField('state', e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Postal code</label>
                <input className="form-input" type="text" value={draft.postalCode} onChange={(e) => setDraftField('postalCode', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Country</label>
                <input className="form-input" type="text" value={draft.country} onChange={(e) => setDraftField('country', e.target.value)} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Preferred sign-in verification</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { key: 'EMAIL', icon: 'ti ti-mail', title: 'Email' },
                  { key: 'SMS', icon: 'ti ti-device-mobile', title: 'SMS' },
                ].map((opt) => {
                  const active = (draft.mfaChannel || 'EMAIL') === opt.key;
                  return (
                    <button key={opt.key} type="button" className="card" onClick={() => setDraftField('mfaChannel', opt.key)}
                      style={{ textAlign: 'left', padding: '10px 12px', cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center',
                        border: `1.5px solid ${active ? 'var(--tv-forest)' : 'var(--tv-border)'}`, background: active ? 'var(--tv-sage-pale)' : 'var(--tv-white)' }}>
                      <i className={opt.icon} style={{ color: active ? 'var(--tv-forest)' : 'var(--tv-text-muted)' }}></i>
                      <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--tv-text-primary)' }}>{opt.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={cancelEdit} disabled={saving}>Cancel</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={saveProfile} disabled={saving}>
                <i className="ti ti-device-floppy"></i> {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        )}
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

      {/* No staff-tools card: ops staff sign in separately at /ops with their own account, so a
          member profile never links to (or hints at) internal tooling. */}

      {/* Sign out */}
      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-danger" onClick={onLogout}>
          <i className="ti ti-logout"></i> Sign out
        </button>
      </div>
    </div>
  );
}
