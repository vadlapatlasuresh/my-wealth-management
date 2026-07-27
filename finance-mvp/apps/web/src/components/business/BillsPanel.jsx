import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';

/**
 * Vendor bills / accounts payable (procure-to-pay Phase 2a) — the AP counterpart of invoices.
 * Record what the business owes, when it's due, and pay (full or partial) or void. Every action
 * posts to the general ledger. Self-contained: fetches + manages its own bills.
 */
const CATEGORIES = ['Operating Expenses', 'Cost of Goods Sold', 'Payroll', 'Rent', 'Utilities', 'Software & Subscriptions', 'Bank & Merchant Fees', 'Other'];

function statusBadge(s) {
  const u = (s || '').toUpperCase();
  if (u === 'PAID') return 'badge-green';
  if (u === 'VOID') return 'badge-gray';
  if (u === 'PARTIALLY_PAID') return 'badge-amber';
  return 'badge-amber';
}
function statusLabel(s) {
  const u = (s || '').toUpperCase();
  if (u === 'PARTIALLY_PAID') return 'Partially paid';
  return u.charAt(0) + u.slice(1).toLowerCase();
}

export default function BillsPanel({ businessId, currency, formatDate, onError, onFlash }) {
  const [bills, setBills] = useState([]);
  const [totalPayable, setTotalPayable] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const empty = { vendor: '', billNumber: '', expenseCategory: 'Operating Expenses', billDate: new Date().toISOString().slice(0, 10), dueDate: '', amount: '', notes: '' };
  const [form, setForm] = useState(empty);

  const reload = useCallback(async () => {
    if (!businessId) return;
    try {
      const res = await api.getBusinessBills(businessId);
      setBills(Array.isArray(res?.bills) ? res.bills : []);
      setTotalPayable(Number(res?.totalPayable) || 0);
    } catch (err) { onError?.(err?.message || 'Could not load bills.'); }
  }, [businessId, onError]);

  useEffect(() => { reload(); }, [reload]);

  const onField = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  async function addBill(e) {
    e.preventDefault();
    const vendor = form.vendor.trim();
    const amount = Number(form.amount) || 0;
    if (!vendor || !(amount > 0)) return;
    try {
      await api.createBusinessBill(businessId, {
        vendor, billNumber: form.billNumber || null, expenseCategory: form.expenseCategory,
        billDate: form.billDate || null, dueDate: form.dueDate || null, amount, notes: form.notes || null,
      });
      setForm(empty);
      setShowAdd(false);
      await reload();
      onFlash?.(`Bill for ${currency(amount)} from ${vendor} recorded.`);
    } catch (err) { onError?.(err?.message || 'Could not record the bill.'); }
  }

  async function pay(b) {
    const due = Math.max(0, (Number(b.amount) || 0) - (Number(b.paidAmount) || 0));
    const input = window.prompt(`Record a payment to ${b.vendor}. Amount (leave as-is to pay in full):`, String(due.toFixed(2)));
    if (input == null) return;
    const paidAmount = Number(input);
    if (!(paidAmount > 0)) return;
    try {
      await api.payBusinessBill(b.id, { paidAmount });
      await reload();
      onFlash?.('Bill payment recorded.');
    } catch (err) { onError?.(err?.message || 'Could not record the payment.'); }
  }

  async function voidBill(b) {
    if (!window.confirm(`Void this bill from ${b.vendor}? It stays on record but no longer counts as owed.`)) return;
    try { await api.voidBusinessBill(b.id); await reload(); onFlash?.('Bill voided.'); }
    catch (err) { onError?.(err?.message || 'Could not void the bill.'); }
  }

  async function remove(b) {
    if (!window.confirm(`Delete this bill from ${b.vendor}?`)) return;
    try { await api.deleteBusinessBill(b.id); await reload(); }
    catch (err) { onError?.(err?.message || 'Could not delete the bill.'); }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="section-header">
        <div className="section-title"><i className="ti ti-file-dollar" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>Bills &amp; payables
          {totalPayable > 0 && <span className="badge badge-amber" style={{ marginLeft: 8 }}>{currency(totalPayable)} owed</span>}
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => setShowAdd((v) => !v)} disabled={!businessId}>
          <i className={`ti ${showAdd ? 'ti-x' : 'ti-plus'}`}></i>{showAdd ? ' Cancel' : ' New bill'}
        </button>
      </div>
      <p className="item-sub" style={{ margin: '-4px 0 12px' }}>Record vendor bills and pay them — each posts to your ledger (expense &amp; accounts payable).</p>

      {showAdd && businessId && (
        <form onSubmit={addBill} style={{ marginBottom: 14 }}>
          <div className="grid-2">
            <div className="form-group"><label className="form-label">Vendor *</label><input className="form-input" value={form.vendor} onChange={onField('vendor')} placeholder="e.g. Staples" /></div>
            <div className="form-group"><label className="form-label">Bill # (optional)</label><input className="form-input" value={form.billNumber} onChange={onField('billNumber')} /></div>
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
            <div className="form-group"><label className="form-label">Bill date</label><input className="form-input" type="date" value={form.billDate} onChange={onField('billDate')} /></div>
            <div className="form-group"><label className="form-label">Due date</label><input className="form-input" type="date" value={form.dueDate} onChange={onField('dueDate')} /></div>
          </div>
          <div className="form-group"><label className="form-label">Notes</label><input className="form-input" value={form.notes} onChange={onField('notes')} placeholder="Optional" /></div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={!form.vendor.trim() || !(Number(form.amount) > 0)}><i className="ti ti-plus"></i> Record bill</button>
        </form>
      )}

      {bills.length === 0 ? (
        <div className="empty-state"><i className="ti ti-file-dollar"></i><p>No bills yet. Record what you owe vendors to track accounts payable.</p></div>
      ) : (
        <div className="table-scroll">
          <table className="tv-table">
            <thead><tr><th>Vendor</th><th>Category</th><th style={{ textAlign: 'right' }}>Amount</th><th>Due</th><th>Status</th><th style={{ textAlign: 'right' }}></th></tr></thead>
            <tbody>
              {bills.map((b) => {
                const terminal = ['PAID', 'VOID'].includes((b.status || '').toUpperCase());
                const outstanding = Math.max(0, (Number(b.amount) || 0) - (Number(b.paidAmount) || 0));
                return (
                  <tr key={b.id}>
                    <td style={{ fontWeight: 500 }}>{b.vendor}{b.billNumber ? <div className="item-sub">#{b.billNumber}</div> : null}</td>
                    <td style={{ color: 'var(--tv-text-muted)' }}>{b.expenseCategory || '—'}</td>
                    <td style={{ textAlign: 'right' }}><span className="item-amount">{currency(Number(b.amount) || 0)}</span>{b.status === 'PARTIALLY_PAID' && <div className="item-sub">{currency(outstanding)} due</div>}</td>
                    <td style={{ color: 'var(--tv-text-muted)' }}>{b.dueDate ? formatDate(b.dueDate) : '—'}</td>
                    <td><span className={`badge ${statusBadge(b.status)}`}>{statusLabel(b.status)}</span></td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {!terminal && <button className="btn btn-secondary btn-sm" title="Record payment" onClick={() => pay(b)}><i className="ti ti-cash"></i> Pay</button>}
                      {!terminal && <button className="icon-btn" style={{ marginLeft: 4 }} title="Void bill" onClick={() => voidBill(b)}><i className="ti ti-ban"></i></button>}
                      <button className="icon-btn" style={{ marginLeft: 4 }} title="Delete bill" onClick={() => remove(b)}><i className="ti ti-trash"></i></button>
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
