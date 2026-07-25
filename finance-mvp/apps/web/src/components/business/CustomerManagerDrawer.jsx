import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';

/**
 * Manage a business's saved customers / contacts (order-to-cash, Phase 1.1).
 *
 * A saved customer is the reusable party an invoice is addressed to — it carries the
 * contact channels used for email/SMS delivery, a tax id, a preferred payment method and
 * billing / shipping addresses. Invoices reference one via customerId while keeping their
 * own inline snapshot, so editing or archiving a customer never rewrites history.
 */

const PAYMENT_METHODS = [
  { v: '', label: '—' },
  { v: 'CARD', label: 'Credit / debit card' },
  { v: 'ACH', label: 'Bank transfer (ACH)' },
  { v: 'ECHECK', label: 'e-Check' },
  { v: 'CHECK', label: 'Check' },
  { v: 'CASH', label: 'Cash' },
  { v: 'OTHER', label: 'Other' },
];

const emptyForm = {
  displayName: '', company: '', firstName: '', lastName: '',
  email: '', phone: '', mobile: '', taxId: '', preferredPaymentMethod: '',
  billingLine1: '', billingLine2: '', billingCity: '', billingRegion: '', billingPostal: '', billingCountry: '',
  shippingSameAsBilling: true,
  shippingLine1: '', shippingLine2: '', shippingCity: '', shippingRegion: '', shippingPostal: '', shippingCountry: '',
  notes: '',
};

function toForm(c) {
  return { ...emptyForm, ...Object.fromEntries(Object.keys(emptyForm).map((k) => [k, c[k] ?? emptyForm[k]])) };
}

