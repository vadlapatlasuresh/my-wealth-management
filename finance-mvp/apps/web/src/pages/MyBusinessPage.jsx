import { useState, useEffect, useMemo, useCallback } from 'react';
import { currency } from '../utils/format';
import { api } from '../api';
import LastRefreshed from '../components/LastRefreshed';

/* ------------------------------------------------------------------ */
/* localStorage keys                                                   */
/* ------------------------------------------------------------------ */
const LS_BUSINESSES = 'tv_businesses';
const LS_SELECTED = 'tv_business_selected';
const accountsKey = (businessId) => `tv_business_accounts_${businessId}`;
const manualFiguresKey = (businessId) => `tv_business_figures_${businessId}`;

/* Entity types offered when adding a business. */
const ENTITY_TYPES = ['LLC', 'S-Corp', 'C-Corp', 'Sole Prop', 'Partnership'];

/* Account types offered when adding an account. */
const ACCOUNT_TYPES = ['CHECKING', 'SAVINGS', 'CREDIT_CARD', 'LOAN'];

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

/* Generate a reasonably-unique id without relying on crypto. */
function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/* Renders a date like "May 20, 2026" (business records use ISO date strings). */
function bizDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/* Map an invoice status to a badge variant. */
function statusBadge(status) {
  const s = (status || '').toUpperCase();
  if (s === 'PAID') return 'badge-green';
  if (s === 'OVERDUE') return 'badge-red';
  return 'badge-amber'; // OPEN / default
}

/* Safe JSON read from localStorage with a fallback. */
function readLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/* Safe JSON write to localStorage (failures are non-fatal). */
function writeLS(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

/* Human label for an account type. */
function accountTypeLabel(type) {
  switch ((type || '').toUpperCase()) {
    case 'CHECKING': return 'Checking';
    case 'SAVINGS': return 'Savings';
    case 'CREDIT_CARD': return 'Credit Card';
    case 'LOAN': return 'Loan';
    default: return type || '—';
  }
}

/* Badge variant for an account type. */
function accountTypeBadge(type) {
  switch ((type || '').toUpperCase()) {
    case 'CHECKING': return 'badge-forest';
    case 'SAVINGS': return 'badge-green';
    case 'CREDIT_CARD': return 'badge-amber';
    case 'LOAN': return 'badge-red';
    default: return 'badge-gray';
  }
}

/* Build a 6-month revenue series from REAL dashboard data only.
   When there's no real trend data we return a zeroed series (honest empty
   chart) rather than fabricating revenue numbers. */
function buildRevenueSeries(dashboard) {
  // If the API already returns a trend array, trust it.
  const apiSeries = dashboard?.revenueTrend || dashboard?.revenueSeries;
  if (Array.isArray(apiSeries) && apiSeries.length) {
    return apiSeries.slice(-6).map((p, i) => ({
      label: p.label || monthLabel(5 - i),
      value: Number(p.value ?? p.amount ?? 0),
    }));
  }

  // No real series → empty (zeroed) chart, no fabricated revenue.
  return [5, 4, 3, 2, 1, 0].map((monthsAgo) => ({
    label: monthLabel(monthsAgo),
    value: 0,
  }));
}

/* Short month label N months back from now (0 = current month). */
function monthLabel(monthsAgo) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - monthsAgo);
  return d.toLocaleDateString('en-US', { month: 'short' });
}

