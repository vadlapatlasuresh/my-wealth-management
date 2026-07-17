import React, { useEffect, useState } from 'react';
import { api, hasOpsPermission } from '../api';
import { money, ts } from '../pages/OpsMoneyPage';

/**
 * One customer's money: the ledger as a statement, plus the ability to propose an adjustment.
 *
 * The ledger reads newest-first with a running balance, because the question on a live call is
 * almost always "what happened most recently and what do they owe now" — not "show me a table".
 */
export default function CustomerFinancials({ userId, name }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [proposing, setProposing] = useState(false);
  const [notice, setNotice] = useState('');

  const canPropose = hasOpsPermission('finance.adjustment.create');

  async function load() {
    setError('');
    try {
      setData(await api.opsCustomerLedger(userId));
    } catch (e) {
      setError(e.message || 'Could not load the money history');
      setData({ entries: [], adjustments: [] });
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [userId]);

  if (error) {
    return <div className="empty-state"><i className="ti ti-alert-triangle" style={{ color: 'var(--tv-negative)' }}></i><p>{error}</p></div>;
  }
  if (data === null) return <div className="empty-state"><i className="ti ti-loader spin"></i><p>Loading…</p></div>;

  const entries = data.entries || [];
  const pending = (data.adjustments || []).filter((a) => a.status === 'PENDING_APPROVAL');
  const failed = (data.adjustments || []).filter((a) => a.status === 'FAILED');

  return (
    <>
      {notice && (
        <div className="setting-help" style={{ color: 'var(--tv-forest)', marginBottom: 8 }}>
          <i className="ti ti-check"></i> {notice}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <div className="setting-help">Balance</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{money(data.balanceCents, data.currency)}</div>
          <div className="setting-help">
            {data.balanceCents > 0 ? 'Owed to us' : data.balanceCents < 0 ? 'We owe them' : 'Settled'}
          </div>
        </div>
        {canPropose && !proposing && (
          <button className="btn btn-primary btn-sm" onClick={() => setProposing(true)}>
            <i className="ti ti-cash"></i> Propose adjustment
          </button>
        )}
      </div>

      {proposing && (
        <AdjustmentWizard
          userId={userId}
          name={name}
          onCancel={() => setProposing(false)}
          onDone={(msg) => { setProposing(false); setNotice(msg); load(); }}
        />
      )}

      {/* Anything mid-flight leads, because it's the thing an agent has to explain on the call. */}
      {pending.length > 0 && (
        <div className="card" style={{ marginBottom: 12, borderColor: 'var(--tv-warning)' }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            <i className="ti ti-hourglass" style={{ color: 'var(--tv-warning)' }}></i> Waiting on approval
          </div>
          {pending.map((a) => (
            <div key={a.id} className="setting-help">
              {money(a.amountCents, a.currency)} {a.kind.toLowerCase()} — {a.reasonCode}, raised by ops #{a.requestedBy} {ts(a.requestedAt)}
            </div>
          ))}
        </div>
      )}
      {failed.length > 0 && (
        <div className="card" style={{ marginBottom: 12, borderColor: 'var(--tv-negative)' }}>
          <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--tv-negative)' }}>
            <i className="ti ti-alert-triangle"></i> Failed — money did NOT move
          </div>
          {failed.map((a) => (
            <div key={a.id} className="setting-help">
              {money(a.amountCents, a.currency)} {a.kind.toLowerCase()}: {a.failureReason || 'unknown error'}
            </div>
          ))}
        </div>
      )}

      {entries.length === 0 ? (
        <div className="empty-state"><i className="ti ti-receipt-off"></i><p>No money has moved on this account.</p></div>
      ) : (
        <div className="table-scroll">
          <table className="tv-table">
            <thead>
              <tr><th>When</th><th>What</th><th style={{ textAlign: 'right' }}>Amount</th><th style={{ textAlign: 'right' }}>Balance</th><th>Who</th></tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td style={{ color: 'var(--tv-text-muted)', whiteSpace: 'nowrap' }}>{ts(e.createdAt)}</td>
                  <td>
                    <span className={`badge ${e.amountCents < 0 ? 'badge-forest' : 'badge-gray'}`}>{e.entryType}</span>
                    {e.reversesId && <span className="badge badge-amber" style={{ marginLeft: 4 }}>reverses #{e.reversesId}</span>}
                    <div className="setting-help">{e.memo || e.source}</div>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: e.amountCents < 0 ? 'var(--tv-positive)' : 'inherit' }}>
                    {money(e.amountCents, e.currency)}
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--tv-text-muted)' }}>{money(e.balanceAfterCents, e.currency)}</td>
                  <td className="setting-help">{e.createdBy === 'SYSTEM' || !e.createdBy ? 'System' : `Ops #${e.createdBy}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/**
 * Propose an adjustment.
 *
 * Tells the agent up front whether this will execute now or go for approval — a control people
 * understand is a control they don't try to route around.
 */
function AdjustmentWizard({ userId, name, onCancel, onDone }) {
  const [options, setOptions] = useState(null);
  const [form, setForm] = useState({ kind: 'CREDIT', amount: '', reasonCode: '', reasonNote: '', ticketRef: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.opsAdjustmentOptions()
      .then((o) => { setOptions(o); setForm((f) => ({ ...f, reasonCode: o.reasonCodes?.[0] || '' })); })
      .catch((e) => setError(e.message || 'Could not load adjustment options'));
  }, []);

  const amountCents = Math.round(parseFloat(form.amount || '0') * 100);
  const needsApproval = options && amountCents >= options.autoApproveBelowCents;
  const valid = amountCents > 0 && form.reasonCode && form.reasonNote.trim().length >= 8;

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const res = await api.opsProposeAdjustment({
        userId: String(userId),
        kind: form.kind,
        amountCents,
        reasonCode: form.reasonCode,
        reasonNote: form.reasonNote.trim(),
        ticketRef: form.ticketRef.trim() || null
      });
      onDone(res.status === 'EXECUTED'
        ? `${money(res.amountCents)} ${res.kind.toLowerCase()} executed.`
        : res.status === 'FAILED'
          ? `Adjustment FAILED — no money moved: ${res.failureReason}`
          : `Sent for approval: ${money(res.amountCents)} ${res.kind.toLowerCase()}. It needs a second approver.`);
    } catch (err) {
      setError(err.message || 'Could not propose the adjustment');
    } finally { setBusy(false); }
  }

  if (!options) return <div className="card" style={{ marginBottom: 12 }}><div className="empty-state"><i className="ti ti-loader spin"></i><p>Loading…</p></div></div>;

  return (
    <form className="card" style={{ marginBottom: 12 }} onSubmit={submit}>
      <div className="card-title">Propose an adjustment for {name || `#${userId}`}</div>
      {error && <div className="setting-help" style={{ color: 'var(--tv-negative)' }}><i className="ti ti-alert-triangle"></i> {error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginTop: 8 }}>
        <div>
          <label className="form-label" htmlFor="adj-kind">Kind</label>
          <select id="adj-kind" className="form-input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            {options.kinds.map((k) => <option key={k} value={k}>{k.replace(/_/g, ' ').toLowerCase()}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label" htmlFor="adj-amount">Amount (USD)</label>
          <input id="adj-amount" className="form-input" inputMode="decimal" placeholder="0.00"
            value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
        </div>
        <div>
          <label className="form-label" htmlFor="adj-reason">Reason code</label>
          <select id="adj-reason" className="form-input" value={form.reasonCode} onChange={(e) => setForm({ ...form, reasonCode: e.target.value })}>
            {options.reasonCodes.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ').toLowerCase()}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label" htmlFor="adj-ticket">Ticket (optional)</label>
          <input id="adj-ticket" className="form-input" value={form.ticketRef} onChange={(e) => setForm({ ...form, ticketRef: e.target.value })} />
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <label className="form-label" htmlFor="adj-note">What happened?</label>
        <input id="adj-note" className="form-input" placeholder="At least 8 characters — someone will read this in six months"
          value={form.reasonNote} onChange={(e) => setForm({ ...form, reasonNote: e.target.value })} required />
      </div>

      {amountCents > 0 && (
        <div className="setting-help" style={{ marginTop: 10, color: needsApproval ? 'var(--tv-warning)' : 'var(--tv-forest)' }}>
          <i className={`ti ${needsApproval ? 'ti-hourglass' : 'ti-bolt'}`}></i>{' '}
          {needsApproval
            ? `${money(amountCents)} is at or above the ${money(options.autoApproveBelowCents)} threshold — this goes to a supervisor, not straight through.`
            : `${money(amountCents)} is below the ${money(options.autoApproveBelowCents)} threshold — this executes immediately, and is recorded against you.`}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button className="btn btn-primary btn-sm" type="submit" disabled={busy || !valid}>
          {busy ? <><i className="ti ti-loader spin"></i> Working…</> : needsApproval ? 'Send for approval' : 'Execute now'}
        </button>
        <button className="btn btn-secondary btn-sm" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
