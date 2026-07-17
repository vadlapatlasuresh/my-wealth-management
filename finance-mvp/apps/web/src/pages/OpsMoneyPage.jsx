import React, { useEffect, useState } from 'react';
import { api, hasOpsPermission, getOpsUserId } from '../api';

/**
 * The money desk: adjustments waiting on a second pair of eyes, and flagged anomalies.
 *
 * Two queues rather than a dashboard, because both exist to be emptied. Anything that isn't
 * someone's next action doesn't belong here.
 */

export function money(cents, currency = 'USD') {
  if (cents == null) return '—';
  return (cents / 100).toLocaleString(undefined, { style: 'currency', currency });
}

export function ts(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function OpsMoneyPage() {
  const canApprove = hasOpsPermission('finance.adjustment.approve');
  const canReviewAnomalies = hasOpsPermission('finance.anomaly.review');
  const [tab, setTab] = useState(canApprove ? 'approvals' : 'anomalies');

  return (
    <div className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">Money desk</div>
          <div className="page-subtitle">
            Adjustments waiting on a second approver, and anomalies worth a look. Both are queues — work them to empty.
          </div>
        </div>
      </div>

      <div className="seg" style={{ marginBottom: 14 }}>
        {canApprove && (
          <button className={tab === 'approvals' ? 'active' : ''} onClick={() => setTab('approvals')}>
            Approvals
          </button>
        )}
        {canReviewAnomalies && (
          <button className={tab === 'anomalies' ? 'active' : ''} onClick={() => setTab('anomalies')}>
            Anomalies
          </button>
        )}
      </div>

      {tab === 'approvals' && canApprove && <ApprovalQueue />}
      {tab === 'anomalies' && canReviewAnomalies && <AnomalyQueue />}
    </div>
  );
}

/**
 * The approval queue.
 *
 * Each row carries the requester and the customer's context, not just the amount. An approver
 * deciding on the amount alone is a rubber stamp — knowing this is the same requester's fortieth
 * refund this month is the entire reason a second pair of eyes is worth having.
 */
function ApprovalQueue() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [noteFor, setNoteFor] = useState(null); // { id, action }
  const [note, setNote] = useState('');
  const me = getOpsUserId();

  async function load() {
    setError('');
    try {
      const r = await api.opsAdjustmentQueue();
      setRows(Array.isArray(r) ? r : []);
    } catch (e) {
      setError(e.message || 'Could not load the approval queue');
      setRows([]);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function decide(id, action) {
    setBusy(id); setError(''); setNotice('');
    try {
      if (action === 'approve') await api.opsApproveAdjustment(id, note.trim() || null);
      else await api.opsRejectAdjustment(id, note.trim());
      setNotice(`Adjustment #${id} ${action === 'approve' ? 'approved and executed' : 'rejected'}.`);
      setNoteFor(null); setNote('');
      await load();
    } catch (e) {
      setError(e.message || `Could not ${action} the adjustment`);
    } finally { setBusy(''); }
  }

  if (rows === null) return <div className="card"><div className="empty-state"><i className="ti ti-loader spin"></i><p>Loading…</p></div></div>;

  return (
    <>
      {error && <div className="card" style={{ borderColor: 'var(--tv-negative)', marginBottom: 12 }}>
        <span style={{ color: 'var(--tv-negative)' }}><i className="ti ti-alert-triangle"></i> {error}</span></div>}
      {notice && <div className="card" style={{ borderColor: 'var(--tv-sage)', marginBottom: 12 }}>
        <span style={{ color: 'var(--tv-forest)' }}><i className="ti ti-check"></i> {notice}</span></div>}

      {rows.length === 0 ? (
        <div className="card"><div className="empty-state">
          <i className="ti ti-checks"></i>
          <p>Nothing waiting for approval.</p>
          <p className="setting-help">Adjustments below the auto-approve threshold never appear here — they're in each customer's ledger.</p>
        </div></div>
      ) : rows.map((a) => {
        const mine = String(a.requestedBy) === String(me);
        return (
          <div className="card" key={a.id} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>
                  {money(a.amountCents, a.currency)} <span className="badge badge-amber" style={{ marginLeft: 6 }}>{a.kind}</span>
                </div>
                <div className="setting-help" style={{ marginTop: 2 }}>
                  Customer #{a.userId} · requested by ops #{a.requestedBy} · {ts(a.requestedAt)}
                  {a.ticketRef && <> · ticket {a.ticketRef}</>}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="setting-help">Customer balance</div>
                <div style={{ fontWeight: 600 }}>{money(a.customerBalanceCents)}</div>
                <div className="setting-help">{a.customerAdjustmentCount} adjustment{a.customerAdjustmentCount === 1 ? '' : 's'} on record</div>
              </div>
            </div>

            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--tv-border-light)' }}>
              <span className="badge badge-gray">{a.reasonCode}</span>
              <div style={{ marginTop: 6 }}>{a.reasonNote}</div>
            </div>

            {mine ? (
              // The whole point of maker-checker. The server refuses this too (409) and the DB
              // refuses it under that — this is just the honest explanation.
              <div className="setting-help" style={{ marginTop: 10, color: 'var(--tv-warning)' }}>
                <i className="ti ti-lock"></i> You raised this one. It needs a different approver.
              </div>
            ) : noteFor?.id === a.id ? (
              <div style={{ marginTop: 10 }}>
                <input
                  className="form-input"
                  placeholder={noteFor.action === 'reject' ? 'Why are you rejecting this? (required)' : 'Note (optional)'}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  autoFocus
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button
                    className={`btn btn-sm ${noteFor.action === 'approve' ? 'btn-primary' : 'btn-danger'}`}
                    disabled={busy === a.id || (noteFor.action === 'reject' && !note.trim())}
                    onClick={() => decide(a.id, noteFor.action)}
                  >
                    {busy === a.id ? 'Working…' : noteFor.action === 'approve' ? 'Confirm approval' : 'Confirm rejection'}
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => { setNoteFor(null); setNote(''); }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="btn btn-primary btn-sm" onClick={() => { setNoteFor({ id: a.id, action: 'approve' }); setNote(''); }}>
                  <i className="ti ti-check"></i> Approve &amp; execute
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => { setNoteFor({ id: a.id, action: 'reject' }); setNote(''); }}>
                  <i className="ti ti-x"></i> Reject
                </button>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

/** Flagged patterns awaiting a decision. Accepting and dismissing are both recorded. */
function AnomalyQueue() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [deciding, setDeciding] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');

  async function load() {
    setError('');
    try {
      const r = await api.opsAnomalies();
      setRows(Array.isArray(r) ? r : []);
    } catch (e) {
      setError(e.message || 'Could not load anomalies');
      setRows([]);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function decide(id, decision) {
    setBusy(id); setError('');
    try {
      await api.opsDecideAnomaly(id, decision, note.trim());
      setDeciding(null); setNote('');
      await load();
    } catch (e) {
      setError(e.message || 'Could not record the decision');
    } finally { setBusy(''); }
  }

  if (rows === null) return <div className="card"><div className="empty-state"><i className="ti ti-loader spin"></i><p>Loading…</p></div></div>;

  return (
    <>
      {error && <div className="card" style={{ borderColor: 'var(--tv-negative)', marginBottom: 12 }}>
        <span style={{ color: 'var(--tv-negative)' }}><i className="ti ti-alert-triangle"></i> {error}</span></div>}

      {rows.length === 0 ? (
        <div className="card"><div className="empty-state">
          <i className="ti ti-mood-smile"></i>
          <p>Nothing flagged.</p>
          <p className="setting-help">The nightly scan looks for repeat refunds, agents far outside their peer group, and ledger drift.</p>
        </div></div>
      ) : rows.map((a) => (
        <div className="card" key={a.id} style={{ marginBottom: 12, borderColor: a.severity === 'HIGH' ? 'var(--tv-negative)' : 'var(--tv-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className={`badge ${a.severity === 'HIGH' ? 'badge-red' : 'badge-amber'}`}>{a.severity}</span>
            <span style={{ fontWeight: 600 }}>{a.rule.replace(/_/g, ' ').toLowerCase()}</span>
            <span className="setting-help">{ts(a.createdAt)}</span>
          </div>
          <div style={{ marginTop: 8 }}>{a.detail}</div>
          <div className="setting-help" style={{ marginTop: 4 }}>
            {a.userId && <>Customer #{a.userId}</>}{a.userId && a.actorId && ' · '}{a.actorId && <>Ops user #{a.actorId}</>}
          </div>

          {deciding === a.id ? (
            <div style={{ marginTop: 10 }}>
              <input
                className="form-input"
                placeholder="What did you find? (required — a dismissal nobody can explain isn't a decision)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                autoFocus
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="btn btn-danger btn-sm" disabled={busy === a.id || !note.trim()} onClick={() => decide(a.id, 'ACCEPTED')}>
                  Confirm — this is real
                </button>
                <button className="btn btn-secondary btn-sm" disabled={busy === a.id || !note.trim()} onClick={() => decide(a.id, 'DISMISSED')}>
                  Dismiss — expected
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => { setDeciding(null); setNote(''); }}>Cancel</button>
              </div>
            </div>
          ) : (
            <button className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={() => { setDeciding(a.id); setNote(''); }}>
              <i className="ti ti-gavel"></i> Review
            </button>
          )}
        </div>
      ))}
    </>
  );
}
