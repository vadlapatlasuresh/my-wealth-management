import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../api';

/**
 * Manage a business's sales-tax / VAT rates (order-to-cash Phase 1.7). Owner-defined flat
 * rates scoped to a country / region / postal (or a default), auto-applied to invoices from
 * the customer's billing location.
 */
const emptyForm = { name: '', rate: '', country: '', region: '', postal: '', isDefault: false, active: true };

export default function TaxRatesDrawer({ businessId, onClose, onChanged }) {
  const [rates, setRates] = useState([]);
  const [mode, setMode] = useState('list'); // list | form
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    try {
      const list = await api.getBusinessTaxRates(businessId);
      setRates(Array.isArray(list) ? list : []);
    } catch (err) { setError(err?.message || 'Could not load tax rates.'); }
  }, [businessId]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onField = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  function startAdd() { setForm(emptyForm); setEditingId(null); setError(''); setMode('form'); }
  function startEdit(r) {
    setForm({ name: r.name || '', rate: r.rate != null ? String(r.rate) : '', country: r.country || '', region: r.region || '', postal: r.postal || '', isDefault: !!r.isDefault, active: r.active !== false });
    setEditingId(r.id); setError(''); setMode('form');
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim() || !(Number(form.rate) >= 0) || form.rate === '') { setError('A name and rate are required.'); return; }
    try {
      setSaving(true); setError('');
      const payload = { ...form, rate: Number(form.rate) };
      if (editingId) await api.updateBusinessTaxRate(businessId, editingId, payload);
      else await api.createBusinessTaxRate(businessId, payload);
      await reload();
      await onChanged?.();
      setMode('list');
    } catch (err) {
      setError(err?.message || 'Could not save the tax rate.');
    } finally { setSaving(false); }
  }

  async function remove(r) {
    if (!window.confirm(`Delete "${r.name}"?`)) return;
    try { await api.deleteBusinessTaxRate(businessId, r.id); await reload(); await onChanged?.(); }
    catch (err) { setError(err?.message || 'Could not delete the tax rate.'); }
  }

  const scope = (r) => [r.postal, r.region, r.country].filter(Boolean).join(' · ') || (r.isDefault ? 'Default (all)' : 'All');

  return (
    <div className="expense-modal-overlay" role="dialog" aria-modal="true" aria-label="Tax rates"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="expense-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="expense-modal-head">
          <div className="section-title" style={{ marginBottom: 2 }}>
            <i className="ti ti-receipt-tax" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>
            {mode === 'form' ? (editingId ? 'Edit tax rate' : 'New tax rate') : 'Sales-tax rates'}
          </div>
          <button className="icon-btn" onClick={onClose} title="Close"><i className="ti ti-x"></i></button>
        </div>

        {mode === 'list' ? (
          <div className="expense-modal-body">
            <p className="item-sub" style={{ marginBottom: 12 }}>Define rates by jurisdiction. The best match for a customer's billing location is applied automatically on their invoices.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              <button className="btn btn-primary btn-sm" onClick={startAdd}><i className="ti ti-plus"></i> Add rate</button>
            </div>
            {rates.length === 0 ? (
              <div className="empty-state"><i className="ti ti-receipt-tax"></i><p>No tax rates yet. Add one (e.g. "CA Sales Tax · 8.25%") to auto-apply tax by location.</p></div>
            ) : (
              <div className="table-scroll">
                <table className="tv-table">
                  <thead><tr><th>Name</th><th style={{ textAlign: 'right' }}>Rate</th><th>Applies to</th><th style={{ width: 70 }}></th></tr></thead>
                  <tbody>
                    {rates.map((r) => (
                      <tr key={r.id} style={{ opacity: r.active === false ? 0.5 : 1 }}>
                        <td style={{ fontWeight: 500 }}>{r.name}{r.isDefault ? <span className="badge badge-gray" style={{ marginLeft: 6 }}>Default</span> : null}</td>
                        <td style={{ textAlign: 'right' }}>{Number(r.rate)}%</td>
                        <td style={{ color: 'var(--tv-text-muted)' }}>{scope(r)}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button className="icon-btn" title="Edit" onClick={() => startEdit(r)}><i className="ti ti-pencil"></i></button>
                          <button className="icon-btn" title="Delete" onClick={() => remove(r)}><i className="ti ti-trash"></i></button>
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
              {error && <div className="card" style={{ borderLeft: '4px solid var(--tv-negative)', color: 'var(--tv-negative)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Name *</label>
                  <input className="form-input" value={form.name} onChange={onField('name')} placeholder="e.g. CA Sales Tax" autoFocus />
                </div>
                <div className="form-group">
                  <label className="form-label">Rate (%) *</label>
                  <input className="form-input" type="number" min="0" step="0.0001" value={form.rate} onChange={onField('rate')} placeholder="8.25" />
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Country</label>
                  <input className="form-input" value={form.country} onChange={onField('country')} placeholder="US" maxLength={2} />
                </div>
                <div className="form-group">
                  <label className="form-label">State / region</label>
                  <input className="form-input" value={form.region} onChange={onField('region')} placeholder="CA" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Postal / ZIP (exact)</label>
                <input className="form-input" value={form.postal} onChange={onField('postal')} placeholder="94103" />
              </div>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm((p) => ({ ...p, isDefault: e.target.checked }))} />
                Use as the default rate when nothing else matches
              </label>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <input type="checkbox" checked={form.active} onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))} />
                Active
              </label>
            </div>
            <div className="expense-modal-foot" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMode('list')} disabled={saving}><i className="ti ti-arrow-left"></i> Back</button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving}><i className="ti ti-check"></i> {saving ? 'Saving…' : (editingId ? 'Save changes' : 'Add rate')}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
