import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../api';
import { currency } from '../../utils/format';

const STATUSES = ['RECORDED', 'NEEDS_RECEIPT', 'APPROVED', 'REIMBURSED'];
const STATUS_LABEL = {
  RECORDED: 'Recorded', NEEDS_RECEIPT: 'Needs receipt',
  APPROVED: 'Approved', REIMBURSED: 'Reimbursed',
};
const PAYMENT_METHODS = ['Card', 'Bank transfer', 'Cash', 'Check', 'Other'];

const emptyForm = {
  expenseDate: new Date().toISOString().slice(0, 10),
  category: '',
  vendor: '',
  amount: '',
  description: '',
  paymentMethod: '',
  status: 'RECORDED',
  notes: '',
};

/**
 * Add / edit one expense. Handles both modes:
 *  - STANDALONE — the user types an amount (spend not in the ledger).
 *  - LINKED     — the amount is derived from attached transactions and the field is disabled,
 *                 which is what stops the tracker double-counting the P&L.
 */
export default function ExpenseFormDrawer({
  businessId,
  expense = null,            // null = create
  categorySuggestions = [],
  ledgerCategories = [],
  onSaved,
  onClose,
  onOpenLinkPicker,          // (savedExpense) => void
}) {
  const isEdit = !!expense;
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [receiptDocId, setReceiptDocId] = useState(null);
  const [receiptName, setReceiptName] = useState('');

  const isLinked = expense?.sourceMode === 'LINKED';

  useEffect(() => {
    if (expense) {
      setForm({
        expenseDate: expense.expenseDate || emptyForm.expenseDate,
        category: expense.category || '',
        vendor: expense.vendor || '',
        amount: expense.amount != null ? String(expense.amount) : '',
        description: expense.description || '',
        paymentMethod: expense.paymentMethod || '',
        status: expense.status || 'RECORDED',
        notes: expense.notes || '',
      });
      setReceiptDocId(expense.receiptDocumentId || null);
    } else {
      setForm(emptyForm);
      setReceiptDocId(null);
    }
    setReceiptName('');
    setError('');
  }, [expense]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Canonical suggestions first, then any category already used in this business's ledger —
  // keeps expenses aligned with existing budgets/analytics instead of inventing a parallel set.
  const allCategories = useMemo(() => {
    const s = new Set([...categorySuggestions, ...ledgerCategories.filter(Boolean)]);
    return [...s];
  }, [categorySuggestions, ledgerCategories]);

  const onField = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const uploadReceipt = async (file) => {
    if (!file) return;
    try {
      setUploading(true);
      setError('');
      const doc = await api.uploadBusinessDocument(businessId, file, {
        docType: 'RECEIPT',
        label: `Receipt — ${form.vendor || form.category || 'expense'}`,
        note: `Attached to a business expense on ${form.expenseDate}.`,
      });
      setReceiptDocId(doc?.id ?? null);
      setReceiptName(file.name);
    } catch (err) {
      setError(err?.message || 'Could not upload the receipt.');
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.category.trim()) return setError('Pick or type a category.');
    if (!form.expenseDate) return setError('Pick a date.');
    if (!isLinked && (form.amount === '' || Number(form.amount) < 0)) {
      return setError('Enter an amount (0 or more).');
    }
    const payload = {
      expenseDate: form.expenseDate,
      category: form.category.trim(),
      vendor: form.vendor.trim() || null,
      description: form.description.trim() || null,
      amount: isLinked ? null : Number(form.amount),
      sourceMode: isLinked ? 'LINKED' : 'STANDALONE',
      status: form.status,
      paymentMethod: form.paymentMethod || null,
      receiptDocumentId: receiptDocId,
      notes: form.notes.trim() || null,
    };
    try {
      setSaving(true);
      setError('');
      const saved = isEdit
        ? await api.updateBusinessExpense(expense.id, payload)
        : await api.createBusinessExpense(businessId, payload);
      onSaved?.(saved);
    } catch (err) {
      setError(err?.message || 'Could not save the expense.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="expense-modal-overlay" role="dialog" aria-modal="true"
      aria-label={isEdit ? 'Edit expense' : 'Add expense'}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="expense-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="expense-modal-head">
          <div>
            <div className="section-title" style={{ marginBottom: 2 }}>
              <i className={`ti ${isEdit ? 'ti-pencil' : 'ti-plus'}`} style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>
              {isEdit ? 'Edit expense' : 'Add expense'}
            </div>
            {isLinked && (
              <div className="item-sub">
                Linked to {expense.linkCount} transaction{expense.linkCount === 1 ? '' : 's'} — the amount is derived from them.
              </div>
            )}
          </div>
          <button className="icon-btn" onClick={onClose} title="Close"><i className="ti ti-x"></i></button>
        </div>

        <form onSubmit={submit}>
          <div className="expense-modal-body">
            {error && (
              <div className="card" style={{ borderLeft: '4px solid var(--tv-negative)', color: 'var(--tv-negative)', fontSize: 13, marginBottom: 12 }}>
                {error}
              </div>
            )}

            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Date</label>
                <input className="form-input" type="date" value={form.expenseDate} onChange={onField('expenseDate')} required />
              </div>
              <div className="form-group">
                <label className="form-label">Amount</label>
                <input className="form-input" type="number" step="0.01" min="0"
                  value={isLinked ? (expense.effectiveAmount ?? 0) : form.amount}
                  onChange={onField('amount')} disabled={isLinked}
                  placeholder="0.00" required={!isLinked} />
                {isLinked && <div className="item-sub" style={{ marginTop: 4 }}>Derived from linked transactions ({currency(expense.effectiveAmount || 0)})</div>}
              </div>
              <div className="form-group">
                <label className="form-label">Category</label>
                <input className="form-input" list="expense-category-options" value={form.category}
                  onChange={onField('category')} placeholder="Start typing…" required />
                <datalist id="expense-category-options">
                  {allCategories.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div className="form-group">
                <label className="form-label">Vendor</label>
                <input className="form-input" value={form.vendor} onChange={onField('vendor')} placeholder="e.g. AWS" />
              </div>
              <div className="form-group">
                <label className="form-label">Payment method</label>
                <select className="form-select" value={form.paymentMethod} onChange={onField('paymentMethod')}>
                  <option value="">—</option>
                  {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-select" value={form.status} onChange={onField('status')}>
                  {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Description</label>
              <input className="form-input" value={form.description} onChange={onField('description')} placeholder="What was this for?" />
            </div>

            <div className="form-group">
              <label className="form-label">Receipt</label>
              {receiptDocId ? (
                <div className="list-item" style={{ padding: '8px 0' }}>
                  <div className="item-icon icon-green"><i className="ti ti-receipt"></i></div>
                  <div className="item-main">
                    <div className="item-name">{receiptName || 'Receipt attached'}</div>
                    <div className="item-sub">Saved to this business's Documents</div>
                  </div>
                  <div className="item-right">
                    <button type="button" className="icon-btn" title="Remove receipt"
                      onClick={() => { setReceiptDocId(null); setReceiptName(''); }}>
                      <i className="ti ti-x"></i>
                    </button>
                  </div>
                </div>
              ) : (
                <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', display: 'inline-flex' }}>
                  <i className={`ti ${uploading ? 'ti-loader spin' : 'ti-upload'}`}></i>
                  {uploading ? 'Uploading…' : 'Upload receipt'}
                  <input type="file" hidden accept="image/*,.pdf" disabled={uploading}
                    onChange={(e) => uploadReceipt(e.target.files?.[0])} />
                </label>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Notes</label>
              <input className="form-input" value={form.notes} onChange={onField('notes')} placeholder="Optional" />
            </div>
          </div>

          <div className="expense-modal-foot">
            {isEdit && !isLinked && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenLinkPicker?.(expense)}>
                <i className="ti ti-link"></i> Link transactions
              </button>
            )}
            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                <i className={`ti ${saving ? 'ti-loader spin' : 'ti-check'}`}></i>
                {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add expense'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
