import React, { useState, useMemo } from 'react';
import { currency } from '../../utils/format';

/**
 * Browse / filter / multi-select existing ledger transactions and attach them to an expense.
 *
 * Reads the page's already-merged `unifiedTx` (Plaid-linked + manual), so the picker shows the
 * same rows the Transactions tab does. A selection is sent up as a link payload that carries a
 * SNAPSHOT of each transaction — the backend stores that snapshot so the expense stays
 * auditable even if the account is later unlinked.
 */
export default function TransactionLinkPicker({
  transactions = [],
  alreadyLinked = new Set(), // "SOURCE:ref" strings already attached to this expense
  onConfirm,
  onClose,
  saving = false,
}) {
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState('OUT'); // expenses are money-out by default
  const [fCategory, setFCategory] = useState('ALL');
  const [fAccount, setFAccount] = useState('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selected, setSelected] = useState(() => new Set());

  const refOf = (t) => {
    const source = t.source === 'Manual' ? 'MANUAL' : 'LINKED';
    const ref = t.source === 'Manual' ? String(t.rawId) : String(t.extId ?? t.rawId);
    return { source, ref, key: `${source}:${ref}` };
  };

  const categoryOptions = useMemo(() => {
    const s = new Set();
    transactions.forEach((t) => t.category && s.add(t.category));
    return ['ALL', ...[...s].sort()];
  }, [transactions]);

  const accountOptions = useMemo(() => {
    const m = new Map();
    transactions.forEach((t) => {
      const label = t.acct?.name || t.acctKey;
      if (label) m.set(t.acctKey, label);
    });
    return [['ALL', 'All accounts'], ...[...m.entries()]];
  }, [transactions]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const lo = from ? new Date(`${from}T00:00:00`) : null;
    const hi = to ? new Date(`${to}T23:59:59`) : null;
    return transactions
      .filter((t) => {
        if (direction === 'OUT' && !(t.amount < 0)) return false;
        if (direction === 'IN' && !(t.amount >= 0)) return false;
        if (fCategory !== 'ALL' && t.category !== fCategory) return false;
        if (fAccount !== 'ALL' && t.acctKey !== fAccount) return false;
        if (q) {
          const hay = `${t.name || ''} ${t.merchant || ''} ${t.category || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (lo || hi) {
          const d = t.date ? new Date(t.date) : null;
          if (!d || Number.isNaN(d.getTime())) return false;
          if (lo && d < lo) return false;
          if (hi && d > hi) return false;
        }
        return true;
      })
      .slice(0, 300); // keep the DOM sane; filters narrow it down
  }, [transactions, search, direction, fCategory, fAccount, from, to]);

  const toggle = (t) => {
    const { key } = refOf(t);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const selectedTotal = useMemo(() => {
    let sum = 0;
    transactions.forEach((t) => {
      const { key } = refOf(t);
      if (selected.has(key)) sum += Math.abs(Number(t.amount) || 0);
    });
    return sum;
  }, [selected, transactions]);

  const confirm = () => {
    const links = [];
    transactions.forEach((t) => {
      const { source, ref, key } = refOf(t);
      if (!selected.has(key)) return;
      links.push({
        txSource: source,
        txRef: ref,
        txDate: t.date || null,
        txAmount: Number(t.amount) || 0,
        txDescription: t.name || null,
        txMerchant: t.merchant || null,
        txAccount: t.acct?.name || t.acctKey || null,
      });
    });
    onConfirm?.(links);
  };

  return (
    <div className="expense-modal-overlay" role="dialog" aria-modal="true" aria-label="Link transactions"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="expense-modal expense-modal-wide" onMouseDown={(e) => e.stopPropagation()}>
        <div className="expense-modal-head">
          <div>
            <div className="section-title" style={{ marginBottom: 2 }}>
              <i className="ti ti-link" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>
              Link existing transactions
            </div>
            <div className="item-sub">Select one or more transactions to attach to this expense.</div>
          </div>
          <button className="icon-btn" onClick={onClose} title="Close"><i className="ti ti-x"></i></button>
        </div>

        <div className="expense-modal-body">
          <div className="filter-bar" style={{ flexWrap: 'wrap', gap: 10 }}>
            <div className="filter-search">
              <i className="ti ti-search"></i>
              <input type="text" placeholder="Search description, merchant, or category…"
                value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select className="form-select filter-select" value={fCategory} onChange={(e) => setFCategory(e.target.value)} title="Category">
              {categoryOptions.map((c) => <option key={c} value={c}>{c === 'ALL' ? 'All categories' : c}</option>)}
            </select>
            <select className="form-select filter-select" value={fAccount} onChange={(e) => setFAccount(e.target.value)} title="Account">
              {accountOptions.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
            <div className="seg-control">
              {['OUT', 'IN', 'ALL'].map((d) => (
                <button key={d} className={`seg-btn ${direction === d ? 'active' : ''}`} onClick={() => setDirection(d)}>
                  {d === 'ALL' ? 'All' : d === 'IN' ? 'Money in' : 'Money out'}
                </button>
              ))}
            </div>
            <input type="date" className="form-input filter-select" value={from} onChange={(e) => setFrom(e.target.value)} title="From" />
            <input type="date" className="form-input filter-select" value={to} onChange={(e) => setTo(e.target.value)} title="To" />
          </div>

          {rows.length === 0 ? (
            <div className="empty-state"><i className="ti ti-search-off"></i><p>No transactions match these filters.</p></div>
          ) : (
            <div className="table-scroll" style={{ marginTop: 10, maxHeight: 380 }}>
              <table className="tv-table">
                <thead>
                  <tr>
                    <th style={{ width: 38 }}></th>
                    <th>Description</th>
                    <th>Account</th>
                    <th>Category</th>
                    <th>Date</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => {
                    const { key } = refOf(t);
                    const linked = alreadyLinked.has(key);
                    const checked = selected.has(key);
                    return (
                      <tr key={t.key} className={linked ? 'expense-row-linked' : ''}
                        style={{ cursor: linked ? 'not-allowed' : 'pointer', opacity: linked ? 0.55 : 1 }}
                        onClick={() => !linked && toggle(t)}>
                        <td onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={checked} disabled={linked}
                            onChange={() => toggle(t)} aria-label={`Select ${t.name}`} />
                        </td>
                        <td>
                          <div style={{ fontWeight: 500 }}>{t.name}</div>
                          {t.merchant && t.merchant !== t.name && <div className="item-sub">{t.merchant}</div>}
                          {linked && <span className="badge badge-gray" style={{ marginTop: 3 }}>Already linked</span>}
                        </td>
                        <td className="item-sub">{t.acct?.name || t.acctKey || '—'}</td>
                        <td className="item-sub">{t.category || '—'}</td>
                        <td className="item-sub" style={{ whiteSpace: 'nowrap' }}>{t.date || '—'}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}
                          className={t.amount < 0 ? 'amount-neg' : 'amount-pos'}>
                          {currency(Math.abs(t.amount))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="expense-modal-foot">
          <div className="item-sub">
            {selected.size === 0
              ? 'Nothing selected yet'
              : <><strong>{selected.size}</strong> selected · <strong>{currency(selectedTotal)}</strong></>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={confirm} disabled={selected.size === 0 || saving}>
              <i className={`ti ${saving ? 'ti-loader spin' : 'ti-link'}`}></i>
              {saving ? 'Linking…' : `Link ${selected.size || ''} transaction${selected.size === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
