import React, { useEffect, useState } from 'react';
import { api, getOpsUserId } from '../api';

/**
 * Ops account + access administration (needs ops.user.manage).
 *
 * Two things live here on purpose: the ACCOUNTS (who is staff) and the ACCESS MATRIX (what each
 * role can do). Keeping them on one screen is what makes "who can see customer PII?" answerable by
 * looking, rather than by reading a migration.
 *
 * This is deliberately NOT reachable from a customer's record — granting staff access from a
 * customer profile is what the old (removed) promotion path did.
 */

function ts(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** OPS_SUPERVISOR → "Supervisor". The OPS_ prefix is meaningful in the token, not to a human. */
function roleLabel(key) {
  const bare = String(key).replace(/^OPS_/, '');
  return bare.charAt(0) + bare.slice(1).toLowerCase();
}

export default function OpsAccountsPage() {
  const [tab, setTab] = useState('users'); // users | matrix
  const [users, setUsers] = useState(null);
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [creating, setCreating] = useState(false);
  const me = getOpsUserId();

  async function load() {
    setError('');
    try {
      const [u, r, p] = await Promise.all([api.opsListUsers(), api.opsListRoles(), api.opsListPermissions()]);
      setUsers(Array.isArray(u) ? u : []);
      setRoles(Array.isArray(r) ? r : []);
      setPermissions(Array.isArray(p) ? p : []);
    } catch (e) {
      setError(e.message || 'Could not load ops accounts');
      setUsers([]);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function toggleActive(u) {
    setBusy(`active-${u.id}`); setNotice(''); setError('');
    try {
      await api.opsSetUserActive(u.id, !u.active);
      setNotice(`${u.email} is now ${!u.active ? 'active' : 'deactivated'}.`);
      await load();
    } catch (e) {
      setError(e.message || 'Could not change the account state');
    } finally { setBusy(''); }
  }

  async function toggleRole(u, roleKey) {
    const next = u.roles.includes(roleKey) ? u.roles.filter((r) => r !== roleKey) : [...u.roles, roleKey];
    if (next.length === 0) {
      setError('An ops account needs at least one role. Deactivate it instead.');
      return;
    }
    setBusy(`role-${u.id}-${roleKey}`); setNotice(''); setError('');
    try {
      await api.opsSetUserRoles(u.id, next);
      setNotice(`${u.email}: roles updated. Takes effect on their next sign-in.`);
      await load();
    } catch (e) {
      setError(e.message || 'Could not update roles');
    } finally { setBusy(''); }
  }

  async function togglePermission(role, permKey) {
    const next = role.permissions.includes(permKey)
      ? role.permissions.filter((p) => p !== permKey)
      : [...role.permissions, permKey];
    setBusy(`perm-${role.key}-${permKey}`); setNotice(''); setError('');
    try {
      await api.opsSetRolePermissions(role.key, next);
      setNotice(`${role.name}: access updated. Existing sessions keep their old access until they sign in again.`);
      await load();
    } catch (e) {
      setError(e.message || 'Could not update the role');
    } finally { setBusy(''); }
  }

  return (
    <div className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">Ops accounts &amp; access</div>
          <div className="page-subtitle">
            Who is staff, and what each role can do. Staff access is granted here — never from a customer's record.
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load}><i className="ti ti-refresh"></i> Refresh</button>
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'var(--tv-negative)', marginBottom: 12 }}>
          <span style={{ color: 'var(--tv-negative)' }}><i className="ti ti-alert-triangle"></i> {error}</span>
        </div>
      )}
      {notice && (
        <div className="card" style={{ borderColor: 'var(--tv-sage)', marginBottom: 12 }}>
          <span style={{ color: 'var(--tv-forest)' }}><i className="ti ti-info-circle"></i> {notice}</span>
        </div>
      )}

      <div className="seg" style={{ marginBottom: 14 }}>
        <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>Accounts</button>
        <button className={tab === 'matrix' ? 'active' : ''} onClick={() => setTab('matrix')}>Access matrix</button>
      </div>

      {tab === 'users' ? (
        <UsersTab
          users={users} roles={roles} me={me} busy={busy} creating={creating}
          setCreating={setCreating} onToggleActive={toggleActive} onToggleRole={toggleRole}
          onCreated={(msg) => { setNotice(msg); load(); }} onError={setError}
        />
      ) : (
        <MatrixTab roles={roles} permissions={permissions} busy={busy} onToggle={togglePermission} />
      )}
    </div>
  );
}