export default function CustomerManagerDrawer({ businessId, customers = [], onChanged, onClose }) {
  const [mode, setMode] = useState('list');   // list | form
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onField = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const active = useMemo(() => customers.filter((c) => (c.status || 'ACTIVE') !== 'ARCHIVED'), [customers]);

  function startAdd() { setForm(emptyForm); setEditingId(null); setError(''); setMode('form'); }
  function startEdit(c) { setForm(toForm(c)); setEditingId(c.id); setError(''); setMode('form'); }

  async function submit(e) {
    e.preventDefault();
    const displayName = (form.displayName || `${form.firstName} ${form.lastName}`).trim();
    if (!displayName) { setError('A customer name is required.'); return; }
    try {
      setSaving(true); setError('');
      const payload = { ...form, displayName };
      if (editingId) await api.updateBusinessCustomer(businessId, editingId, payload);
      else await api.createBusinessCustomer(businessId, payload);
      await onChanged?.();
      setMode('list');
    } catch (err) {
      setError(err?.message || 'Could not save the customer.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(c) {
    if (!window.confirm(`Remove ${c.displayName}? Their past invoices are kept.`)) return;
    try {
      await api.deleteBusinessCustomer(businessId, c.id);
      await onChanged?.();
    } catch (err) {
      setError(err?.message || 'Could not remove the customer.');
    }
  }

  return (
    <div className="expense-modal-overlay" role="dialog" aria-modal="true" aria-label="Manage customers"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="expense-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="expense-modal-head">
          <div className="section-title" style={{ marginBottom: 2 }}>
            <i className="ti ti-users" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>
            {mode === 'form' ? (editingId ? 'Edit customer' : 'New customer') : 'Customers'}
          </div>
          <button className="icon-btn" onClick={onClose} title="Close"><i className="ti ti-x"></i></button>
        </div>

        {mode === 'list' ? (
          <div className="expense-modal-body">
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              <button className="btn btn-primary btn-sm" onClick={startAdd}><i className="ti ti-plus"></i> Add customer</button>
            </div>
            {active.length === 0 ? (
              <div className="empty-state"><i className="ti ti-users"></i><p>No saved customers yet. Add one to reuse their details on invoices.</p></div>
            ) : (
              <div className="table-scroll">
                <table className="tv-table">
                  <thead><tr><th>Name</th><th>Contact</th><th>Pays by</th><th style={{ width: 80 }}></th></tr></thead>
                  <tbody>
                    {active.map((c) => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 500 }}>{c.displayName}{c.company && c.company !== c.displayName ? <div className="item-sub">{c.company}</div> : null}</td>
                        <td style={{ color: 'var(--tv-text-muted)', fontSize: 13 }}>
                          {c.email || '—'}{c.mobile || c.phone ? <div className="item-sub">{c.mobile || c.phone}</div> : null}
                        </td>
                        <td>{(PAYMENT_METHODS.find((p) => p.v === c.preferredPaymentMethod) || {}).label || '—'}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button className="icon-btn" title="Edit" onClick={() => startEdit(c)}><i className="ti ti-pencil"></i></button>
                          <button className="icon-btn" title="Remove" onClick={() => remove(c)}><i className="ti ti-trash"></i></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="expense-modal-body">
              {error && (
                <div className="card" style={{ borderLeft: '4px solid var(--tv-negative)', color: 'var(--tv-negative)', fontSize: 13, marginBottom: 12 }}>{error}</div>
              )}
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Display name *</label>
                  <input className="form-input" value={form.displayName} onChange={onField('displayName')} placeholder="e.g. Acme Corp" autoFocus />
                </div>
                <div className="form-group">
                  <label className="form-label">Company</label>
                  <input className="form-input" value={form.company} onChange={onField('company')} placeholder="Legal / trading name" />
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">First name</label>
                  <input className="form-input" value={form.firstName} onChange={onField('firstName')} />
                </div>
                <div className="form-group">
                  <label className="form-label">Last name</label>
                  <input className="form-input" value={form.lastName} onChange={onField('lastName')} />
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" type="email" value={form.email} onChange={onField('email')} placeholder="billing@acme.com" />
                </div>
                <div className="form-group">
                  <label className="form-label">Tax ID</label>
                  <input className="form-input" value={form.taxId} onChange={onField('taxId')} placeholder="EIN / VAT" />
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input className="form-input" value={form.phone} onChange={onField('phone')} placeholder="+1 555 123 4567" />
                </div>
                <div className="form-group">
                  <label className="form-label">Mobile (for SMS)</label>
                  <input className="form-input" value={form.mobile} onChange={onField('mobile')} placeholder="+1 555 987 6543" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Preferred payment method</label>
                <select className="form-select" value={form.preferredPaymentMethod} onChange={onField('preferredPaymentMethod')}>
                  {PAYMENT_METHODS.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
                </select>
              </div>

              <div className="section-title" style={{ fontSize: 14, margin: '8px 0 6px' }}>Billing address</div>
              <div className="form-group">
                <input className="form-input" value={form.billingLine1} onChange={onField('billingLine1')} placeholder="Address line 1" />
              </div>
              <div className="form-group">
                <input className="form-input" value={form.billingLine2} onChange={onField('billingLine2')} placeholder="Address line 2" />
              </div>
              <div className="grid-2">
                <div className="form-group"><input className="form-input" value={form.billingCity} onChange={onField('billingCity')} placeholder="City" /></div>
                <div className="form-group"><input className="form-input" value={form.billingRegion} onChange={onField('billingRegion')} placeholder="State / province" /></div>
              </div>
              <div className="grid-2">
                <div className="form-group"><input className="form-input" value={form.billingPostal} onChange={onField('billingPostal')} placeholder="Postal code" /></div>
                <div className="form-group"><input className="form-input" value={form.billingCountry} onChange={onField('billingCountry')} placeholder="Country (e.g. US)" maxLength={2} /></div>
              </div>

              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <input type="checkbox" checked={form.shippingSameAsBilling}
                  onChange={(e) => setForm((p) => ({ ...p, shippingSameAsBilling: e.target.checked }))} />
                Shipping address same as billing
              </label>
              {!form.shippingSameAsBilling && (
                <>
                  <div className="section-title" style={{ fontSize: 14, margin: '8px 0 6px' }}>Shipping address</div>
                  <div className="form-group"><input className="form-input" value={form.shippingLine1} onChange={onField('shippingLine1')} placeholder="Address line 1" /></div>
                  <div className="form-group"><input className="form-input" value={form.shippingLine2} onChange={onField('shippingLine2')} placeholder="Address line 2" /></div>
                  <div className="grid-2">
                    <div className="form-group"><input className="form-input" value={form.shippingCity} onChange={onField('shippingCity')} placeholder="City" /></div>
                    <div className="form-group"><input className="form-input" value={form.shippingRegion} onChange={onField('shippingRegion')} placeholder="State / province" /></div>
                  </div>
                  <div className="grid-2">
                    <div className="form-group"><input className="form-input" value={form.shippingPostal} onChange={onField('shippingPostal')} placeholder="Postal code" /></div>
                    <div className="form-group"><input className="form-input" value={form.shippingCountry} onChange={onField('shippingCountry')} placeholder="Country (e.g. US)" maxLength={2} /></div>
                  </div>
                </>
              )}

              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea className="form-input" rows={2} value={form.notes} onChange={onField('notes')} placeholder="Internal note about this customer" />
              </div>
            </div>
            <div className="expense-modal-foot" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMode('list')} disabled={saving}>
                <i className="ti ti-arrow-left"></i> Back
              </button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                <i className="ti ti-check"></i> {saving ? 'Saving…' : (editingId ? 'Save changes' : 'Add customer')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
