import React, { useEffect, useState } from 'react';
import { api, hasOpsPermission } from '../api';
import { ts } from '../pages/OpsMoneyPage';

/**
 * Internal notes + escalations on a customer.
 *
 * This is the support team's memory. Without it every call starts from zero and the customer
 * explains their problem again to whoever picks up next.
 *
 * Notes are append-only — no edit, deliberately. An editable note is one nobody can rely on in a
 * dispute; a correction is a new note.
 */
export default function CustomerNotes({ userId, name, onChanged }) {
  const [notes, setNotes] = useState(null);
  const [escalations, setEscalations] = useState([]);
  const [error, setError] = useState('');
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [escalating, setEscalating] = useState(false);

  const canWrite = hasOpsPermission('customer.note.write');
  const canEscalate = hasOpsPermission('customer.escalate');

  async function load() {
    setError('');
    try {
      const [n, e] = await Promise.all([api.opsListNotes(userId), api.opsListEscalations(userId)]);
      setNotes(Array.isArray(n) ? n : []);
      setEscalations(Array.isArray(e) ? e : []);
    } catch (err) {
      setError(err.message || 'Could not load notes');
      setNotes([]);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [userId]);

  async function addNote(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api.opsAddNote(userId, body.trim(), pinned);
      setBody(''); setPinned(false);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message || 'Could not add the note');
    } finally { setBusy(false); }
  }

  async function resolve(id, resolution) {
    setBusy(true); setError('');
    try {
      await api.opsResolveEscalation(id, resolution);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message || 'Could not resolve');
    } finally { setBusy(false); }
  }

  if (notes === null) return <div className="empty-state"><i className="ti ti-loader spin"></i><p>Loading…</p></div>;

  const openEscalations = escalations.filter((e) => e.status === 'OPEN');

  return (
    <>
      {error && <div className="setting-help" style={{ color: 'var(--tv-negative)', marginBottom: 8 }}>
        <i className="ti ti-alert-triangle"></i> {error}</div>}

      {canWrite && (
        <form onSubmit={addNote} style={{ marginBottom: 14 }}>
          <input
            className="form-input"
            placeholder={`What should the next agent know about ${name || 'this member'}?`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-sm" type="submit" disabled={busy || !body.trim()}>
              <i className="ti ti-note"></i> Add note
            </button>
            <label className="setting-help" style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
              <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
              Pin to the top of the record
            </label>
            {canEscalate && (
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => setEscalating((v) => !v)} style={{ marginLeft: 'auto' }}>
                <i className="ti ti-arrow-up-right"></i> {escalating ? 'Cancel' : 'Escalate'}
              </button>
            )}
          </div>
        </form>
      )}

      {escalating && (
        <EscalationForm
          userId={userId}
          onCancel={() => setEscalating(false)}
          onDone={() => { setEscalating(false); load(); onChanged?.(); }}
          onError={setError}
        />
      )}

      {openEscalations.length > 0 && (
        <div className="card" style={{ marginBottom: 12, borderColor: 'var(--tv-warning)' }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            <i className="ti ti-flag" style={{ color: 'var(--tv-warning)' }}></i> Open escalations
          </div>
          {openEscalations.map((e) => (
            <ResolvableEscalation key={e.id} e={e} canEscalate={canEscalate} busy={busy} onResolve={resolve} />
          ))}
        </div>
      )}

      {notes.length === 0 ? (
        <div className="empty-state"><i className="ti ti-note"></i><p>No notes yet.</p></div>
      ) : (
        notes.map((n) => (
          <div key={n.id} className="card" style={{ marginBottom: 8, borderColor: n.pinned ? 'var(--tv-gold)' : 'var(--tv-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ flex: 1 }}>
                {n.pinned && <span className="badge badge-amber" style={{ marginRight: 6 }}><i className="ti ti-pin"></i> Pinned</span>}
                {n.body}
              </div>
              <div className="setting-help" style={{ whiteSpace: 'nowrap' }}>Ops #{n.authorId} · {ts(n.createdAt)}</div>
            </div>
          </div>
        ))
      )}
    </>
  );
}

function ResolvableEscalation({ e, canEscalate, busy, onResolve }) {
  const [resolving, setResolving] = useState(false);
  const [resolution, setResolution] = useState('');

  return (
    <div style={{ paddingTop: 6 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className={`badge ${e.severity === 'HIGH' ? 'badge-red' : 'badge-amber'}`}>{e.severity}</span>
        <span style={{ fontWeight: 600 }}>{e.summary}</span>
        <span className="setting-help">raised by ops #{e.raisedBy} · {ts(e.createdAt)}</span>
      </div>
      {e.detail && <div className="setting-help" style={{ marginTop: 2 }}>{e.detail}</div>}
      {canEscalate && (resolving ? (
        <div style={{ marginTop: 6 }}>
          <input className="form-input" placeholder="How was it resolved? (required)"
            value={resolution} onChange={(ev) => setResolution(ev.target.value)} autoFocus />
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button className="btn btn-primary btn-sm" disabled={busy || !resolution.trim()} onClick={() => onResolve(e.id, resolution.trim())}>
              Resolve
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setResolving(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={() => setResolving(true)}>
          <i className="ti ti-check"></i> Resolve
        </button>
      ))}
    </div>
  );
}

function EscalationForm({ userId, onCancel, onDone, onError }) {
  const [form, setForm] = useState({ severity: 'MEDIUM', summary: '', detail: '' });
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.opsRaiseEscalation(userId, form);
      onDone();
    } catch (err) {
      onError(err.message || 'Could not raise the escalation');
    } finally { setBusy(false); }
  }

  return (
    <form className="card" style={{ marginBottom: 12 }} onSubmit={submit}>
      <div className="card-title">Escalate</div>
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10, marginTop: 8 }}>
        <div>
          <label className="form-label" htmlFor="esc-sev">Severity</label>
          <select id="esc-sev" className="form-input" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
          </select>
        </div>
        <div>
          <label className="form-label" htmlFor="esc-sum">Summary</label>
          <input id="esc-sum" className="form-input" value={form.summary} required
            onChange={(e) => setForm({ ...form, summary: e.target.value })} />
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <label className="form-label" htmlFor="esc-detail">Detail (optional)</label>
        <input id="esc-detail" className="form-input" value={form.detail}
          onChange={(e) => setForm({ ...form, detail: e.target.value })} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button className="btn btn-primary btn-sm" type="submit" disabled={busy || !form.summary.trim()}>
          {busy ? 'Raising…' : 'Raise escalation'}
        </button>
        <button className="btn btn-secondary btn-sm" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