function UsersTab({ users, roles, me, busy, creating, setCreating, onToggleActive, onToggleRole, onCreated, onError }) {
  return (
    <>
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div className="card-title" style={{ marginBottom: 2 }}>Staff accounts</div>
            <div className="setting-help">
              Accounts are deactivated, never deleted — their audit history has to keep resolving to a real person.
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setCreating((c) => !c)}>
            <i className={`ti ${creating ? 'ti-x' : 'ti-user-plus'}`}></i> {creating ? 'Cancel' : 'New ops account'}
          </button>
        </div>
        {creating && <CreateOpsUser roles={roles} onDone={(msg) => { setCreating(false); onCreated(msg); }} onError={onError} />}
      </div>

      <div className="card">
        {users === null ? (
          <div className="empty-state"><i className="ti ti-loader spin"></i><p>Loading…</p></div>
        ) : users.length === 0 ? (
          <div className="empty-state"><i className="ti ti-shield-lock"></i><p>No ops accounts yet.</p></div>
        ) : (
          <div className="table-scroll">
            <table className="tv-table">
              <thead>
                <tr>
                  <th>Account</th><th>Roles</th><th style={{ textAlign: 'center' }}>Access</th>
                  <th>Last sign-in</th><th style={{ textAlign: 'right' }}>State</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{u.name || u.email}</div>
                      <div style={{ fontSize: 12, color: 'var(--tv-text-muted)' }}>{u.email}</div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {roles.map((r) => {
                          const has = u.roles.includes(r.key);
                          return (
                            <button
                              key={r.key}
                              className={`badge ${has ? 'badge-forest' : 'badge-gray'}`}
                              style={{ border: 'none', cursor: 'pointer', opacity: busy === `role-${u.id}-${r.key}` ? 0.5 : 1 }}
                              disabled={!!busy}
                              title={has ? `Remove ${r.name}` : `Grant ${r.name}`}
                              onClick={() => onToggleRole(u, r.key)}
                            >
                              {has ? '✓ ' : '+ '}{roleLabel(r.key)}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td style={{ textAlign: 'center', color: 'var(--tv-text-muted)', fontSize: 12 }}>
                      {u.permissions?.length ?? 0} perms
                    </td>
                    <td style={{ color: 'var(--tv-text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>{ts(u.lastLoginAt)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {u.locked && <span className="badge badge-amber" style={{ marginRight: 6 }}>Locked</span>}
                      {String(u.id) === String(me) ? (
                        <span className="badge badge-gray">You</span>
                      ) : (
                        <button
                          className={`btn btn-sm ${u.active ? 'btn-secondary' : 'btn-primary'}`}
                          disabled={!!busy}
                          onClick={() => onToggleActive(u)}
                        >
                          {u.active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function CreateOpsUser({ roles, onDone, onError }) {
  const [form, setForm] = useState({ email: '', name: '', password: '', phone: '', roles: [] });
  const [busy, setBusy] = useState(false);

  function toggle(roleKey) {
    setForm((f) => ({
      ...f,
      roles: f.roles.includes(roleKey) ? f.roles.filter((r) => r !== roleKey) : [...f.roles, roleKey]
    }));
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.opsCreateUser(form);
      onDone(`Created ops account ${form.email}.`);
    } catch (err) {
      onError(err.message || 'Could not create the account');
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} style={{ marginTop: 14, borderTop: '1px solid var(--tv-border-light)', paddingTop: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
        <div>
          <label className="form-label" htmlFor="ops-new-email">Work email</label>
          <input id="ops-new-email" className="form-input" type="email" required
            value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label className="form-label" htmlFor="ops-new-name">Name</label>
          <input id="ops-new-name" className="form-input"
            value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="form-label" htmlFor="ops-new-pw">Temporary password</label>
          <input id="ops-new-pw" className="form-input" type="password" required autoComplete="new-password"
            value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <div>
          <label className="form-label" htmlFor="ops-new-phone">Phone (for SMS codes)</label>
          <input id="ops-new-phone" className="form-input"
            value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <label className="form-label">Roles</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
          {roles.map((r) => (
            <button key={r.key} type="button"
              className={`badge ${form.roles.includes(r.key) ? 'badge-forest' : 'badge-gray'}`}
              style={{ border: 'none', cursor: 'pointer' }}
              title={r.description}
              onClick={() => toggle(r.key)}
            >
              {form.roles.includes(r.key) ? '✓ ' : '+ '}{roleLabel(r.key)}
            </button>
          ))}
        </div>
      </div>
      <div className="setting-help" style={{ marginTop: 8 }}>
        They'll need a reachable email or phone — ops sign-in always requires a one-time code.
      </div>
      <button className="btn btn-primary btn-sm" type="submit" disabled={busy || form.roles.length === 0} style={{ marginTop: 10 }}>
        {busy ? <><i className="ti ti-loader spin"></i> Creating…</> : <><i className="ti ti-user-plus"></i> Create account</>}
      </button>
    </form>
  );
}

/**
 * The access matrix: roles × permissions, editable in place.
 *
 * Rendered as a grid rather than a per-role form because the question people actually ask is
 * "who can reveal PII?" — a column read — not "what can a supervisor do".
 */
function MatrixTab({ roles, permissions, busy, onToggle }) {
  const categories = [...new Set(permissions.map((p) => p.category))];

  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 2 }}>Access matrix</div>
      <div className="setting-help" style={{ marginBottom: 14 }}>
        What each role can do. Editable without a deploy — but a change only reaches an agent when
        they next sign in, since access is resolved into their session (max 60 minutes).
      </div>
      {permissions.length === 0 ? (
        <div className="empty-state"><i className="ti ti-loader spin"></i><p>Loading…</p></div>
      ) : (
        <div className="table-scroll">
          <table className="tv-table">
            <thead>
              <tr>
                <th style={{ minWidth: 260 }}>Permission</th>
                {roles.map((r) => (
                  <th key={r.key} style={{ textAlign: 'center', whiteSpace: 'nowrap' }} title={r.description}>
                    {roleLabel(r.key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <React.Fragment key={cat}>
                  <tr>
                    <td colSpan={roles.length + 1} style={{ background: 'var(--tv-bg)', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--tv-text-muted)', fontWeight: 600 }}>
                      {cat}
                    </td>
                  </tr>
                  {permissions.filter((p) => p.category === cat).map((p) => (
                    <tr key={p.key}>
                      <td>
                        <div style={{ fontWeight: 500 }}><code style={{ fontSize: 12 }}>{p.key}</code></div>
                        <div className="setting-help">{p.description}</div>
                      </td>
                      {roles.map((r) => {
                        const has = (r.permissions || []).includes(p.key);
                        return (
                          <td key={r.key} style={{ textAlign: 'center' }}>
                            <button
                              className={`badge ${has ? 'badge-forest' : 'badge-gray'}`}
                              style={{ border: 'none', cursor: 'pointer', minWidth: 30, opacity: busy === `perm-${r.key}-${p.key}` ? 0.5 : 1 }}
                              disabled={!!busy}
                              title={`${has ? 'Remove' : 'Grant'} ${p.key} for ${r.name}`}
                              onClick={() => onToggle(r, p.key)}
                            >
                              {has ? '✓' : '—'}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
