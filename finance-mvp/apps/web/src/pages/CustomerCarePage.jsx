import React, { useEffect, useState } from 'react';
import { api } from '../api';

/* Format an ISO/LocalDateTime string to a short, readable timestamp. */
function ts(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function Badge({ ok, yes, no }) {
  return (
    <span className={`badge ${ok ? 'badge-forest' : 'badge-red'}`}>
      <i className={`ti ${ok ? 'ti-check' : 'ti-x'}`} style={{ fontSize: 11 }}></i> {ok ? yes : no}
    </span>
  );
}

/* One activity/issue row. Failures are tinted. */
function ActivityRow({ e }) {
  const failed = (e.outcome && e.outcome !== 'SUCCESS') || (e.status && e.status >= 400);
  return (
    <tr>
      <td style={{ color: 'var(--tv-text-muted)', whiteSpace: 'nowrap' }}>{ts(e.createdAt)}</td>
      <td><span style={{ fontWeight: 500 }}>{e.action || '—'}</span></td>
      <td><span className="badge badge-gray">{e.service || '—'}</span></td>
      <td style={{ textAlign: 'center' }}>
        <span className={`badge ${failed ? 'badge-red' : 'badge-forest'}`}>{e.status ?? e.outcome ?? '—'}</span>
      </td>
      <td style={{ color: 'var(--tv-text-muted)', fontSize: 12 }}>{e.sourceIp || ''}</td>
    </tr>
  );
}

export default function CustomerCarePage() {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [tab, setTab] = useState('issues'); // issues | activity
  const [error, setError] = useState('');

  async function runSearch(q = query) {
    setLoadingList(true);
    setError('');
    try {
      const res = await api.supportSearchUsers(q, 0, 25);
      setUsers(res?.content ?? []);
    } catch (e) {
      setError(e.message || 'Search failed');
      setUsers([]);
    } finally {
      setLoadingList(false);
    }
  }

  // Load the most-recent users on first open.
  useEffect(() => { runSearch(''); /* eslint-disable-next-line */ }, []);

  async function openUser(u) {
    setSelected(u);
    setDetail(null);
    setLoadingDetail(true);
    setError('');
    try {
      setDetail(await api.supportGetUser(u.id));
    } catch (e) {
      setError(e.message || 'Could not load user');
    } finally {
      setLoadingDetail(false);
    }
  }

  return (
    <div id="page-customer-care" className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">Customer Care</div>
          <div className="page-subtitle">Look up a member and review their profile, activity, and any issues</div>
        </div>
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'var(--tv-negative)', marginBottom: 14 }}>
          <span style={{ color: 'var(--tv-negative)' }}><i className="ti ti-alert-triangle"></i> {error}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) 1fr', gap: 16, alignItems: 'start' }}>
        {/* Left: search + user list */}
        <div className="card">
          <form
            className="filter-bar"
            onSubmit={(e) => { e.preventDefault(); runSearch(); }}
          >
            <div className="filter-search" style={{ flex: 1 }}>
              <i className="ti ti-search"></i>
              <input
                type="text"
                placeholder="Search by email or name…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <button className="btn btn-primary btn-sm" type="submit">Search</button>
          </form>

          <div style={{ marginTop: 10 }}>
            {loadingList ? (
              <div className="empty-state"><i className="ti ti-loader"></i><p>Searching…</p></div>
            ) : users.length === 0 ? (
              <div className="empty-state"><i className="ti ti-user-search"></i><p>No users found.</p></div>
            ) : (
              users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => openUser(u)}
                  className="list-item"
                  style={{
                    width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                    background: selected?.id === u.id ? 'var(--tv-surface-2, #f3f4f1)' : 'transparent',
                    borderRadius: 8,
                  }}
                >
                  <div className="item-icon icon-forest"><i className="ti ti-user"></i></div>
                  <div className="item-main">
                    <div className="item-name">{u.name || u.email}</div>
                    <div className="item-sub" style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span>{u.email}</span>
                      {(u.roles || []).filter((r) => r !== 'USER').map((r) => (
                        <span key={r} className="badge badge-amber">{r}</span>
                      ))}
                    </div>
                  </div>
                  <i className="ti ti-chevron-right" style={{ color: 'var(--tv-text-muted)' }}></i>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right: selected user 360 */}
        <div>
          {!selected ? (
            <div className="card"><div className="empty-state">
              <i className="ti ti-id-badge-2"></i>
              <p style={{ fontWeight: 600 }}>Select a member</p>
              <p>Search and pick a user to see their full profile and activity.</p>
            </div></div>
          ) : loadingDetail || !detail ? (
            <div className="card"><div className="empty-state"><i className="ti ti-loader"></i><p>Loading member…</p></div></div>
          ) : (
            <>
              {/* Profile card */}
              <div className="card" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div className="item-icon icon-forest" style={{ width: 48, height: 48, fontSize: 22 }}>
                    <i className="ti ti-user"></i>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 18 }}>{detail.name || '—'}</div>
                    <div style={{ color: 'var(--tv-text-muted)' }}>{detail.email} · ID {detail.id}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {(detail.roles || []).map((r) => <span key={r} className="badge badge-gray">{r}</span>)}
                  </div>
                </div>

                <div className="kpi-grid" style={{ marginTop: 16 }}>
                  <div className="kpi-card">
                    <div className="kpi-label">Account type</div>
                    <div className="kpi-value" style={{ fontSize: 18 }}>{detail.accountType || 'INDIVIDUAL'}</div>
                    {detail.businessName && <div className="kpi-delta">{detail.businessName}</div>}
                  </div>
                  <div className="kpi-card">
                    <div className="kpi-label">Phone</div>
                    <div className="kpi-value" style={{ fontSize: 18 }}>{detail.phone || '—'}</div>
                    <div className="kpi-delta"><Badge ok={detail.phoneVerified} yes="Verified" no="Unverified" /></div>
                  </div>
                  <div className="kpi-card">
                    <div className="kpi-label">Identity</div>
                    <div className="kpi-value" style={{ fontSize: 18 }}>
                      {detail.ssnLast4 ? `SSN ••${detail.ssnLast4}` : detail.einLast4 ? `EIN ••${detail.einLast4}` : '—'}
                    </div>
                    <div className="kpi-delta"><Badge ok={detail.identityVerified} yes="Verified" no="Unverified" /></div>
                  </div>
                  <div className="kpi-card">
                    <div className="kpi-label">Member since</div>
                    <div className="kpi-value" style={{ fontSize: 18 }}>{ts(detail.createdAt)}</div>
                    <div className={`kpi-delta ${detail.issueCount > 0 ? 'neg' : 'pos'}`}>
                      <i className="ti ti-alert-triangle"></i> {detail.issueCount} issue{detail.issueCount === 1 ? '' : 's'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Activity / issues */}
              <div className="card">
                <div className="seg-control" style={{ marginBottom: 12 }}>
                  <button className={`seg-btn ${tab === 'issues' ? 'active' : ''}`} onClick={() => setTab('issues')}>
                    Issues encountered ({(detail.issues || []).length})
                  </button>
                  <button className={`seg-btn ${tab === 'activity' ? 'active' : ''}`} onClick={() => setTab('activity')}>
                    Recent activity ({(detail.recentActivity || []).length})
                  </button>
                </div>

                {(() => {
                  const rows = tab === 'issues' ? (detail.issues || []) : (detail.recentActivity || []);
                  if (rows.length === 0) {
                    return (
                      <div className="empty-state">
                        <i className={`ti ${tab === 'issues' ? 'ti-mood-smile' : 'ti-history'}`}></i>
                        <p>{tab === 'issues' ? 'No issues encountered.' : 'No recorded activity.'}</p>
                      </div>
                    );
                  }
                  return (
                    <div className="table-scroll">
                      <table className="tv-table">
                        <thead>
                          <tr><th>When</th><th>Action</th><th>Service</th><th style={{ textAlign: 'center' }}>Status</th><th>IP</th></tr>
                        </thead>
                        <tbody>
                          {rows.map((e, i) => <ActivityRow key={e.id ?? i} e={e} />)}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
