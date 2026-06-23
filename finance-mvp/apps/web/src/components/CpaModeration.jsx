import React, { useEffect, useState } from 'react';
import { api } from '../api';

/* Short timestamp for the submitted-at column. */
function ts(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const specialtiesOf = (c) => {
  const s = c?.specialtyList ?? c?.specialties;
  if (Array.isArray(s)) return s;
  if (typeof s === 'string') return s.split(',').map((x) => x.trim()).filter(Boolean);
  return [];
};

/**
 * Staff (CARE/ADMIN) moderation queue for self-registered CPA listings. Each pending
 * listing can be approved (becomes visible in the marketplace) or rejected.
 */
export default function CpaModeration() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null); // id currently being acted on
  const [verify, setVerify] = useState({}); // id -> { verified, source, at }

  async function load() {
    setError('');
    try {
      const res = await api.getPendingCpas();
      setRows(Array.isArray(res) ? res : []);
    } catch (e) {
      setError(e.message || 'Could not load pending listings');
      setRows([]);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function act(id, fn) {
    setError('');
    setBusy(id);
    try {
      await fn(id);
      setRows((rs) => (rs || []).filter((r) => r.id !== id));
    } catch (e) {
      setError(e.message || 'Action failed — please try again.');
    } finally {
      setBusy(null);
    }
  }

  // Run the license check without removing the row, so staff can see the result before approving.
  async function runVerify(id) {
    setError('');
    setBusy(id);
    try {
      const r = await api.verifyCpa(id);
      setVerify((v) => ({ ...v, [id]: r }));
    } catch (e) {
      setError(e.message || 'Verification failed — please try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">Pending CPA listings</div>
          <div className="page-subtitle">Review self-registered CPAs before they go live in the marketplace.</div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load}><i className="ti ti-refresh"></i> Refresh</button>
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'var(--tv-negative)', marginBottom: 12 }}>
          <span style={{ color: 'var(--tv-negative)' }}><i className="ti ti-alert-triangle"></i> {error}</span>
        </div>
      )}

      {rows === null ? (
        <div className="card empty-state"><i className="ti ti-loader spin"></i><p>Loading…</p></div>
      ) : rows.length === 0 ? (
        <div className="card empty-state"><i className="ti ti-circle-check"></i><p>No pending listings — you're all caught up.</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {rows.map((c) => (
            <div key={c.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div className="item-name" style={{ fontSize: 16 }}>{c.name}</div>
                  <div className="item-sub">{c.credentials}{c.firm ? ` · ${c.firm}` : ''}</div>
                </div>
                <span className="item-sub" style={{ fontSize: 12 }}>Submitted {ts(c.submittedAt)}</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, margin: '12px 0', fontSize: 13 }}>
                <div className="item-sub"><i className="ti ti-license"></i> License: {c.licenseState || '—'} #{c.licenseNumber || '—'}</div>
                <div className="item-sub"><i className="ti ti-mail"></i> {c.contactEmail || '—'}</div>
                <div className="item-sub"><i className="ti ti-phone"></i> {c.phone || '—'}</div>
                <div className="item-sub"><i className="ti ti-map-pin"></i> {c.location || '—'}</div>
                <div className="item-sub"><i className="ti ti-briefcase"></i> {c.yearsExperience != null ? `${c.yearsExperience} yrs` : '—'}{c.feeModel ? ` · ${c.feeModel}` : ''}</div>
                {c.websiteUrl && (
                  <div className="item-sub"><i className="ti ti-world"></i> <a href={c.websiteUrl} target="_blank" rel="noopener noreferrer">Website</a></div>
                )}
                {c.googleReviewUrl && (
                  <div className="item-sub">
                    <i className="ti ti-brand-google"></i> <a href={c.googleReviewUrl} target="_blank" rel="noopener noreferrer">Google reviews</a>
                    {c.googleRating != null && <span> · <span style={{ color: 'var(--tv-gold)' }}>★</span> {Number(c.googleRating).toFixed(1)}</span>}
                  </div>
                )}
              </div>

              {specialtiesOf(c).length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {specialtiesOf(c).map((s) => (
                    <span key={s} className="badge" style={{ background: 'var(--tv-sage-pale)', color: 'var(--tv-forest)' }}>{s}</span>
                  ))}
                </div>
              )}

              {c.bio && <p className="item-sub" style={{ fontSize: 13, marginBottom: 12 }}>{c.bio}</p>}

              {verify[c.id] && (
                <div className="item-sub" style={{ fontSize: 12.5, marginBottom: 10 }}>
                  {verify[c.id].licenseVerified ? (
                    <span style={{ color: 'var(--tv-forest)' }}>
                      <i className="ti ti-rosette-discount-check"></i> License verified via {verify[c.id].verificationSource}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--tv-negative)' }}>
                      <i className="ti ti-alert-triangle"></i> Not verified ({verify[c.id].verificationSource})
                    </span>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-primary btn-sm" disabled={busy === c.id} onClick={() => act(c.id, api.approveCpa)}>
                  <i className="ti ti-check"></i> Approve
                </button>
                <button className="btn btn-secondary btn-sm" disabled={busy === c.id} onClick={() => runVerify(c.id)}>
                  <i className="ti ti-rosette-discount-check"></i> Verify license
                </button>
                <button className="btn btn-secondary btn-sm" disabled={busy === c.id} style={{ color: 'var(--tv-negative)' }} onClick={() => act(c.id, api.rejectCpa)}>
                  <i className="ti ti-x"></i> Reject
                </button>
              </div>
              <div className="item-sub" style={{ fontSize: 11, marginTop: 6 }}>Approving also runs a license check automatically.</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
