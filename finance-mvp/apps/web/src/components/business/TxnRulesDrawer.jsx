import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';

/**
 * Manage transaction categorization rules (bank feeds, Phase 3a). A rule matches the merchant
 * or description and assigns a category; rules apply automatically to new transactions and, on
 * demand, to existing uncategorized ones.
 */
const CATEGORIES = ['Operating Expenses', 'Cost of Goods Sold', 'Payroll', 'Rent', 'Utilities', 'Software & Subscriptions', 'Bank & Merchant Fees', 'Meals & Entertainment', 'Travel', 'Income', 'Other'];

const emptyForm = { matchField: 'MERCHANT', matchType: 'CONTAINS', matchValue: '', setCategory: 'Operating Expenses', active: true };

export default function TxnRulesDrawer({ businessId, onClose, onApplied }) {
  const [rules, setRules] = useState([]);
  const [mode, setMode] = useState('list'); // list | form
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    try {
      const list = await api.getBusinessTxnRules(businessId);
      setRules(Array.isArray(list) ? list : []);
    } catch (err) { setError(err?.message || 'Could not load rules.'); }
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
    setForm({ matchField: r.matchField, matchType: r.matchType, matchValue: r.matchValue || '', setCategory: r.setCategory || 'Operating Expenses', active: r.active !== false });
    setEditingId(r.id); setError(''); setMode('form');
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.matchValue.trim()) { setError('Enter text to match on.'); return; }
    try {
      setSaving(true); setError('');
      if (editingId) await api.updateBusinessTxnRule(editingId, form);
      else await api.createBusinessTxnRule(businessId, form);
      await reload();
      setMode('list');
    } catch (err) { setError(err?.message || 'Could not save the rule.'); }
    finally { setSaving(false); }
  }

  async function remove(r) {
    if (!window.confirm(`Delete the rule for "${r.matchValue}"?`)) return;
    try { await api.deleteBusinessTxnRule(r.id); await reload(); }
    catch (err) { setError(err?.message || 'Could not delete the rule.'); }
  }

  async function applyNow() {
    try {
      setApplying(true);
      const res = await api.applyBusinessTxnRules(businessId);
      await onApplied?.();
      setError('');
      window.alert(res?.updated > 0 ? `${res.updated} transaction${res.updated === 1 ? '' : 's'} categorized.` : 'No uncategorized transactions matched your rules.');
    } catch (err) { setError(err?.message || 'Could not apply rules.'); }
    finally { setApplying(false); }
  }

  const fieldLabel = (f) => (f === 'DESCRIPTION' ? 'Description' : 'Merchant');
  const typeLabel = (t) => ({ CONTAINS: 'contains', EQUALS: 'equals', STARTS_WITH: 'starts with' }[t] || 'contains');

  return (
    <div className="expense-modal-overlay" role="dialog" aria-modal="true" aria-label="Transaction rules"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="expense-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="expense-modal-head">
          <div className="section-title" style={{ marginBottom: 2 }}>
            <i className="ti ti-filter-cog" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>
            {mode === 'form' ? (editingId ? 'Edit rule' : 'New rule') : 'Categorization rules'}
          </div>
          <button className="icon-btn" onClick={onClose} title="Close"><i className="ti ti-x"></i></button>
        </div>

        {mode === 'list' ? (
          <div className="expense-modal-body">
            <p className="item-sub" style={{ marginBottom: 12 }}>Rules auto-categorize transactions by matching the merchant or description. New transactions are categorized as they arrive; use "Apply now" for existing ones.</p>
            {error && <div className="card" style={{ borderLeft: '4px solid var(--tv-negative)', color: 'var(--tv-negative)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <button className="btn btn-secondary btn-sm" onClick={applyNow} disabled={applying || rules.length === 0}>
                <i className={`ti ${applying ? 'ti-loader-2' : 'ti-wand'}`}></i> {applying ? 'Applying…' : 'Apply now'}
              </button>
              <button className="btn btn-primary btn-sm" onClick={startAdd}><i className="ti ti-plus"></i> Add rule</button>
            </div>
            {rules.length === 0 ? (
              <div className="empty-state"><i className="ti ti-filter-cog"></i><p>No rules yet. Add one (e.g. Merchant contains "AWS" → Software) to auto-categorize transactions.</p></div>
            ) : (
              <div className="table-scroll">
                <table className="tv-table">
                  <thead><tr><th>When</th><th>Category</th><th style={{ width: 70 }}></th></tr></thead>
                  <tbody>
                    {rules.map((r) => (
                      <tr key={r.id} style={{ opacity: r.active === false ? 0.5 : 1 }}>
                        <td>{fieldLabel(r.matchField)} {typeLabel(r.matchType)} <strong>“{r.matchValue}”</strong></td>
                        <td>{r.setCategory}</td>
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
                  <label className="form-label">Match on</label>
                  <select className="form-select" value={form.matchField} onChange={onField('matchField')}>
                    <option value="MERCHANT">Merchant</option>
                    <option value="DESCRIPTION">Description</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Condition</label>
                  <select className="form-select" value={form.matchType} onChange={onField('matchType')}>
                    <option value="CONTAINS">Contains</option>
                    <option value="EQUALS">Equals</option>
                    <option value="STARTS_WITH">Starts with</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Text to match *</label>
                <input className="form-input" value={form.matchValue} onChange={onField('matchValue')} placeholder="e.g. AWS" autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Set category to</label>
                <select className="form-select" value={form.setCategory} onChange={onField('setCategory')}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={form.active} onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))} /> Active
              </label>
            </div>
            <div className="expense-modal-foot" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMode('list')} disabled={saving}><i className="ti ti-arrow-left"></i> Back</button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving}><i className="ti ti-check"></i> {saving ? 'Saving…' : (editingId ? 'Save changes' : 'Add rule')}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
