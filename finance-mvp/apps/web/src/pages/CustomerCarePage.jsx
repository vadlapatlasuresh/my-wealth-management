import React, { useEffect, useState } from 'react';
import { api, hasOpsPermission } from '../api';
import CustomerFinancials from '../components/CustomerFinancials';
import CustomerNotes from '../components/CustomerNotes';
import CallerVerification from '../components/CallerVerification';

// Light money formatter (no external dep) for the read-only data tabs.
function money(v) {
  const n = Number(v);
  if (v == null || Number.isNaN(n)) return '—';
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

// Read-only "what the customer sees" data tabs — each fetched on demand for the selected member.
const DATA_TABS = {
  accounts: {
    label: 'Accounts', icon: 'ti-building-bank',
    fetch: (id) => api.supportGetAccounts(id),
    rows: (r) => r || [],
    head: ['Account', 'Type', 'Balance'],
    row: (a, i) => (
      <tr key={a.id ?? i}>
        <td style={{ fontWeight: 500 }}>{a.name || a.officialName || '—'}</td>
        <td><span className="badge badge-gray">{a.type || a.accountType || a.subtype || '—'}</span></td>
        <td style={{ fontWeight: 600 }}>{money(a.balance ?? a.currentBalance ?? a.availableBalance)}</td>
      </tr>
    ),
  },
  transactions: {
    label: 'Transactions', icon: 'ti-arrows-exchange',
    fetch: (id) => api.supportGetTransactions(id),
    rows: (r) => r || [],
    head: ['Date', 'Description', 'Category', 'Amount'],
    row: (t, i) => (
      <tr key={t.id ?? i}>
        <td style={{ color: 'var(--tv-text-muted)', whiteSpace: 'nowrap' }}>{t.date || t.transactionDate || '—'}</td>
        <td style={{ fontWeight: 500 }}>{t.name || t.description || t.merchant || '—'}</td>
        <td><span className="badge badge-gray">{t.category || '—'}</span></td>
        <td style={{ fontWeight: 600 }}>{money(t.amount)}</td>
      </tr>
    ),
  },
  payments: {
    label: 'Payments', icon: 'ti-receipt',
    fetch: (id) => api.supportGetPayments(id),
    rows: (r) => r?.items || [],
    head: ['Payee', 'Amount', 'Status', 'Date'],
    row: (p, i) => (
      <tr key={p.intent_id ?? p.id ?? i}>
        <td style={{ fontWeight: 500 }}>{p.payee || '—'}</td>
        <td style={{ fontWeight: 600 }}>{money(p.amount)}</td>
        <td><span className={`badge ${p.status === 'FAILED' ? 'badge-red' : 'badge-forest'}`}>{p.status || '—'}</span></td>
        <td style={{ color: 'var(--tv-text-muted)' }}>{p.scheduled_date || p.created_at || '—'}</td>
      </tr>
    ),
  },
  deals: {
    label: 'Deals', icon: 'ti-briefcase',
    fetch: (id) => api.supportGetDeals(id),
    rows: (r) => r || [],
    head: ['Deal', 'Status', 'Category', 'Interest'],
    row: (d, i) => (
      <tr key={d.id ?? i}>
        <td style={{ fontWeight: 500 }}>{d.title || '—'}</td>
        <td><span className="badge badge-forest">{d.status || '—'}</span></td>
        <td><span className="badge badge-gray">{d.category || '—'}</span></td>
        <td style={{ color: 'var(--tv-text-muted)' }}>{d.interestCount ?? 0} interested</td>
      </tr>
    ),
  },
};

/**
 * The things an agent must not miss, surfaced above everything else: open escalations and pinned
 * notes.
 *
 * This exists because the record's default order is chronological, and chronological is the wrong
 * order for someone with a caller waiting. "This customer has a dispute open" and "do not offer
 * another goodwill credit" are worth more in the first two seconds than any table on the page.
 *
 * Renders nothing at all when there's nothing to say — an always-present panel that usually reads
 * "no issues" trains people to skip it, and then they skip it on the day it matters.
 */
function AttentionPanel({ userId }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    let live = true;
    Promise.all([
      api.opsListEscalations(userId).catch(() => []),
      api.opsListNotes(userId).catch(() => [])
    ]).then(([escalations, notes]) => {
      if (!live) return;
      const open = (Array.isArray(escalations) ? escalations : []).filter((e) => e.status === 'OPEN');
      const pinned = (Array.isArray(notes) ? notes : []).filter((n) => n.pinned);
      setItems([
        ...open.map((e) => ({
          key: `esc-${e.id}`,
          icon: 'ti-flag',
          severity: e.severity,
          text: e.summary,
          meta: `Escalation · raised by ops #${e.raisedBy}`
        })),
        ...pinned.map((n) => ({
          key: `note-${n.id}`,
          icon: 'ti-pin',
          severity: null,
          text: n.body,
          meta: `Pinned note · ops #${n.authorId}`
        }))
      ]);
    });
    return () => { live = false; };
  }, [userId]);

  if (items.length === 0) return null;

  return (
    <div className="card" style={{ marginBottom: 16, borderColor: 'var(--tv-gold)' }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>
        <i className="ti ti-alert-circle" style={{ color: 'var(--tv-gold)' }}></i> Needs attention
      </div>
      {items.map((i) => (
        <div key={i.key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '5px 0' }}>
          <i className={`ti ${i.icon}`} style={{ color: 'var(--tv-gold)', marginTop: 3 }}></i>
          <div style={{ flex: 1 }}>
            <div>
              {i.severity && <span className={`badge ${i.severity === 'HIGH' ? 'badge-red' : 'badge-amber'}`} style={{ marginRight: 6 }}>{i.severity}</span>}
              {i.text}
            </div>
            <div className="setting-help">{i.meta}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Every recorded staff action taken against THIS customer — who opened their record, who revealed
 * their PII, and on what stated grounds.
 *
 * The mirror image of the Activity tab (what the customer did themselves). This is the question
 * the audit log could not answer before target_user_id existed: the actor was recorded, but not
 * who was acted upon, so it could only be reconstructed by pattern-matching URL paths.
 *
 * An unreachable audit service renders as an error, never as "no access" — those two must never
 * look the same to someone doing a review.
 */
function StaffAccessTab({ userId, name }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setRows(null); setError('');
    api.opsAuditTarget(userId, 100)
      .then((r) => { if (live) setRows(Array.isArray(r) ? r : []); })
      .catch((e) => { if (live) { setError(e.message || 'Could not load the access record'); setRows([]); } });
    return () => { live = false; };
  }, [userId]);

  if (error) {
    return (
      <div className="empty-state">
        <i className="ti ti-alert-triangle" style={{ color: 'var(--tv-negative)' }}></i>
        <p>{error}</p>
        <p className="setting-help">This is not a statement that no one accessed this member.</p>
      </div>
    );
  }
  if (rows === null) return <div className="empty-state"><i className="ti ti-loader spin"></i><p>Loading…</p></div>;
  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <i className="ti ti-shield-check"></i>
        <p>No staff has accessed {name || 'this member'}'s record.</p>
        <p className="setting-help">Records here start from when access logging began.</p>
      </div>
    );
  }

  return (
    <>
      <div className="setting-help" style={{ marginBottom: 8 }}>
        <i className="ti ti-shield-search"></i> Every staff action taken on {name || 'this member'} — including yours.
      </div>
      <div className="table-scroll">
        <table className="tv-table">
          <thead>
            <tr><th>When</th><th>Staff member</th><th>Action</th><th>Reason given</th></tr>
          </thead>
          <tbody>
            {rows.map((e, i) => (
              <tr key={e.id ?? i}>
                <td style={{ color: 'var(--tv-text-muted)', whiteSpace: 'nowrap' }}>{ts(e.createdAt)}</td>
                <td><span className="badge badge-gray">Ops #{e.actorId ?? e.userId ?? '—'}</span></td>
                <td style={{ fontWeight: 500 }}>
                  {e.action || '—'}
                  {e.action === 'ops.pii.reveal' && (
                    <span className="badge badge-amber" style={{ marginLeft: 6 }}>PII</span>
                  )}
                </td>
                <td style={{ color: e.reason ? 'inherit' : 'var(--tv-text-muted)' }}>{e.reason || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * The identity cell: masked by default, revealed only on a deliberate, reason-carrying action.
 *
 * The 360 view no longer carries SSN/EIN at all — the server only serves them from the reveal
 * endpoint, to a caller holding customer.pii.reveal, and records who asked and why. So this shows
 * whether something is on file (enough to answer "do you have my tax ID?") without an access, and
 * makes looking a decision the agent has to justify.
 */
function PiiCell({ detail, callerTier }) {
  const [revealed, setRevealed] = useState(null);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const onFile = detail.hasSsn || detail.hasEin;
  const canReveal = hasOpsPermission('customer.pii.reveal');
  // The caller must be verified to the PII tier (T2). This mirrors the server gate — the reveal
  // still fails server-side below tier, but blocking the button here means the agent gets told to
  // verify first instead of hitting a 403.
  const callerVerified = (callerTier ?? 0) >= 2;

  // A new customer must never inherit the last one's revealed PII.
  useEffect(() => { setRevealed(null); setAsking(false); setReason(''); setError(''); }, [detail.id]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const pii = await api.supportRevealPii(detail.id, reason.trim());
      setRevealed(pii);
      setAsking(false);
    } catch (err) {
      setError(err.message || 'Could not reveal');
    } finally { setBusy(false); }
  }

  if (revealed) {
    return (
      <div className="kpi-value" style={{ fontSize: 18 }}>
        {revealed.ssnLast4 ? `SSN ••${revealed.ssnLast4}` : revealed.einLast4 ? `EIN ••${revealed.einLast4}` : '—'}
        <div className="setting-help" style={{ marginTop: 2 }}>
          <i className="ti ti-eye"></i> Revealed — recorded against you
        </div>
      </div>
    );
  }

  if (asking) {
    return (
      <form onSubmit={submit} style={{ marginTop: 4 }}>
        <input
          className="form-input"
          style={{ fontSize: 13, padding: '6px 8px' }}
          placeholder="Why do you need this?"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          autoFocus
          required
        />
        {error && <div className="setting-help" style={{ color: 'var(--tv-negative)' }}>{error}</div>}
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <button className="btn btn-primary btn-sm" type="submit" disabled={busy || reason.trim().length < 8}>
            {busy ? 'Revealing…' : 'Reveal'}
          </button>
          <button className="btn btn-secondary btn-sm" type="button" onClick={() => { setAsking(false); setError(''); }}>
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="kpi-value" style={{ fontSize: 18 }}>
      {onFile ? `${detail.hasSsn ? 'SSN' : 'EIN'} ••••` : '—'}
      {onFile && canReveal && callerVerified && (
        <button
          className="btn btn-secondary btn-sm"
          style={{ marginLeft: 8, verticalAlign: 'middle' }}
          onClick={() => setAsking(true)}
        >
          <i className="ti ti-eye"></i> Reveal
        </button>
      )}
      {onFile && canReveal && !callerVerified && (
        <div className="setting-help" style={{ marginTop: 2 }}>
          <i className="ti ti-lock"></i> Verify the caller to reveal
        </div>
      )}
      {onFile && !canReveal && (
        <div className="setting-help" style={{ marginTop: 2 }}>On file — you don't have access to view it</div>
      )}
    </div>
  );
}

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
  // Multi-field help-desk search (any combination, AND-ed on the backend).
  const [fields, setFields] = useState({ first: '', last: '', email: '', phone: '' });
  const [users, setUsers] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  // The caller's verification tier for the open record, published up by CallerVerification. Gates
  // the PII reveal. Resets whenever a different record is opened — verification is per-call.
  const [callerTier, setCallerTier] = useState(0);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [tab, setTab] = useState('issues'); // issues | activity
  const [error, setError] = useState('');
  // Read-only data tabs (accounts/transactions/payments/deals) — fetched on demand.
  const [dataRows, setDataRows] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState('');

  const setField = (k, v) => setFields((f) => ({ ...f, [k]: v }));

  async function runSearch(params = fields) {
    setLoadingList(true);
    setError('');
    try {
      const res = await api.supportSearchUsers({ ...params, page: 0, size: 25 });
      setUsers(res?.content ?? []);
    } catch (e) {
      setError(e.message || 'Search failed');
      setUsers([]);
    } finally {
      setLoadingList(false);
    }
  }

  // Load the most-recent users on first open.
  useEffect(() => { runSearch({ first: '', last: '', email: '', phone: '' }); /* eslint-disable-next-line */ }, []);

  // Fetch the read-only data tab for the selected member, on demand.
  useEffect(() => {
    const cfg = DATA_TABS[tab];
    if (!selected || !cfg) return undefined;
    let cancelled = false;
    setDataLoading(true);
    setDataError('');
    setDataRows([]);
    cfg.fetch(selected.id)
      .then((r) => { if (!cancelled) setDataRows(cfg.rows(r)); })
      .catch((e) => { if (!cancelled) setDataError(e.message || 'Could not load this data.'); })
      .finally(() => { if (!cancelled) setDataLoading(false); });
    return () => { cancelled = true; };
  }, [selected, tab]);

  async function openUser(u) {
    setSelected(u);
    setDetail(null);
    setCallerTier(0); // verification is per-call — a new record starts cold
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
          <form onSubmit={(e) => { e.preventDefault(); runSearch(); }}>
            <div className="section-title" style={{ marginBottom: 8 }}>Find a customer</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input className="form-input" placeholder="First name" value={fields.first}
                onChange={(e) => setField('first', e.target.value)} />
              <input className="form-input" placeholder="Last name" value={fields.last}
                onChange={(e) => setField('last', e.target.value)} />
            </div>
            <input className="form-input" placeholder="Email" value={fields.email}
              style={{ marginTop: 8, width: '100%' }} onChange={(e) => setField('email', e.target.value)} />
            <input className="form-input" placeholder="Phone" value={fields.phone}
              style={{ marginTop: 8, width: '100%' }} onChange={(e) => setField('phone', e.target.value)} />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn btn-primary btn-sm" type="submit" style={{ flex: 1, justifyContent: 'center' }}>
                <i className="ti ti-search"></i> Search
              </button>
              <button className="btn btn-secondary btn-sm" type="button"
                onClick={() => { setFields({ first: '', last: '', email: '', phone: '' }); runSearch({ first: '', last: '', email: '', phone: '' }); }}>
                Clear
              </button>
            </div>
            <div className="setting-help" style={{ marginTop: 6 }}>Any combination — matches are AND-ed. Blank shows recent members.</div>
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
              {/* Caller verification — the disclosure gate, above everything. Its tier flows into
                  PiiCell so the reveal button is gated on the CALLER being verified, not just on
                  the agent's permission. */}
              <CallerVerification customerId={detail.id} phone={detail.phone} onTierChange={setCallerTier} />

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
                    <PiiCell detail={detail} callerTier={callerTier} />
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

                {/* The "Roles & access" panel that granted CARE/ADMIN to this customer is gone.
                    That was the promotion path that made ops staff into members holding a token
                    every service trusted. Ops accounts now live in their own table with their own
                    login; managing them is an ops-admin screen (Phase 2), not something you do
                    from a customer's record. */}
              </div>

              {/* Attention panel — what the next agent must not miss, above everything else. */}
              <AttentionPanel userId={detail.id} />

              {/* Issue spotlight — the help-desk agent's first read: what did the caller hit? */}
              {(() => {
                const issues = detail.issues || [];
                const latest = issues[0];
                if (!latest) {
                  return (
                    <div className="card" style={{ marginBottom: 16, borderColor: 'var(--tv-positive)', background: 'var(--tv-positive-bg, #E6F4EC)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <i className="ti ti-shield-check" style={{ fontSize: 20, color: 'var(--tv-positive)' }}></i>
                        <div>
                          <div style={{ fontWeight: 600 }}>No recent issues</div>
                          <div className="setting-help">This member’s account looks healthy — no failed or denied actions on record.</div>
                        </div>
                      </div>
                    </div>
                  );
                }
                return (
                  <div className="card" style={{ marginBottom: 16, borderColor: 'var(--tv-negative)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <div className="item-icon icon-red" style={{ width: 40, height: 40, fontSize: 18, flexShrink: 0 }}>
                        <i className="ti ti-alert-triangle"></i>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                          <span style={{ fontWeight: 700 }}>Most recent issue</span>
                          <span style={{ color: 'var(--tv-text-muted)', fontSize: 12 }}>{ts(latest.createdAt)}</span>
                        </div>
                        <div style={{ marginTop: 4, fontSize: 15 }}>
                          <span style={{ fontWeight: 600 }}>{latest.action || 'Action failed'}</span>
                          {latest.service && <span className="badge badge-gray" style={{ marginLeft: 8 }}>{latest.service}</span>}
                          <span className="badge badge-red" style={{ marginLeft: 6 }}>{latest.status ?? latest.outcome ?? 'FAILED'}</span>
                        </div>
                        <div className="setting-help" style={{ marginTop: 6 }}>
                          {issues.length > 1
                            ? `This member hit ${issues.length} issues recently. Review the full list below to help with their call.`
                            : 'Review the activity below to help with their call.'}
                          {latest.sourceIp ? ` · from ${latest.sourceIp}` : ''}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Tabs: activity/issues + read-only "what the customer sees" data */}
              <div className="card">
                <div className="seg-control" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
                  <button className={`seg-btn ${tab === 'issues' ? 'active' : ''}`} onClick={() => setTab('issues')}>
                    Issues ({(detail.issues || []).length})
                  </button>
                  <button className={`seg-btn ${tab === 'activity' ? 'active' : ''}`} onClick={() => setTab('activity')}>
                    Activity ({(detail.recentActivity || []).length})
                  </button>
                  {Object.entries(DATA_TABS).map(([key, cfg]) => (
                    <button key={key} className={`seg-btn ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
                      <i className={`ti ${cfg.icon}`} style={{ marginRight: 4 }}></i>{cfg.label}
                    </button>
                  ))}
                  {/* The money history, and where an adjustment is proposed. Needs finance.ledger.view. */}
                  {hasOpsPermission('finance.ledger.view') && (
                    <button className={`seg-btn ${tab === 'financials' ? 'active' : ''}`} onClick={() => setTab('financials')}>
                      <i className="ti ti-cash" style={{ marginRight: 4 }}></i>Financials
                    </button>
                  )}
                  {/* The team's memory of this customer. */}
                  <button className={`seg-btn ${tab === 'notes' ? 'active' : ''}`} onClick={() => setTab('notes')}>
                    <i className="ti ti-note" style={{ marginRight: 4 }}></i>Notes
                  </button>
                  {/* Who accessed THIS customer — the mirror image of the Activity tab, which
                      shows what the customer did themselves. Needs audit.query. */}
                  {hasOpsPermission('audit.query') && (
                    <button className={`seg-btn ${tab === 'access' ? 'active' : ''}`} onClick={() => setTab('access')}>
                      <i className="ti ti-shield-search" style={{ marginRight: 4 }}></i>Staff access
                    </button>
                  )}
                </div>

                {tab === 'access' ? <StaffAccessTab userId={detail.id} name={detail.name} />
                 : tab === 'financials' ? <CustomerFinancials userId={detail.id} name={detail.name} />
                 : tab === 'notes' ? <CustomerNotes userId={detail.id} name={detail.name} />
                 : DATA_TABS[tab] ? (
                  <>
                    <div className="setting-help" style={{ marginBottom: 8 }}>
                      <i className="ti ti-eye"></i> Read-only — what {detail.name || 'this member'} sees. You can view but not change it.
                    </div>
                    {dataLoading ? (
                      <div className="empty-state"><i className="ti ti-loader spin"></i><p>Loading…</p></div>
                    ) : dataError ? (
                      <div className="empty-state"><i className="ti ti-alert-triangle"></i><p>{dataError}</p></div>
                    ) : dataRows.length === 0 ? (
                      <div className="empty-state"><i className={`ti ${DATA_TABS[tab].icon}`}></i><p>No {DATA_TABS[tab].label.toLowerCase()} on record.</p></div>
                    ) : (
                      <div className="table-scroll">
                        <table className="tv-table">
                          <thead><tr>{DATA_TABS[tab].head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                          <tbody>{dataRows.map((r, i) => DATA_TABS[tab].row(r, i))}</tbody>
                        </table>
                      </div>
                    )}
                  </>
                ) : (() => {
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
