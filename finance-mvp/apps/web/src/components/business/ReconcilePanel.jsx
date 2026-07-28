import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';

/**
 * One-click bank reconciliation (Phase 3b). Suggests matches between the business's bank
 * transactions and its open invoices (deposits) / bills (withdrawals) by amount, and applies a
 * confirmed match — marking the invoice/bill paid, linking the transaction, and posting to the
 * ledger. Self-contained; calls onReconciled after each confirm so the rest of the page refreshes.
 */
export default function ReconcilePanel({ businessId, currency, formatDate, onError, onFlash, onReconciled }) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const list = await api.getReconcileSuggestions(businessId);
      setSuggestions(Array.isArray(list) ? list : []);
    } catch (err) { onError?.(err?.message || 'Could not load reconciliation suggestions.'); }
    finally { setLoading(false); }
  }, [businessId, onError]);

  useEffect(() => { load(); }, [load]);

  async function confirmOne(s) {
    await api.confirmReconcile(businessId, { transactionId: s.transactionId, type: s.type, targetId: s.targetId });
    setSuggestions((prev) => prev.filter((x) => x.transactionId !== s.transactionId));
  }

  async function confirm(s) {
    try {
      setBusy(true);
      await confirmOne(s);
      await onReconciled?.();
      onFlash?.(`Matched — ${s.type === 'INVOICE' ? 'invoice' : 'bill'} marked paid.`);
    } catch (err) { onError?.(err?.message || 'Could not confirm the match.'); }
    finally { setBusy(false); }
  }

  async function confirmAll() {
    try {
      setBusy(true);
      let done = 0;
      for (const s of [...suggestions]) {
        try { await confirmOne(s); done++; } catch { /* skip one that failed, keep going */ }
      }
      await onReconciled?.();
      onFlash?.(`Reconciled ${done} transaction${done === 1 ? '' : 's'}.`);
    } catch (err) { onError?.(err?.message || 'Could not reconcile.'); }
    finally { setBusy(false); }
  }

  // Nothing to show when there are no suggested matches — keep the tab uncluttered.
  if (!businessId || (!loading && suggestions.length === 0)) return null;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="section-header">
        <div className="section-title"><i className="ti ti-arrows-transfer-down" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>Reconcile
          {suggestions.length > 0 && <span className="badge badge-forest" style={{ marginLeft: 8 }}>{suggestions.length} match{suggestions.length === 1 ? '' : 'es'}</span>}
        </div>
        {suggestions.length > 0 && (
          <button className="btn btn-primary btn-sm" onClick={confirmAll} disabled={busy}>
            <i className={`ti ${busy ? 'ti-loader-2' : 'ti-checks'}`}></i> Reconcile all
          </button>
        )}
      </div>
      <p className="item-sub" style={{ margin: '-4px 0 12px' }}>We matched bank transactions to open invoices (deposits) and bills (withdrawals) by amount. Confirm to mark them paid and post to the ledger.</p>

      {loading ? (
        <div className="empty-state"><i className="ti ti-loader-2"></i><p>Finding matches…</p></div>
      ) : (
        <div className="table-scroll">
          <table className="tv-table">
            <thead><tr><th>Bank transaction</th><th>Matches</th><th style={{ textAlign: 'right' }}>Amount</th><th style={{ textAlign: 'right' }}></th></tr></thead>
            <tbody>
              {suggestions.map((s) => (
                <tr key={s.transactionId}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{s.transactionDescription || '—'}</div>
                    <div className="item-sub">{s.transactionDate ? formatDate(s.transactionDate) : ''}</div>
                  </td>
                  <td>
                    <span className={`badge ${s.type === 'INVOICE' ? 'badge-forest' : 'badge-amber'}`}>{s.type === 'INVOICE' ? 'Invoice' : 'Bill'}</span>{' '}
                    <span>{s.counterparty}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}><span className="item-amount">{currency(Number(s.amount) || 0)}</span></td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => confirm(s)} disabled={busy}><i className="ti ti-check"></i> Confirm</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