export default function MyBusinessPage({ user, formatDate }) {
  /* ---- API-backed state (existing behavior, preserved) ---- */
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const [connection, setConnection] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [expenses, setExpenses] = useState([]);

  /* ---- Local multi-business state (localStorage-backed) ----
   * Start empty; the user adds their own business or connects QuickBooks. */
  const [businesses, setBusinesses] = useState(() => {
    const stored = readLS(LS_BUSINESSES, null);
    return Array.isArray(stored) ? stored : [];
  });
  const [selectedId, setSelectedId] = useState(() => readLS(LS_SELECTED, null));

  /* Accounts + manual figures for the currently-selected business. */
  const [accounts, setAccounts] = useState([]);
  const [manualFigures, setManualFigures] = useState(null);

  /* ---- Inline-form UI state ---- */
  const [showAddBusiness, setShowAddBusiness] = useState(false);
  const [bizForm, setBizForm] = useState({ name: '', industry: '', entityType: 'LLC', ein: '' });

  const [showAddAccount, setShowAddAccount] = useState(false);
  const [acctForm, setAcctForm] = useState({ name: '', institution: '', type: 'CHECKING', balance: '' });

  /* The business object currently selected (falls back to first). */
  const selectedBusiness = useMemo(() => {
    if (!businesses.length) return null;
    return businesses.find((b) => b.id === selectedId) || businesses[0];
  }, [businesses, selectedId]);

  /* ------------------------------------------------------------------ */
  /* Data loading (unchanged contract)                                  */
  /* ------------------------------------------------------------------ */
  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    const [conn, dash, inv, exp] = await Promise.allSettled([
      api.getBusinessConnection(),
      api.getBusinessDashboard(),
      api.getBusinessInvoices(),
      api.getBusinessExpenses(),
    ]);

    if (conn.status === 'fulfilled') setConnection(conn.value || null);
    if (dash.status === 'fulfilled') setDashboard(dash.value || null);
    if (inv.status === 'fulfilled') setInvoices(Array.isArray(inv.value) ? inv.value : (inv.value?.items || []));
    if (exp.status === 'fulfilled') setExpenses(Array.isArray(exp.value) ? exp.value : (exp.value?.items || []));

    // Only surface an error if every request failed (transient failures are tolerated).
    const allFailed = [conn, dash, inv, exp].every((r) => r.status === 'rejected');
    if (allFailed) {
      setError(conn.reason?.message || 'Could not load business data. Please try again.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  /* Persist businesses whenever the list changes. */
  useEffect(() => {
    writeLS(LS_BUSINESSES, businesses);
  }, [businesses]);

  /* Ensure a valid selection exists, and persist it. */
  useEffect(() => {
    if (!businesses.length) return;
    const stillValid = businesses.some((b) => b.id === selectedId);
    if (!stillValid) {
      setSelectedId(businesses[0].id);
      return;
    }
    writeLS(LS_SELECTED, selectedId);
  }, [selectedId, businesses]);

  /* Load per-business accounts + manual figures when selection changes. */
  useEffect(() => {
    if (!selectedBusiness) {
      setAccounts([]);
      setManualFigures(null);
      return;
    }
    // Load accounts; start empty — the user adds real accounts themselves.
    let acc = readLS(accountsKey(selectedBusiness.id), null);
    if (!Array.isArray(acc)) {
      acc = [];
      writeLS(accountsKey(selectedBusiness.id), acc);
    }
    setAccounts(acc);

    // Manual KPI figures (used when not connected to QuickBooks).
    const figs = readLS(manualFiguresKey(selectedBusiness.id), {
      revenueMtd: 0,
      expensesMtd: 0,
      cashBalance: 0,
      outstandingInvoices: 0,
    });
    setManualFigures(figs);
  }, [selectedBusiness]);

  /* Persist accounts for the selected business. */
  const saveAccounts = useCallback((next) => {
    setAccounts(next);
    if (selectedBusiness) writeLS(accountsKey(selectedBusiness.id), next);
  }, [selectedBusiness]);

  /* ------------------------------------------------------------------ */
  /* API actions (existing behavior, preserved)                         */
  /* ------------------------------------------------------------------ */
  async function handleSync() {
    setSyncing(true);
    try {
      await api.syncBusiness();
      await loadAll();
    } catch (e) {
      setError(e?.message || 'Sync failed.');
    } finally {
      setSyncing(false);
    }
  }

  async function handleConnect() {
    setConnecting(true);
    try {
      await api.connectBusiness();
      await loadAll();
    } catch (e) {
      setError(e?.message || 'Could not connect QuickBooks.');
    } finally {
      setConnecting(false);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Business CRUD                                                       */
  /* ------------------------------------------------------------------ */
  function handleAddBusiness(e) {
    e.preventDefault();
    const name = bizForm.name.trim();
    if (!name) return;
    const next = {
      id: makeId(),
      name,
      industry: bizForm.industry.trim(),
      entityType: bizForm.entityType,
      ein: bizForm.ein.trim(),
      createdAt: new Date().toISOString(),
    };
    setBusinesses((prev) => [...prev, next]);
    setSelectedId(next.id);
    setBizForm({ name: '', industry: '', entityType: 'LLC', ein: '' });
    setShowAddBusiness(false);
  }

  function handleDeleteBusiness(id) {
    // Clean up the per-business stores too.
    try {
      localStorage.removeItem(accountsKey(id));
      localStorage.removeItem(manualFiguresKey(id));
    } catch { /* ignore */ }
    setBusinesses((prev) => prev.filter((b) => b.id !== id));
  }

  /* ------------------------------------------------------------------ */
  /* Account CRUD                                                        */
  /* ------------------------------------------------------------------ */
  function handleAddAccount(e) {
    e.preventDefault();
    const name = acctForm.name.trim();
    if (!name) return;
    const next = {
      id: makeId(),
      name,
      institution: acctForm.institution.trim(),
      type: acctForm.type,
      balance: Number(acctForm.balance) || 0,
      createdAt: new Date().toISOString(),
    };
    saveAccounts([...accounts, next]);
    setAcctForm({ name: '', institution: '', type: 'CHECKING', balance: '' });
    setShowAddAccount(false);
  }

  function handleDeleteAccount(id) {
    saveAccounts(accounts.filter((a) => a.id !== id));
  }

  /* ------------------------------------------------------------------ */
  /* Derived values                                                     */
  /* ------------------------------------------------------------------ */
  const connected = connection?.connected ?? dashboard?.connected ?? false;
  const companyName = connection?.companyName || dashboard?.companyName || 'Your Business';
  const changePct = Number(dashboard?.revenueChangePct ?? 0);

  // Whether to render the rich dashboard: connected OR a manual business selected.
  const hasContext = connected || !!selectedBusiness;

  // KPI figures: prefer live dashboard; otherwise fall back to manual figures/zeros.
  const kpi = connected
    ? {
        revenueMtd: dashboard?.revenueMtd,
        expensesMtd: dashboard?.expensesMtd,
        netProfitMtd: dashboard?.netProfitMtd,
        cashBalance: dashboard?.cashBalance,
        outstandingInvoices: dashboard?.outstandingInvoices,
      }
    : {
        revenueMtd: manualFigures?.revenueMtd ?? 0,
        expensesMtd: manualFigures?.expensesMtd ?? 0,
        netProfitMtd: (Number(manualFigures?.revenueMtd) || 0) - (Number(manualFigures?.expensesMtd) || 0),
        // When no manual cash figure exists, surface the sum of account balances.
        cashBalance: manualFigures?.cashBalance || accounts.reduce((s, a) => s + (Number(a.balance) || 0), 0),
        outstandingInvoices: manualFigures?.outstandingInvoices ?? 0,
      };

  // 6-month revenue series for the mini chart.
  const revenueSeries = useMemo(() => buildRevenueSeries(connected ? dashboard : null), [connected, dashboard]);
  const maxRevenue = Math.max(1, ...revenueSeries.map((p) => p.value));

  // Total across all accounts.
  const accountsTotal = useMemo(
    () => accounts.reduce((sum, a) => sum + (Number(a.balance) || 0), 0),
    [accounts]
  );

  // Activity feed: combine invoices, expenses, and account additions, newest first.
  const activity = useMemo(() => {
    const items = [];
    invoices.forEach((inv) => {
      items.push({
        id: `inv-${inv.id}`,
        kind: 'invoice',
        title: `Invoice — ${inv.customer || 'Customer'}`,
        sub: `${(inv.status || 'OPEN').toUpperCase()} · ${currency(inv.amount)}`,
        amount: Number(inv.amount) || 0,
        sign: 'pos',
        date: inv.dueDate || inv.date || inv.createdAt,
        icon: 'ti-file-invoice',
        tone: 'icon-blue',
      });
    });
    expenses.forEach((exp) => {
      items.push({
        id: `exp-${exp.id}`,
        kind: 'expense',
        title: `Expense — ${exp.vendor || 'Vendor'}`,
        sub: `${exp.category || 'Uncategorized'} · ${currency(exp.amount)}`,
        amount: Number(exp.amount) || 0,
        sign: 'neg',
        date: exp.date || exp.createdAt,
        icon: 'ti-receipt',
        tone: 'icon-amber',
      });
    });
    accounts.forEach((a) => {
      if (!a.createdAt) return;
      items.push({
        id: `acct-${a.id}`,
        kind: 'account',
        title: `Account added — ${a.name}`,
        sub: `${a.institution || accountTypeLabel(a.type)} · ${currency(a.balance)}`,
        amount: null,
        date: a.createdAt,
        icon: 'ti-building-bank',
        tone: 'icon-forest',
      });
    });
    return items
      .filter((it) => it.date)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 12);
  }, [invoices, expenses, accounts]);

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */
  return (
    <div id="page-mybusiness" className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">My Business</div>
          <div className="page-subtitle">
            {connected
              ? companyName
              : (selectedBusiness?.name || `Dashboard for ${user?.email ? user.email.split('@')[0] : 'Your'} Business`)}
            {connected && (
              <span className="badge badge-green" style={{ marginLeft: '8px' }}>
                <i className="ti ti-plug-connected"></i> Connected
              </span>
            )}
            {!loading && !connected && (
              <span className="badge badge-gray" style={{ marginLeft: '8px' }}>Not connected</span>
            )}
            {!connected && selectedBusiness?.entityType && (
              <span className="badge badge-gold" style={{ marginLeft: '8px' }}>{selectedBusiness.entityType}</span>
            )}
            {connected && connection?.lastSyncAt && (
              <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--tv-text-muted)' }}>
                Synced {formatDate ? formatDate(connection.lastSyncAt) : bizDate(connection.lastSyncAt)}
              </span>
            )}
          </div>
        </div>
        <div className="page-actions" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {(connected || selectedBusiness) && <LastRefreshed onRefresh={loadAll} />}
          {connected && (
            <button className="btn btn-secondary btn-sm" onClick={handleSync} disabled={syncing}>
              <i className={`ti ti-refresh ${syncing ? 'spin' : ''}`}></i> {syncing ? 'Syncing…' : 'Sync'}
            </button>
          )}
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Business switcher + add/manage                                   */}
      {/* ---------------------------------------------------------------- */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-header">
          <div className="section-title">
            <i className="ti ti-building-store" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>
            Businesses
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setShowAddBusiness((v) => !v)}
          >
            <i className={`ti ${showAddBusiness ? 'ti-x' : 'ti-plus'}`}></i>
            {showAddBusiness ? ' Cancel' : ' Add business'}
          </button>
        </div>

        {/* Segmented switcher across all businesses. */}
        {businesses.length > 0 && (
          <div className="seg-control" style={{ flexWrap: 'wrap', marginBottom: showAddBusiness ? 14 : 0 }}>
            {businesses.map((b) => (
              <button
                key={b.id}
                className={`seg-btn ${selectedBusiness?.id === b.id ? 'active' : ''}`}
                onClick={() => setSelectedId(b.id)}
                title={b.industry ? `${b.name} · ${b.industry}` : b.name}
              >
                <i className="ti ti-switch-horizontal" style={{ marginRight: 4 }}></i>
                {b.name}
              </button>
            ))}
          </div>
        )}

        {/* Inline "add business" form. */}
        {showAddBusiness && (
          <form onSubmit={handleAddBusiness} style={{ marginTop: 4 }}>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Business name *</label>
                <input
                  className="form-input"
                  value={bizForm.name}
                  onChange={(e) => setBizForm({ ...bizForm, name: e.target.value })}
                  placeholder="e.g. Acme Ventures LLC"
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">Industry</label>
                <input
                  className="form-input"
                  value={bizForm.industry}
                  onChange={(e) => setBizForm({ ...bizForm, industry: e.target.value })}
                  placeholder="e.g. Consulting"
                />
              </div>
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Entity type</label>
                <select
                  className="form-select"
                  value={bizForm.entityType}
                  onChange={(e) => setBizForm({ ...bizForm, entityType: e.target.value })}
                >
                  {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">EIN (optional)</label>
                <input
                  className="form-input"
                  value={bizForm.ein}
                  onChange={(e) => setBizForm({ ...bizForm, ein: e.target.value })}
                  placeholder="12-3456789"
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary btn-sm" disabled={!bizForm.name.trim()}>
                <i className="ti ti-plus"></i> Add business
              </button>
            </div>
          </form>
        )}

        {/* Selected business meta + delete (only for manually-added businesses). */}
        {selectedBusiness && !showAddBusiness && (
          <>
            <div className="divider" style={{ margin: '14px 0' }}></div>
            <div className="list-item" style={{ padding: 0 }}>
              <div className="item-icon icon-forest"><i className="ti ti-building-store"></i></div>
              <div className="item-main">
                <div className="item-name">{selectedBusiness.name}</div>
                <div className="item-sub">
                  {selectedBusiness.industry || 'No industry'} · {selectedBusiness.entityType}
                  {selectedBusiness.ein ? ` · EIN ${selectedBusiness.ein}` : ''}
                  {' · Added '}{bizDate(selectedBusiness.createdAt)}
                </div>
              </div>
              <div className="item-right">
                {businesses.length > 1 && (
                  <button
                    className="icon-btn"
                    title="Delete this business"
                    onClick={() => handleDeleteBusiness(selectedBusiness.id)}
                  >
                    <i className="ti ti-trash"></i>
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Error card */}
      {error && (
        <div className="card" style={{ borderColor: 'var(--tv-negative)' }}>
          <div className="list-item">
            <div className="item-icon icon-red"><i className="ti ti-alert-triangle"></i></div>
            <div className="item-main">
              <div className="item-name">Something went wrong</div>
              <div className="item-sub">{error}</div>
            </div>
            <div className="item-right">
              <button className="btn btn-secondary btn-sm" onClick={loadAll}>
                <i className="ti ti-refresh"></i> Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QuickBooks connect prompt — shown as ONE way to connect alongside manual businesses. */}
      {!loading && !connected && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="list-item" style={{ padding: 0 }}>
            <div className="item-icon icon-blue"><i className="ti ti-plug"></i></div>
            <div className="item-main">
              <div className="item-name">Connect QuickBooks</div>
              <div className="item-sub">
                Link QuickBooks to auto-sync revenue, expenses, invoices, and your cash position.
              </div>
            </div>
            <div className="item-right">
              <button className="btn btn-primary btn-sm" onClick={handleConnect} disabled={connecting}>
                <i className={`ti ${connecting ? 'ti-loader spin' : 'ti-plug'}`}></i>
                {connecting ? ' Connecting…' : ' Connect'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-loader spin"></i>
            <p>Loading business data…</p>
          </div>
        </div>
      ) : !hasContext ? (
        /* No connection and no business → empty state */
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-building-store"></i>
            <p style={{ fontWeight: 600, color: 'var(--tv-text-primary)', marginBottom: 4 }}>
              No business yet
            </p>
            <p style={{ marginBottom: 12 }}>
              Add a business above or connect QuickBooks to see your dashboard.
            </p>
            <button className="btn btn-primary" onClick={() => setShowAddBusiness(true)}>
              <i className="ti ti-plus"></i> Add a business
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* ------------------------------------------------------------ */}
          {/* KPI Row                                                       */}
          {/* ------------------------------------------------------------ */}
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-label">
                <i className="ti ti-arrow-up" style={{ fontSize: '13px', color: 'var(--tv-positive)' }}></i> Revenue (MTD)
              </div>
              <div className="kpi-value">{currency(kpi.revenueMtd)}</div>
              {connected ? (
                <div className={`kpi-delta ${changePct >= 0 ? 'pos' : 'neg'}`}>
                  <i className={changePct >= 0 ? 'ti ti-arrow-up-right' : 'ti ti-arrow-down-right'}></i>
                  {changePct >= 0 ? '+' : ''}{changePct.toFixed(1)}% vs last month
                </div>
              ) : (
                <div className="kpi-delta" style={{ color: 'var(--tv-text-muted)' }}>
                  Connect to track changes
                </div>
              )}
            </div>
            <div className="kpi-card">
              <div className="kpi-label">
                <i className="ti ti-arrow-down" style={{ fontSize: '13px', color: 'var(--tv-negative)' }}></i> Expenses (MTD)
              </div>
              <div className="kpi-value">{currency(kpi.expensesMtd)}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">
                <i className="ti ti-chart-line" style={{ fontSize: '13px', color: 'var(--tv-forest-light)' }}></i> Net Profit (MTD)
              </div>
              <div className="kpi-value">{currency(kpi.netProfitMtd)}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">
                <i className="ti ti-cash" style={{ fontSize: '13px', color: 'var(--tv-gold)' }}></i> Cash Balance
              </div>
              <div className="kpi-value">{currency(kpi.cashBalance)}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">
                <i className="ti ti-file-invoice" style={{ fontSize: '13px', color: 'var(--tv-forest-light)' }}></i> Outstanding Invoices
              </div>
              <div className="kpi-value">{currency(kpi.outstandingInvoices)}</div>
            </div>
          </div>

          {/* Hint when running on manual figures only. */}
          {!connected && (
            <div className="card" style={{ marginBottom: 16, background: 'var(--tv-sage-pale)' }}>
              <div className="list-item" style={{ padding: 0 }}>
                <div className="item-icon icon-amber"><i className="ti ti-info-circle"></i></div>
                <div className="item-main">
                  <div className="item-name">Showing manual figures</div>
                  <div className="item-sub">
                    Connect QuickBooks for live numbers, or add bank accounts below to populate your cash balance.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------ */}
          {/* Revenue trend mini-chart                                      */}
          {/* ------------------------------------------------------------ */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="section-header">
              <div className="section-title">
                <i className="ti ti-chart-bar" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>
                Revenue trend
              </div>
              <span className="badge badge-gray">Last 6 months</span>
            </div>
            <RevenueBarChart series={revenueSeries} max={maxRevenue} />
          </div>

          <div className="grid-2" style={{ marginBottom: '16px' }}>
            {/* -------------------------------------------------------- */}
            {/* Accounts                                                 */}
            {/* -------------------------------------------------------- */}
            <div className="card">
              <div className="section-header">
                <div className="section-title">
                  <i className="ti ti-building-bank" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>
                  Accounts
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowAddAccount((v) => !v)}
                >
                  <i className={`ti ${showAddAccount ? 'ti-x' : 'ti-plus'}`}></i>
                  {showAddAccount ? ' Cancel' : ' Add'}
                </button>
              </div>

              {/* Inline add-account form. */}
              {showAddAccount && (
                <form onSubmit={handleAddAccount} style={{ marginBottom: 14 }}>
                  <div className="grid-2">
                    <div className="form-group">
                      <label className="form-label">Account name *</label>
                      <input
                        className="form-input"
                        value={acctForm.name}
                        onChange={(e) => setAcctForm({ ...acctForm, name: e.target.value })}
                        placeholder="e.g. Operating Checking"
                        autoFocus
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Institution</label>
                      <input
                        className="form-input"
                        value={acctForm.institution}
                        onChange={(e) => setAcctForm({ ...acctForm, institution: e.target.value })}
                        placeholder="e.g. Chase"
                      />
                    </div>
                  </div>
                  <div className="grid-2">
                    <div className="form-group">
                      <label className="form-label">Type</label>
                      <select
                        className="form-select"
                        value={acctForm.type}
                        onChange={(e) => setAcctForm({ ...acctForm, type: e.target.value })}
                      >
                        {ACCOUNT_TYPES.map((t) => (
                          <option key={t} value={t}>{accountTypeLabel(t)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Balance</label>
                      <input
                        className="form-input"
                        type="number"
                        step="0.01"
                        value={acctForm.balance}
                        onChange={(e) => setAcctForm({ ...acctForm, balance: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={!acctForm.name.trim()}>
                    <i className="ti ti-plus"></i> Add account
                  </button>
                </form>
              )}

              {accounts.length === 0 ? (
                <div className="empty-state">
                  <i className="ti ti-building-bank"></i>
                  <p>No accounts yet. Add a bank or credit account.</p>
                </div>
              ) : (
                <div className="table-scroll">
                  <table className="tv-table">
                    <thead>
                      <tr>
                        <th>Account</th>
                        <th>Type</th>
                        <th style={{ textAlign: 'right' }}>Balance</th>
                        <th style={{ width: 40 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {accounts.map((a) => (
                        <tr key={a.id}>
                          <td style={{ fontWeight: 500 }}>
                            {a.name}
                            {a.institution && (
                              <div className="item-sub" style={{ fontWeight: 400 }}>{a.institution}</div>
                            )}
                          </td>
                          <td>
                            <span className={`badge ${accountTypeBadge(a.type)}`}>{accountTypeLabel(a.type)}</span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <span className="item-amount">{currency(a.balance)}</span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              className="icon-btn"
                              title="Delete account"
                              onClick={() => handleDeleteAccount(a.id)}
                            >
                              <i className="ti ti-trash"></i>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={2} style={{ fontWeight: 600 }}>Total</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>
                          <span className="item-amount">{currency(accountsTotal)}</span>
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* -------------------------------------------------------- */}
            {/* Activity timeline                                        */}
            {/* -------------------------------------------------------- */}
            <div className="card">
              <div className="section-header">
                <div className="section-title">
                  <i className="ti ti-refresh" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>
                  Activity
                </div>
              </div>
              {activity.length === 0 ? (
                <div className="empty-state">
                  <i className="ti ti-cash"></i>
                  <p>No recent activity yet.</p>
                </div>
              ) : (
                <div>
                  {activity.map((it) => (
                    <div key={it.id} className="list-item">
                      <div className={`item-icon ${it.tone}`}>
                        <i className={`ti ${it.icon}`}></i>
                      </div>
                      <div className="item-main">
                        <div className="item-name">{it.title}</div>
                        <div className="item-sub">{it.sub}</div>
                      </div>
                      <div className="item-right">
                        {it.amount != null && (
                          <div className={`item-amount ${it.sign === 'neg' ? 'amount-neg' : ''}`}>
                            {it.sign === 'neg' ? '-' : ''}{currency(it.amount)}
                          </div>
                        )}
                        <div className="item-sub" style={{ textAlign: 'right' }}>{bizDate(it.date)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ------------------------------------------------------------ */}
          {/* Invoices + Expenses (kept)                                    */}
          {/* ------------------------------------------------------------ */}
          <div className="grid-2" style={{ marginBottom: '16px' }}>
            {/* Invoices */}
            <div className="card">
              <div className="section-header">
                <div className="section-title">
                  <i className="ti ti-file-invoice" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>
                  Invoices
                </div>
              </div>
              {invoices.length === 0 ? (
                <div className="empty-state">
                  <i className="ti ti-file-invoice"></i>
                  <p>No invoices yet.</p>
                </div>
              ) : (
                <div className="table-scroll">
                  <table className="tv-table">
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th style={{ textAlign: 'right' }}>Amount</th>
                        <th>Status</th>
                        <th>Due date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((inv) => (
                        <tr key={inv.id}>
                          <td style={{ fontWeight: 500 }}>{inv.customer || '—'}</td>
                          <td style={{ textAlign: 'right' }}>
                            <span className="item-amount">{currency(inv.amount)}</span>
                          </td>
                          <td>
                            <span className={`badge ${statusBadge(inv.status)}`}>
                              {(inv.status || 'OPEN').toUpperCase()}
                            </span>
                          </td>
                          <td style={{ color: 'var(--tv-text-muted)' }}>{bizDate(inv.dueDate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Expenses */}
            <div className="card">
              <div className="section-header">
                <div className="section-title">
                  <i className="ti ti-receipt" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>
                  Expenses
                </div>
              </div>
              {expenses.length === 0 ? (
                <div className="empty-state">
                  <i className="ti ti-receipt"></i>
                  <p>No expenses yet.</p>
                </div>
              ) : (
                <div className="table-scroll">
                  <table className="tv-table">
                    <thead>
                      <tr>
                        <th>Vendor</th>
                        <th>Category</th>
                        <th>Date</th>
                        <th style={{ textAlign: 'right' }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenses.map((exp) => (
                        <tr key={exp.id}>
                          <td style={{ fontWeight: 500 }}>{exp.vendor || '—'}</td>
                          <td><span className="badge badge-gray">{exp.category || 'Uncategorized'}</span></td>
                          <td style={{ color: 'var(--tv-text-muted)' }}>{bizDate(exp.date)}</td>
                          <td style={{ textAlign: 'right' }}>
                            <span className="item-amount amount-neg">{currency(exp.amount)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Inline SVG bar chart for the 6-month revenue trend.                */
/* Pure presentational; no external chart dependency.                 */
/* ------------------------------------------------------------------ */
function RevenueBarChart({ series, max }) {
  const width = 560;
  const height = 160;
  const padBottom = 24; // room for month labels
  const padTop = 8;
  const usableH = height - padBottom - padTop;
  const slot = width / series.length;
  const barW = Math.min(48, slot * 0.55);

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Revenue over the last six months"
      >
        {series.map((p, i) => {
          const h = Math.max(2, (p.value / max) * usableH);
          const x = i * slot + (slot - barW) / 2;
          const y = padTop + (usableH - h);
          const isLast = i === series.length - 1;
          return (
            <g key={p.label}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={h}
                rx={6}
                fill={isLast ? 'var(--tv-forest)' : 'var(--tv-forest-light)'}
                opacity={isLast ? 1 : 0.75}
              />
              {/* Value label above each bar */}
              <text
                x={x + barW / 2}
                y={y - 4}
                textAnchor="middle"
                fontSize="10"
                fill="var(--tv-text-secondary)"
              >
                {compactMoney(p.value)}
              </text>
              {/* Month label below */}
              <text
                x={x + barW / 2}
                y={height - 6}
                textAnchor="middle"
                fontSize="11"
                fill="var(--tv-text-muted)"
              >
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* Compact money for chart labels: $42k, $1.2k, $500. */
function compactMoney(n) {
  const v = Number(n) || 0;
  if (v >= 1000) return `$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
  return `$${v}`;
}
