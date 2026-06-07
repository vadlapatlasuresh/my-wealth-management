import React, { useMemo, useState } from 'react';
import { currency, rangeStart } from '../utils/format';
import LastRefreshed from '../components/LastRefreshed';

const DATE_RANGES = ['All', '1D', '1W', '1M', '3M', '1Y', 'Custom'];

/* Renders a date like "May 20, 2026" (transactions use ISO date strings). */
function txDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/* Pick an icon + color for a transaction based on its category / sign. */
function txVisual(tx) {
  const cat = (tx.category || '').toLowerCase();
  if ((tx.amount || 0) >= 0) return { icon: 'ti ti-building-bank', cls: 'icon-green' };
  if (cat.includes('grocer') || cat.includes('food') || cat.includes('dining')) return { icon: 'ti ti-shopping-cart', cls: 'icon-amber' };
  if (cat.includes('rent') || cat.includes('hous') || cat.includes('mortgage')) return { icon: 'ti ti-home', cls: 'icon-forest' };
  if (cat.includes('transport') || cat.includes('travel') || cat.includes('uber') || cat.includes('gas')) return { icon: 'ti ti-car', cls: 'icon-blue' };
  if (cat.includes('subscription') || cat.includes('entertain')) return { icon: 'ti ti-device-tv', cls: 'icon-purple' };
  if (cat.includes('util') || cat.includes('bill')) return { icon: 'ti ti-bolt', cls: 'icon-amber' };
  return { icon: 'ti ti-shopping-bag', cls: 'icon-red' };
}

/* A clickable, sortable table header cell with a direction indicator. */
function SortableTh({ k, label, align, sortKey, sortDir, onSort }) {
  const active = sortKey === k;
  const icon = active ? (sortDir === 'asc' ? 'ti-arrow-up' : 'ti-arrow-down') : 'ti-arrows-sort';
  return (
    <th
      onClick={() => onSort(k)}
      style={{ cursor: 'pointer', userSelect: 'none', textAlign: align || 'left', whiteSpace: 'nowrap' }}
      title={`Sort by ${label}`}
      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {label}{' '}
      <i className={`ti ${icon}`} style={{ fontSize: 13, opacity: active ? 0.9 : 0.35, verticalAlign: 'middle' }}></i>
    </th>
  );
}

