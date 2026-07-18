import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../../api';
import { currency } from '../../utils/format';
import ExpenseFormDrawer from './ExpenseFormDrawer';
import TransactionLinkPicker from './TransactionLinkPicker';
import ExpenseExportModal from './ExpenseExportModal';

const STATUS_LABEL = {
  RECORDED: 'Recorded', NEEDS_RECEIPT: 'Needs receipt',
  APPROVED: 'Approved', REIMBURSED: 'Reimbursed',
};
const STATUS_TONE = {
  RECORDED: 'badge-gray', NEEDS_RECEIPT: 'badge-gold',
  APPROVED: 'badge-green', REIMBURSED: 'badge-green',
};

/**
 * Expense tracker for one business: KPIs, filters, the expense table, and the spend analytics
 * (moved here from the old "Credit Card & Expenses" tab, where they were mislabelled).
 *
 * The KPI strip deliberately separates STANDALONE from LINKED spend — linked expenses only
 * document transactions the ledger already counts, so adding them to the P&L would double-count.
 */
export default function ExpensesTab({
  businessId,
  businessName,
  businesses = [],
  transactions = [],       // the page's merged unifiedTx, for the link picker
  ledgerCategories = [],
  CategoryBars,            // reused from MyBusinessPage so the bars look identical
  onDocumentsChanged,
}) {
  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // filters
  const [search, setSearch] = useState('');
  const [fCategory, setFCategory] = useState('ALL');
  const [fVendor, setFVendor] = useState('ALL');
  const [fStatus, setFStatus] = useState('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // modals
  const [formFor, setFormFor] = useState(undefined); // undefined = closed, null = create, obj = edit
  const [linkFor, setLinkFor] = useState(null);
  const [linkSaving, setLinkSaving] = useState(false);
  const [showExport, setShowExport] = useState(false);

  const load = useCallback(async () => {
    if (!businessId) return;
    try {
      setLoading(true);
      setError('');
      const params = {};
      if (from) params.from = from;
      if (to) params.to = to;
      const [rows, sum] = await Promise.all([
        api.listBusinessExpenses(businessId, params),
        api.getBusinessExpenseSummary(businessId, params),
      ]);
      setExpenses(Array.isArray(rows) ? rows : []);
      setSummary(sum || null);
    } catch (err) {
      setError(err?.message || 'Failed to load expenses.');
    } finally {
      setLoading(false);
    }
  }, [businessId, from, to]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.getBusinessExpenseCategories()
      .then((c) => setCategories(Array.isArray(c) ? c : []))
      .catch(() => setCategories([]));
  }, []);

  const vendorOptions = useMemo(() => {
    const s = new Set();
    expenses.forEach((e) => e.vendor && s.add(e.vendor));
    return ['ALL', ...[...s].sort()];
  }, [expenses]);

  const categoryOptions = useMemo(() => {
    const s = new Set();
    expenses.forEach((e) => e.category && s.add(e.category));
    return ['ALL', ...[...s].sort()];
  }, [expenses]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return expenses.filter((e) => {
      if (fCategory !== 'ALL' && e.category !== fCategory) return false;
      if (fVendor !== 'ALL' && e.vendor !== fVendor) return false;
      if (fStatus !== 'ALL' && e.status !== fStatus) return false;
      if (q) {
        const hay = `${e.description || ''} ${e.vendor || ''} ${e.category || ''} ${e.notes || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [expenses, search, fCategory, fVendor, fStatus]);

  const visibleTotal = useMemo(
    () => visible.reduce((a, e) => a + Number(e.effectiveAmount || 0), 0),
    [visible]
  );

  const remove = async (e) => {
    if (!window.confirm('Delete this expense? This cannot be undone.')) return;
    try {
      await api.deleteBusinessExpense(e.id);
      await load();
    } catch (err) {
      setError(err?.message || 'Could not delete the expense.');
    }
  };

  const confirmLinks = async (links) => {
    try {
      setLinkSaving(true);
      await api.linkExpenseTransactions(linkFor.id, links);
      setLinkFor(null);
      await load();
    } catch (err) {
      setError(err?.message || 'Could not link transactions.');
    } finally {
      setLinkSaving(false);
    }
  };

  // Transactions already attached to the expense being linked — greyed out in the picker.
  const alreadyLinked = useMemo(() => {
    const s = new Set();
    (linkFor?.links || []).forEach((l) => s.add(`${l.txSource}:${l.txRef}`));
    return s;
  }, [linkFor]);

  const catBars = (summary?.byCategory || []).map((b) => ({ label: b.label, value: Number(b.total) }));
  const vendorBars = (summary?.byVendor || []).slice(0, 8).map((b) => ({ label: b.label, value: Number(b.total) }));

  return (
    <>
      {/* ---------- KPIs ---------- */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 16 }}>
        <div className="kpi-card">
          <div className="kpi-label">Total tracked</div>
          <div className="kpi-value">{currency(summary?.total || 0)}</div>
          <div className="item-sub">{summary?.count || 0} expense{summary?.count === 1 ? '' : 's'}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Standalone</div>
          <div className="kpi-value">{currency(summary?.standaloneTotal || 0)}</div>
          <div className="item-sub">New spend, not in the ledger</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Linked</div>
          <div className="kpi-value">{currency(summary?.linkedTotal || 0)}</div>
          <div className="item-sub">Documents existing transactions</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Missing receipts</div>
          <div className="kpi-value" style={{ color: (summary?.missingReceiptCount || 0) > 0 ? 'var(--tv-gold)' : undefined }}>
            {summary?.missingReceiptCount || 0}
          </div>
          <div className="item-sub">Chase before filing</div>
        </div>
      </div>

      {error && (
        <div className="card" style={{ borderLeft: '4px solid var(--tv-negative)', color: 'var(--tv-negative)', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* ---------- Expense list ---------- */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-header">
          <div className="section-title">
            <i className="ti ti-receipt-2" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>Expenses
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowExport(true)} disabled={expenses.length === 0}>
              <i className="ti ti-download"></i> Export
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setFormFor(null)}>
              <i className="ti ti-plus"></i> Add expense
            </button>
          </div>
        </div>

        <div className="filter-bar" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div className="filter-search">
            <i className="ti ti-search"></i>
            <input type="text" placeholder="Search description, vendor, category…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="form-select filter-select" value={fCategory} onChange={(e) => setFCategory(e.target.value)} title="Category">
            {categoryOptions.map((c) => <option key={c} value={c}>{c === 'ALL' ? 'All categories' : c}</option>)}
          </select>
          <select className="form-select filter-select" value={fVendor} onChange={(e) => setFVendor(e.target.value)} title="Vendor">
            {vendorOptions.map((v) => <option key={v} value={v}>{v === 'ALL' ? 'All vendors' : v}</option>)}
          </select>
          <select className="form-select filter-select" value={fStatus} onChange={(e) => setFStatus(e.target.value)} title="Status">
            <option value="ALL">All statuses</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input type="date" className="form-input filter-select" value={from} onChange={(e) => setFrom(e.target.value)} title="From" />
          <input type="date" className="form-input filter-select" value={to} onChange={(e) => setTo(e.target.value)} title="To" />
        </div>

        {loading && expenses.length === 0 ? (
          <div className="empty-state"><i className="ti ti-loader spin"></i><p>Loading expenses…</p></div>
        ) : visible.length === 0 ? (
          <div className="empty-state">
            <i className="ti ti-receipt-off"></i>
            <p>{expenses.length === 0 ? 'No expenses tracked for this business yet.' : 'No expenses match these filters.'}</p>
            {expenses.length === 0 && (
              <button className="btn btn-primary btn-sm" style={{ marginTop: 10 }} onClick={() => setFormFor(null)}>
                <i className="ti ti-plus"></i> Add the first expense
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="table-scroll" style={{ marginTop: 4 }}>
              <table className="tv-table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Category</th>
                    <th>Vendor</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Receipt</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th style={{ width: 80 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((e) => (
                    <tr key={e.id} className={!e.receiptDocumentId ? 'expense-row-flag' : ''}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{e.description || e.category}</div>
                        {e.sourceMode === 'LINKED' && (
                          <span className="badge badge-gray" title="Amount derived from linked transactions">
                            <i className="ti ti-link"></i> {e.linkCount} linked
                          </span>
                        )}
                      </td>
                      <td className="item-sub">{e.category}</td>
                      <td className="item-sub">{e.vendor || '—'}</td>
                      <td className="item-sub" style={{ whiteSpace: 'nowrap' }}>{e.expenseDate}</td>
                      <td><span className={`badge ${STATUS_TONE[e.status] || 'badge-gray'}`}>{STATUS_LABEL[e.status] || e.status}</span></td>
                      <td>
                        {e.receiptDocumentId
                          ? <span className="badge badge-green"><i className="ti ti-check"></i> Yes</span>
                          : <span className="badge badge-gold"><i className="ti ti-alert-triangle"></i> Missing</span>}
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600 }}>
                        {currency(e.effectiveAmount || 0)}
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="icon-btn" title="Link transactions" onClick={() => setLinkFor(e)}>
                          <i className="ti ti-link"></i>
                        </button>
                        <button className="icon-btn" title="Edit" onClick={() => setFormFor(e)}>
                          <i className="ti ti-pencil"></i>
                        </button>
                        <button className="icon-btn" title="Delete" onClick={() => remove(e)}>
                          <i className="ti ti-trash"></i>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divider" style={{ margin: '10px 0' }}></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span className="item-sub">Showing {visible.length} of {expenses.length}</span>
              <span><strong>{currency(visibleTotal)}</strong></span>
            </div>
          </>
        )}
      </div>

      {/* ---------- Analytics (moved here from the old Credit Card & Expenses tab) ---------- */}
      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="section-header">
            <div className="section-title"><i className="ti ti-chart-donut" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>Spend by category</div>
            <span className="badge badge-gray">Tracked expenses</span>
          </div>
          {catBars.length === 0
            ? <div className="empty-state"><i className="ti ti-chart-donut"></i><p>No spend recorded yet.</p></div>
            : CategoryBars ? <CategoryBars rows={catBars} /> : null}
        </div>
        <div className="card">
          <div className="section-header">
            <div className="section-title"><i className="ti ti-building-store" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>Top vendors</div>
            <span className="badge badge-gray">By spend</span>
          </div>
          {vendorBars.length === 0
            ? <div className="empty-state"><i className="ti ti-building-store"></i><p>No vendor spend recorded yet.</p></div>
            : CategoryBars ? <CategoryBars rows={vendorBars} /> : null}
        </div>
      </div>

      {/* ---------- Modals ---------- */}
      {formFor !== undefined && (
        <ExpenseFormDrawer
          businessId={businessId}
          expense={formFor}
          categorySuggestions={categories}
          ledgerCategories={ledgerCategories}
          onClose={() => setFormFor(undefined)}
          onSaved={async (saved) => {
            setFormFor(undefined);
            await load();
            if (saved && !saved.linkCount) setLinkFor(saved); // offer linking right after create
          }}
          onOpenLinkPicker={(e) => { setFormFor(undefined); setLinkFor(e); }}
        />
      )}

      {linkFor && (
        <TransactionLinkPicker
          transactions={transactions}
          alreadyLinked={alreadyLinked}
          saving={linkSaving}
          onConfirm={confirmLinks}
          onClose={() => setLinkFor(null)}
        />
      )}

      {showExport && (
        <ExpenseExportModal
          businessId={businessId}
          businessName={businessName}
          businesses={businesses}
          defaultFrom={from}
          defaultTo={to}
          onClose={() => setShowExport(false)}
          onSaved={onDocumentsChanged}
        />
      )}
    </>
  );
}
