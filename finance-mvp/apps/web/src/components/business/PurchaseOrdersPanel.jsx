import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';

/**
 * Purchase orders (procure-to-pay Phase 2b) — the buy-side mirror of quotes. Issue a PO to a
 * vendor and, once approved / received, convert it to an accounts-payable bill in one click.
 * The PO doesn't touch the ledger; the bill it becomes does. Self-contained.
 */
const CATEGORIES = ['Operating Expenses', 'Cost of Goods Sold', 'Payroll', 'Rent', 'Utilities', 'Software & Subscriptions', 'Bank & Merchant Fees', 'Other'];

function statusBadge(s) {
  const u = (s || '').toUpperCase();
  if (u === 'CONVERTED') return 'badge-green';
  if (u === 'CANCELLED') return 'badge-gray';
  if (u === 'APPROVED' || u === 'RECEIVED') return 'badge-forest';
  return 'badge-gray';
}
function statusLabel(s) {
  const u = (s || '').toUpperCase();
  return u.charAt(0) + u.slice(1).toLowerCase();
}

export default function PurchaseOrdersPanel({ businessId, currency, formatDate, onError, onFlash }) {
  const [pos, setPos] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const empty = { vendor: '', poNumber: '', expenseCategory: 'Operating Expenses', orderDate: new Date().toISOString().slice(0, 10), expectedDate: '', amount: '', notes: '' };
  const [form, setForm] = useState(empty);

  const reload = useCallback(async () => {
    if (!businessId) return;
    try {
      const list = await api.getBusinessPurchaseOrders(businessId);
      setPos(Array.isArray(list) ? list : []);
    } catch (err) { onError?.(err?.message || 'Could not load purchase orders.'); }
  }, [businessId, onError]);

  useEffect(() => { reload(); }, [reload]);

  const onField = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  async function addPo(e) {
    e.preventDefault();
    const vendor = form.vendor.trim();
    const amount = Number(form.amount) || 0;
    if (!vendor || !(amount > 0)) return;
    try {
      await api.createBusinessPurchaseOrder(businessId, {
        vendor, poNumber: form.poNumber || null, expenseCategory: form.expenseCategory,
        orderDate: form.orderDate || null, expectedDate: form.expectedDate || null, amount, notes: form.notes || null,
        status: 'APPROVED',
      });
      setForm(empty);
      setShowAdd(false);
      await reload();
      onFlash?.(`Purchase order for ${currency(amount)} to ${vendor} created.`);
    } catch (err) { onError?.(err?.message || 'Could not create the PO.'); }
  }

  async function convert(po) {
    if (!window.confirm(`Convert PO${po.poNumber ? ` #${po.poNumber}` : ''} to a bill for ${currency(Number(po.amount) || 0)}? This records what you owe ${po.vendor}.`)) return;
    try {
      await api.convertBusinessPurchaseOrder(po.id, {});
      await reload();
      onFlash?.('PO converted — a bill was created in Bills & payables.');
    } catch (err) { onError?.(err?.message || 'Could not convert the PO.'); }
  }

  async function remove(po) {
    if (!window.confirm(`Delete PO from ${po.vendor}?`)) return;
    try { await api.deleteBusinessPurchaseOrder(po.id); await reload(); }
    catch (err) { onError?.(err?.message || 'Could not delete the PO.'); }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="section-header">
        <div className="section-title"><i className="ti ti-clipboard-list" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>Purchase orders</div>
        <button className="btn btn-secondary btn-sm" onClick={() => setShowAdd((v) => !v)} disabled={!businessId}>
          <i className={`ti ${showAdd ? 'ti-x' : 'ti-plus'}`}></i>{showAdd ? ' Cancel' : ' New PO'}
        </button>
      </div>
      <p className="item-sub" style={{ margin: '-4px 0 12px' }}>Issue a PO to a vendor, then convert it to a bill once approved/received — one click drops it into Bills &amp; payables.</p>

      {showAdd && businessId && (
        <form onSubmit={addPo} style={{ marginBottom: 14 }}>
          <div className="grid-2">
            <div className="form-group"><label className="form-label">Vendor *</label><input className="form-input" value={form.vendor} onChange={onField('vendor')} placeholder="e.g. Acme Supply" /></div>
            <div className="form-group"><label className="form-label">PO # (optional)</label><input className="form-input" value={form.poNumber} onChange={onField('poNumber')} /></div>
          </div>
          <div className="grid-2">
            <div className="form-group"><label className="form-label">Category</label>
              <select className="form-select" value={form.expenseCategory} onChange={onField('expenseCategory')}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Amount *</label><input className="form-input" type="number" min="0" step="0.01" value={form.amount} onChange={onField('amount')} placeholder="0.00" /></div>
          </div>
          <div className="grid-2">
            <div className="form-group"><label className="form-label">Order date</label><input className="form-input" type="date" value={form.orderDate} onChange={onField('orderDate')} /></div>
            <div className="form-group"><label className="form-label">Expected date</label><input className="form-input" type="date" value={form.expectedDate} onChange={onField('expectedDate')} /></div>
          </div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={!form.vendor.trim() || !(Number(form.amount) > 0)}><i className="ti ti-plus"></i> Create PO</button>
        </form>
      )}

      {pos.length === 0 ? (
        <div className="empty-state"><i className="ti ti-clipboard-list"></i><p>No purchase orders yet. Issue one to a vendor and convert it to a bill on receipt.</p></div>
      ) : (
        <div className="table-scroll">
          <table className="tv-table">
            <thead><tr><th>Vendor</th><th>Category</th><th style={{ textAlign: 'right' }}>Amount</th><th>Expected</th><th>Status</th><th style={{ textAlign: 'right' }}></th></tr></thead>
            <tbody>
              {pos.map((po) => {
                const converted = String(po.status).toUpperCase() === 'CONVERTED';
                return (
                  <tr key={po.id}>
                    <td style={{ fontWeight: 500 }}>{po.vendor}{po.poNumber ? <div className="item-sub">#{po.poNumber}</div> : null}</td>
                    <td style={{ color: 'var(--tv-text-muted)' }}>{po.expenseCategory || '—'}</td>
                    <td style={{ textAlign: 'right' }}><span className="item-amount">{currency(Number(po.amount) || 0)}</span></td>
                    <td style={{ color: 'var(--tv-text-muted)' }}>{po.expectedDate ? formatDate(po.expectedDate) : '—'}</td>
                    <td><span className={`badge ${statusBadge(po.status)}`}>{statusLabel(po.status)}</span></td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {!converted ? (
                        <button className="btn btn-primary btn-sm" title="Convert to a bill" onClick={() => convert(po)}><i className="ti ti-file-dollar"></i> Convert</button>
                      ) : <span className="item-sub" style={{ marginRight: 6 }}>Billed</span>}
                      <button className="icon-btn" style={{ marginLeft: 4 }} title="Delete PO" onClick={() => remove(po)}><i className="ti ti-trash"></i></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