export default function TransactionsPage({ transactions = [], loadAll }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ALL');
  const [direction, setDirection] = useState('ALL'); // ALL | IN | OUT
  const [dateRange, setDateRange] = useState('All');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [minAmt, setMinAmt] = useState('');
  const [maxAmt, setMaxAmt] = useState('');
  const [sortKey, setSortKey] = useState('date'); // date | name | category | amount
  const [sortDir, setSortDir] = useState('desc'); // asc | desc

  // Click a column header to sort; clicking the active column flips direction.
  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // Sensible default direction per column (newest/biggest first; names A→Z).
      setSortDir(key === 'name' || key === 'category' ? 'asc' : 'desc');
    }
  }

  const categories = useMemo(() => {
    const set = new Set();
    transactions.forEach((t) => t.category && set.add(t.category));
    return ['ALL', ...Array.from(set).sort()];
  }, [transactions]);

  const hasActiveFilters =
    search || category !== 'ALL' || direction !== 'ALL' || dateRange !== 'All' || minAmt || maxAmt;

  function clearFilters() {
    setSearch(''); setCategory('ALL'); setDirection('ALL');
    setDateRange('All'); setCustomFrom(''); setCustomTo(''); setMinAmt(''); setMaxAmt('');
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Resolve the date window once.
    let from = null, to = null;
    if (dateRange === 'Custom') {
      from = customFrom ? new Date(customFrom + 'T00:00:00') : null;
      to = customTo ? new Date(customTo + 'T23:59:59') : null;
    } else if (dateRange !== 'All') {
      from = rangeStart(dateRange);
    }
    const lo = minAmt !== '' ? Math.abs(Number(minAmt)) : null;
    const hi = maxAmt !== '' ? Math.abs(Number(maxAmt)) : null;

    return transactions.filter((t) => {
      const name = (t.name || t.description || '').toLowerCase();
      if (q && !name.includes(q) && !(t.category || '').toLowerCase().includes(q)) return false;
      if (category !== 'ALL' && t.category !== category) return false;
      if (direction === 'IN' && (t.amount || 0) < 0) return false;
      if (direction === 'OUT' && (t.amount || 0) >= 0) return false;
      // Date window
      if (from || to) {
        const d = t.date ? new Date(t.date) : null;
        if (!d || Number.isNaN(d.getTime())) return false;
        if (from && d < from) return false;
        if (to && d > to) return false;
      }
      // Amount window (by magnitude)
      const mag = Math.abs(Number(t.amount) || 0);
      if (lo != null && mag < lo) return false;
      if (hi != null && mag > hi) return false;
      return true;
    });
  }, [transactions, search, category, direction, dateRange, customFrom, customTo, minAmt, maxAmt]);

  // Apply the active sort to the filtered rows (default: most recent first).
  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const val = (t) => {
      switch (sortKey) {
        case 'amount': return Number(t.amount) || 0;
        case 'name': return (t.name || t.description || '').toLowerCase();
        case 'category': return (t.category || '').toLowerCase();
        case 'date':
        default: return t.date ? new Date(t.date).getTime() : 0;
      }
    };
    return [...filtered].sort((a, b) => {
      const av = val(a), bv = val(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  /* Export the currently filtered transactions to a CSV download via Blob. */
  function exportCsv() {
    const header = ['Date', 'Description', 'Category', 'Amount'];
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = sorted.map((t) => [
      txDate(t.date),
      t.name || t.description || 'Transaction',
      t.category || 'Uncategorized',
      Number(t.amount) || 0,
    ].map(esc).join(','));
    const csv = [header.map(esc).join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transactions.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const totals = useMemo(() => {
    let moneyIn = 0;
    let moneyOut = 0;
    filtered.forEach((t) => {
      const amt = Number(t.amount) || 0;
      if (amt >= 0) moneyIn += amt;
      else moneyOut += amt;
    });
    return { moneyIn, moneyOut, net: moneyIn + moneyOut };
  }, [filtered]);

  return (
    <div id="page-transactions" className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">Transactions</div>
          <div className="page-subtitle">All activity across your linked accounts</div>
        </div>
        <div className="page-actions" style={{ alignItems: 'center' }}>
          <LastRefreshed onRefresh={loadAll} />
          <button className="btn btn-secondary btn-sm" title="Export the current view to CSV" onClick={exportCsv}>
            <i className="ti ti-download"></i> Export
          </button>
        </div>
      </div>

      {/* Summary for the current filtered view */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label"><i className="ti ti-arrow-down-left" style={{ color: 'var(--tv-positive)' }}></i> Money In</div>
          <div className="kpi-value">{currency(totals.moneyIn)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label"><i className="ti ti-arrow-up-right" style={{ color: 'var(--tv-negative)' }}></i> Money Out</div>
          <div className="kpi-value">{currency(Math.abs(totals.moneyOut))}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label"><i className="ti ti-equal" style={{ color: 'var(--tv-forest-light)' }}></i> Net</div>
          <div className="kpi-value">{currency(totals.net)}</div>
          <div className={`kpi-delta ${totals.net >= 0 ? 'pos' : 'neg'}`}>
            <i className="ti ti-list"></i> {filtered.length} transaction{filtered.length === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      <div className="card">
        {/* Filter bar */}
        <div className="filter-bar">
          <div className="filter-search">
            <i className="ti ti-search"></i>
            <input
              type="text"
              placeholder="Search by description or category…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className="form-select filter-select" value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => (
              <option key={c} value={c}>{c === 'ALL' ? 'All categories' : c}</option>
            ))}
          </select>
          <div className="seg-control">
            {['ALL', 'IN', 'OUT'].map((d) => (
              <button
                key={d}
                className={`seg-btn ${direction === d ? 'active' : ''}`}
                onClick={() => setDirection(d)}
              >
                {d === 'ALL' ? 'All' : d === 'IN' ? 'Income' : 'Spending'}
              </button>
            ))}
          </div>
        </div>

        {/* Second filter row: date range + amount range */}
        <div className="filter-bar" style={{ marginTop: 10, flexWrap: 'wrap', gap: 10 }}>
          <select className="form-select filter-select" value={dateRange} onChange={(e) => setDateRange(e.target.value)} title="Date range">
            {DATE_RANGES.map((r) => (
              <option key={r} value={r}>
                {r === 'All' ? 'All time' : r === 'Custom' ? 'Custom range…' : `Last ${r.replace('1D', '1 day').replace('1W', '1 week').replace('1M', '1 month').replace('3M', '3 months').replace('1Y', '1 year')}`}
              </option>
            ))}
          </select>
          {dateRange === 'Custom' && (
            <>
              <input type="date" className="form-input" style={{ width: 150 }} value={customFrom} max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)} title="From date" />
              <span style={{ color: 'var(--tv-text-muted)', alignSelf: 'center' }}>→</span>
              <input type="date" className="form-input" style={{ width: 150 }} value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)} title="To date" />
            </>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="number" className="form-input" style={{ width: 110 }} placeholder="Min $" value={minAmt} onChange={(e) => setMinAmt(e.target.value)} title="Minimum amount" />
            <span style={{ color: 'var(--tv-text-muted)' }}>–</span>
            <input type="number" className="form-input" style={{ width: 110 }} placeholder="Max $" value={maxAmt} onChange={(e) => setMaxAmt(e.target.value)} title="Maximum amount" />
          </div>
          {hasActiveFilters && (
            <button className="btn btn-secondary btn-sm" onClick={clearFilters} title="Clear all filters">
              <i className="ti ti-filter-off"></i> Clear
            </button>
          )}
        </div>

        {transactions.length === 0 ? (
          <div className="empty-state">
            <i className="ti ti-arrows-exchange-2"></i>
            <p style={{ fontWeight: 600, color: 'var(--tv-text-primary)', marginBottom: 4 }}>No transactions yet</p>
            <p>Link an account to see your activity here.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <i className="ti ti-filter-off"></i>
            <p>No transactions match your filters.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="tv-table">
              <thead>
                <tr>
                  <SortableTh k="name" label="Description" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh k="category" label="Category" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh k="date" label="Date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh k="amount" label="Amount" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((tx) => {
                  const v = txVisual(tx);
                  const amt = Number(tx.amount) || 0;
                  return (
                    <tr key={tx.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div className={`item-icon ${v.cls}`} style={{ width: 32, height: 32, fontSize: 15 }}>
                            <i className={v.icon}></i>
                          </div>
                          <span style={{ fontWeight: 500 }}>{tx.name || tx.description || 'Transaction'}</span>
                        </div>
                      </td>
                      <td><span className="badge badge-gray">{tx.category || 'Uncategorized'}</span></td>
                      <td style={{ color: 'var(--tv-text-muted)' }}>{txDate(tx.date)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <span className={`item-amount ${amt >= 0 ? 'amount-pos' : 'amount-neg'}`}>
                          {amt >= 0 ? '+' : ''}{currency(amt)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
