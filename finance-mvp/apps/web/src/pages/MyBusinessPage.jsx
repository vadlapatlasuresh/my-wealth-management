import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { currency } from '../utils/format';
import { api } from '../api';
import LastRefreshed from '../components/LastRefreshed';

/* ------------------------------------------------------------------ */
/* Local UI preference key (selection only; data is server-persisted)  */
/* ------------------------------------------------------------------ */
const LS_SELECTED = 'tv_business_selected';

/* Entity types offered when adding a business. */
const ENTITY_TYPES = ['LLC', 'S-Corp', 'C-Corp', 'Sole Prop', 'Partnership'];

/* Account types offered when adding an account. */
const ACCOUNT_TYPES = ['CHECKING', 'SAVINGS', 'CREDIT_CARD', 'LOAN'];

/* Common expense/charge categories for the transaction form. */
const TX_CATEGORIES = [
  'Payroll', 'Rent', 'Software & SaaS', 'Marketing', 'Utilities',
  'Insurance', 'Travel', 'Meals', 'Supplies', 'Taxes', 'Income', 'Other',
];

/* Inner tabs. */
const TABS = [
  { id: 'cards', label: 'Credit Card & Expenses', icon: 'ti-credit-card' },
  { id: 'tools', label: 'Business Tools', icon: 'ti-tools' },
];

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

/* Renders a date like "May 20, 2026" (business records use ISO date strings). */
function bizDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/* Today's date as an ISO yyyy-MM-dd string (for date inputs). */
function todayISO() {
  return new Date().toISOString().slice(0, 10);
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

/* Icon + tone (colored chip) for an account type — the visual language that
   distinguishes checking vs. savings vs. credit vs. loan across the page. */
function accountVisual(type) {
  switch ((type || '').toUpperCase()) {
    case 'CHECKING': return { icon: 'ti-building-bank', tone: 'icon-forest', accent: 'var(--tv-forest)' };
    case 'SAVINGS': return { icon: 'ti-pig-money', tone: 'icon-green', accent: 'var(--tv-positive)' };
    case 'CREDIT_CARD': return { icon: 'ti-credit-card', tone: 'icon-amber', accent: 'var(--tv-warning)' };
    case 'LOAN': return { icon: 'ti-file-dollar', tone: 'icon-red', accent: 'var(--tv-negative)' };
    default: return { icon: 'ti-wallet', tone: 'icon-blue', accent: 'var(--tv-forest-light)' };
  }
}

function isCreditCard(a) {
  return (a?.type || '').toUpperCase() === 'CREDIT_CARD';
}

/* Build a 6-month revenue series from REAL dashboard data only.
   When there's no real trend data we return a zeroed series (honest empty
   chart) rather than fabricating revenue numbers. */
function buildRevenueSeries(dashboard) {
  const apiSeries = dashboard?.revenueTrend || dashboard?.revenueSeries;
  if (Array.isArray(apiSeries) && apiSeries.length) {
    return apiSeries.slice(-6).map((p, i) => ({
      label: p.label || monthLabel(5 - i),
      value: Number(p.value ?? p.amount ?? 0),
    }));
  }
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
  /* ---- QuickBooks-backed state (existing behavior, preserved) ---- */
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const [connection, setConnection] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [qboInvoices, setQboInvoices] = useState([]);
  const [expenses, setExpenses] = useState([]);

  /* ---- Server-persisted multi-business state ---- */
  const [businesses, setBusinesses] = useState([]);
  const [selectedId, setSelectedId] = useState(() => readLS(LS_SELECTED, null));

  /* Per-business, server-persisted collections. */
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [manualInvoices, setManualInvoices] = useState([]);

  /* ---- UI state ---- */
  const [activeTab, setActiveTab] = useState('cards');
  const [txFilter, setTxFilter] = useState('ALL'); // 'ALL' | accountId

  const [showAddBusiness, setShowAddBusiness] = useState(false);
  const [bizForm, setBizForm] = useState({ name: '', industry: '', entityType: 'LLC', ein: '' });

  const [showAddAccount, setShowAddAccount] = useState(false);
  const [acctForm, setAcctForm] = useState({ name: '', institution: '', type: 'CHECKING', balance: '', creditLimit: '' });

  const [showAddTx, setShowAddTx] = useState(false);
  const [txForm, setTxForm] = useState({
    accountId: '', date: todayISO(), description: '', merchant: '', category: 'Software & SaaS', amount: '', direction: 'out',
  });

  const [showAddInvoice, setShowAddInvoice] = useState(false);
  const [invForm, setInvForm] = useState({ customer: '', amount: '', dueDate: '', status: 'OPEN' });

  const txSectionRef = useRef(null);

  /* The business object currently selected (falls back to first). */
  const selectedBusiness = useMemo(() => {
    if (!businesses.length) return null;
    return businesses.find((b) => b.id === selectedId) || businesses[0];
  }, [businesses, selectedId]);

  /* ------------------------------------------------------------------ */
  /* Data loading                                                       */
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
    if (inv.status === 'fulfilled') setQboInvoices(Array.isArray(inv.value) ? inv.value : (inv.value?.items || []));
    if (exp.status === 'fulfilled') setExpenses(Array.isArray(exp.value) ? exp.value : (exp.value?.items || []));

    const allFailed = [conn, dash, inv, exp].every((r) => r.status === 'rejected');
    if (allFailed) {
      setError(conn.reason?.message || 'Could not load business data. Please try again.');
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const loadBusinesses = useCallback(async () => {
    try {
      const list = await api.getManualBusinesses();
      setBusinesses(Array.isArray(list) ? list : []);
    } catch {
      /* leave empty; the API error is non-fatal for the QBO path */
    }
  }, []);

  useEffect(() => { loadBusinesses(); }, [loadBusinesses]);

  /* Keep the (UI-only) selection valid and persisted. */
  useEffect(() => {
    if (!businesses.length) return;
    const stillValid = businesses.some((b) => b.id === selectedId);
    if (!stillValid) {
      setSelectedId(businesses[0].id);
      return;
    }
    writeLS(LS_SELECTED, selectedId);
  }, [selectedId, businesses]);

  /* Load per-business accounts + transactions + invoices together. Reused by
     the header refresh and the Sync button so everything stays current. */
  const loadBusinessDetail = useCallback(async (businessId) => {
    if (!businessId) {
      setAccounts([]); setTransactions([]); setManualInvoices([]);
      return;
    }
    const [acc, tx, inv] = await Promise.allSettled([
      api.getBusinessAccounts(businessId),
      api.getBusinessTransactions(businessId),
      api.getManualInvoices(businessId),
    ]);
    setAccounts(acc.status === 'fulfilled' && Array.isArray(acc.value) ? acc.value : []);
    setTransactions(tx.status === 'fulfilled' && Array.isArray(tx.value) ? tx.value : []);
    setManualInvoices(inv.status === 'fulfilled' && Array.isArray(inv.value) ? inv.value : []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await loadBusinessDetail(selectedBusiness?.id);
    })();
    return () => { cancelled = true; };
  }, [selectedBusiness, loadBusinessDetail]);

  /* Full refresh: QuickBooks dashboard + the selected business's live data. */
  const refreshEverything = useCallback(async () => {
    await Promise.all([loadAll(), loadBusinessDetail(selectedBusiness?.id)]);
  }, [loadAll, loadBusinessDetail, selectedBusiness]);

  /* Reset the transaction filter if the selected account disappears. */
  useEffect(() => {
    if (txFilter === 'ALL') return;
    if (!accounts.some((a) => String(a.id) === String(txFilter))) setTxFilter('ALL');
  }, [accounts, txFilter]);

  /* ------------------------------------------------------------------ */
  /* API actions                                                        */
  /* ------------------------------------------------------------------ */
  async function handleSync() {
    setSyncing(true);
    try {
      await api.syncBusiness();
      await refreshEverything();
    } catch (e) {
      setError(e?.message || 'Sync failed.');
    } finally {
      setSyncing(false);
    }
  }

  async function handleConnect() {
    setConnecting(true);
    try {
      const res = await api.connectBusiness();
      if (res?.authorizeUrl) {
        window.location.href = res.authorizeUrl;
        return;
      }
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
  async function handleAddBusiness(e) {
    e.preventDefault();
    const name = bizForm.name.trim();
    if (!name) return;
    try {
      const created = await api.createManualBusiness({
        name,
        industry: bizForm.industry.trim(),
        entityType: bizForm.entityType,
        ein: bizForm.ein.trim(),
      });
      setBusinesses((prev) => [...prev, created]);
      setSelectedId(created.id);
      setBizForm({ name: '', industry: '', entityType: 'LLC', ein: '' });
      setShowAddBusiness(false);
    } catch (err) {
      setError(err?.message || 'Could not add business.');
    }
  }

  async function handleDeleteBusiness(id) {
    try {
      await api.deleteManualBusiness(id);
      setBusinesses((prev) => prev.filter((b) => b.id !== id));
    } catch (err) {
      setError(err?.message || 'Could not delete business.');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Account CRUD                                                        */
  /* ------------------------------------------------------------------ */
  async function handleAddAccount(e) {
    e.preventDefault();
    const name = acctForm.name.trim();
    if (!name || !selectedBusiness) return;
    try {
      const created = await api.createBusinessAccount(selectedBusiness.id, {
        name,
        institution: acctForm.institution.trim(),
        type: acctForm.type,
        balance: Number(acctForm.balance) || 0,
        creditLimit: acctForm.type === 'CREDIT_CARD' && acctForm.creditLimit !== ''
          ? Number(acctForm.creditLimit) || 0
          : null,
      });
      setAccounts((prev) => [...prev, created]);
      setAcctForm({ name: '', institution: '', type: 'CHECKING', balance: '', creditLimit: '' });
      setShowAddAccount(false);
    } catch (err) {
      setError(err?.message || 'Could not add account.');
    }
  }

  async function handleDeleteAccount(id) {
    try {
      await api.deleteBusinessAccount(id);
      setAccounts((prev) => prev.filter((a) => a.id !== id));
      setTransactions((prev) => prev.filter((t) => String(t.accountId) !== String(id)));
    } catch (err) {
      setError(err?.message || 'Could not delete account.');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Transaction CRUD                                                    */
  /* ------------------------------------------------------------------ */
  function openAddTx(accountId) {
    setActiveTab('cards');
    setTxForm((f) => ({
      ...f,
      accountId: accountId != null ? String(accountId) : (accounts[0] ? String(accounts[0].id) : ''),
      date: todayISO(),
    }));
    setShowAddTx(true);
    requestAnimationFrame(() => txSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  async function handleAddTx(e) {
    e.preventDefault();
    if (!selectedBusiness) return;
    const accountId = txForm.accountId || (accounts[0] && accounts[0].id);
    if (!accountId) { setError('Add a bank or credit account first.'); return; }
    const magnitude = Math.abs(Number(txForm.amount) || 0);
    if (!txForm.description.trim() || !magnitude) return;
    const signed = txForm.direction === 'in' ? magnitude : -magnitude;
    try {
      const created = await api.createBusinessTransaction(selectedBusiness.id, {
        accountId: Number(accountId),
        description: txForm.description.trim(),
        merchant: txForm.merchant.trim(),
        category: txForm.category,
        amount: signed,
        postedAt: txForm.date || todayISO(),
      });
      setTransactions((prev) => [created, ...prev]);
      setTxForm({ accountId: String(accountId), date: todayISO(), description: '', merchant: '', category: 'Software & SaaS', amount: '', direction: 'out' });
      setShowAddTx(false);
    } catch (err) {
      setError(err?.message || 'Could not add transaction.');
    }
  }

  async function handleDeleteTx(id) {
    try {
      await api.deleteBusinessTransaction(id);
      setTransactions((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err?.message || 'Could not delete transaction.');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Invoice CRUD                                                        */
  /* ------------------------------------------------------------------ */
  async function handleAddInvoice(e) {
    e.preventDefault();
    if (!selectedBusiness) return;
    const customer = invForm.customer.trim();
    const amount = Number(invForm.amount) || 0;
    if (!customer || !amount) return;
    try {
      const created = await api.createManualInvoice(selectedBusiness.id, {
        customer,
        amount,
        status: invForm.status,
        dueDate: invForm.dueDate || null,
      });
      setManualInvoices((prev) => [created, ...prev]);
      setInvForm({ customer: '', amount: '', dueDate: '', status: 'OPEN' });
      setShowAddInvoice(false);
    } catch (err) {
      setError(err?.message || 'Could not create invoice.');
    }
  }

  async function handleMarkInvoicePaid(id) {
    try {
      const updated = await api.updateManualInvoice(id, { status: 'PAID' });
      setManualInvoices((prev) => prev.map((i) => (i.id === id ? updated : i)));
    } catch (err) {
      setError(err?.message || 'Could not update invoice.');
    }
  }

  async function handleDeleteInvoice(id) {
    try {
      await api.deleteManualInvoice(id);
      setManualInvoices((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError(err?.message || 'Could not delete invoice.');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Derived values                                                     */
  /* ------------------------------------------------------------------ */
  const connected = connection?.connected ?? dashboard?.connected ?? false;
  const companyName = connection?.companyName || dashboard?.companyName || 'Your Business';
  const changePct = Number(dashboard?.revenueChangePct ?? 0);
  const hasContext = connected || !!selectedBusiness;

  /* Split accounts by role for the overview. */
  const bankAccounts = useMemo(() => accounts.filter((a) => !isCreditCard(a)), [accounts]);
  const creditCards = useMemo(() => accounts.filter((a) => isCreditCard(a)), [accounts]);

  /* Cash = sum of non-credit account balances. */
  const cashTotal = useMemo(
    () => bankAccounts.reduce((s, a) => s + (Number(a.balance) || 0), 0),
    [bankAccounts]
  );
  /* Credit owed = sum of credit-card balances. */
  const creditOwed = useMemo(
    () => creditCards.reduce((s, a) => s + (Number(a.balance) || 0), 0),
    [creditCards]
  );

  /* Unified merged invoices (manual first, then QuickBooks read-only). */
  const allInvoices = useMemo(() => {
    const m = manualInvoices.map((i) => ({
      key: `m-${i.id}`, id: i.id, manual: true,
      customer: i.customer, amount: Number(i.amount) || 0,
      status: (i.status || 'OPEN').toUpperCase(), dueDate: i.dueDate,
    }));
    const q = qboInvoices.map((i) => ({
      key: `q-${i.id}`, id: i.id, manual: false,
      customer: i.customer, amount: Number(i.amount) || 0,
      status: (i.status || 'OPEN').toUpperCase(), dueDate: i.dueDate,
    }));
    return [...m, ...q];
  }, [manualInvoices, qboInvoices]);

  const pendingInvoices = useMemo(
    () => allInvoices.filter((i) => i.status !== 'PAID'),
    [allInvoices]
  );
  const pendingTotal = useMemo(
    () => pendingInvoices.reduce((s, i) => s + i.amount, 0),
    [pendingInvoices]
  );

  /* Manual KPI figures live on the business record (used when not connected). */
  const manualFigures = useMemo(() => ({
    revenueMtd: Number(selectedBusiness?.revenueMtd) || 0,
    expensesMtd: Number(selectedBusiness?.expensesMtd) || 0,
    outstandingInvoices: Number(selectedBusiness?.outstandingInvoices) || 0,
  }), [selectedBusiness]);

  const kpi = connected
    ? {
        revenueMtd: dashboard?.revenueMtd,
        expensesMtd: dashboard?.expensesMtd,
        netProfitMtd: dashboard?.netProfitMtd,
        cashBalance: dashboard?.cashBalance,
        outstandingInvoices: dashboard?.outstandingInvoices,
      }
    : {
        revenueMtd: manualFigures.revenueMtd,
        expensesMtd: manualFigures.expensesMtd,
        netProfitMtd: manualFigures.revenueMtd - manualFigures.expensesMtd,
        cashBalance: cashTotal,
        outstandingInvoices: pendingTotal || manualFigures.outstandingInvoices,
      };

  const revenueSeries = useMemo(() => buildRevenueSeries(connected ? dashboard : null), [connected, dashboard]);
  const maxRevenue = Math.max(1, ...revenueSeries.map((p) => p.value));

  /* Account lookup for rendering transaction rows. */
  const accountById = useMemo(() => {
    const m = new Map();
    accounts.forEach((a) => m.set(String(a.id), a));
    return m;
  }, [accounts]);

  /* Transactions honoring the account filter, newest first (already sorted server-side). */
  const filteredTx = useMemo(() => {
    if (txFilter === 'ALL') return transactions;
    return transactions.filter((t) => String(t.accountId) === String(txFilter));
  }, [transactions, txFilter]);

  /* Spending-by-category from money-out transactions (charges/expenses). */
  const spendingByCategory = useMemo(() => {
    const totals = new Map();
    transactions.forEach((t) => {
      const amt = Number(t.amount) || 0;
      if (amt >= 0) return; // only outflows
      const cat = t.category || 'Uncategorized';
      totals.set(cat, (totals.get(cat) || 0) + Math.abs(amt));
    });
    const rows = [...totals.entries()].map(([label, value]) => ({ label, value }));
    rows.sort((a, b) => b.value - a.value);
    return rows.slice(0, 6);
  }, [transactions]);

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
          {(connected || selectedBusiness) && <LastRefreshed onRefresh={refreshEverything} />}
          {(connected || selectedBusiness) && (
            <button className="btn btn-secondary btn-sm" onClick={handleSync} disabled={syncing}>
              <i className={`ti ti-refresh ${syncing ? 'spin' : ''}`}></i> {syncing ? 'Syncing…' : 'Sync'}
            </button>
          )}
        </div>
      </div>

      {/* Business switcher + add/manage */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-header">
          <div className="section-title">
            <i className="ti ti-building-store" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>
            Businesses
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowAddBusiness((v) => !v)}>
            <i className={`ti ${showAddBusiness ? 'ti-x' : 'ti-plus'}`}></i>
            {showAddBusiness ? ' Cancel' : ' Add business'}
          </button>
        </div>

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

        {showAddBusiness && (
          <form onSubmit={handleAddBusiness} style={{ marginTop: 4 }}>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Business name *</label>
                <input className="form-input" value={bizForm.name}
                  onChange={(e) => setBizForm({ ...bizForm, name: e.target.value })}
                  placeholder="e.g. Acme Ventures LLC" autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Industry</label>
                <input className="form-input" value={bizForm.industry}
                  onChange={(e) => setBizForm({ ...bizForm, industry: e.target.value })}
                  placeholder="e.g. Consulting" />
              </div>
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Entity type</label>
                <select className="form-select" value={bizForm.entityType}
                  onChange={(e) => setBizForm({ ...bizForm, entityType: e.target.value })}>
                  {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">EIN (optional)</label>
                <input className="form-input" value={bizForm.ein}
                  onChange={(e) => setBizForm({ ...bizForm, ein: e.target.value })}
                  placeholder="12-3456789" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary btn-sm" disabled={!bizForm.name.trim()}>
                <i className="ti ti-plus"></i> Add business
              </button>
            </div>
          </form>
        )}

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
                  <button className="icon-btn" title="Delete this business"
                    onClick={() => handleDeleteBusiness(selectedBusiness.id)}>
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
              <button className="btn btn-secondary btn-sm" onClick={refreshEverything}>
                <i className="ti ti-refresh"></i> Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QuickBooks connect prompt */}
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

      {loading ? (
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-loader spin"></i>
            <p>Loading business data…</p>
          </div>
        </div>
      ) : !hasContext ? (
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-building-store"></i>
            <p style={{ fontWeight: 600, color: 'var(--tv-text-primary)', marginBottom: 4 }}>No business yet</p>
            <p style={{ marginBottom: 12 }}>Add a business above or connect QuickBooks to see your dashboard.</p>
            <button className="btn btn-primary" onClick={() => setShowAddBusiness(true)}>
              <i className="ti ti-plus"></i> Add a business
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* KPI Row */}
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
                <div className="kpi-delta" style={{ color: 'var(--tv-text-muted)' }}>Connect to track changes</div>
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

          {!connected && (
            <div className="card" style={{ marginBottom: 16, background: 'var(--tv-sage-pale)' }}>
              <div className="list-item" style={{ padding: 0 }}>
                <div className="item-icon icon-amber"><i className="ti ti-info-circle"></i></div>
                <div className="item-main">
                  <div className="item-name">Showing your entered data</div>
                  <div className="item-sub">
                    Cash and outstanding totals are computed from the accounts and invoices below.
                    Connect QuickBooks for live revenue &amp; expense figures.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Accounts overview — the live "main view" across account types */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="section-header">
              <div className="section-title">
                <i className="ti ti-building-bank" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>
                Accounts
                <span className="badge badge-gray" style={{ marginLeft: 8 }}>
                  {currency(cashTotal)} cash
                  {creditCards.length > 0 ? ` · ${currency(creditOwed)} owed` : ''}
                </span>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowAddAccount((v) => !v)}>
                <i className={`ti ${showAddAccount ? 'ti-x' : 'ti-plus'}`}></i>
                {showAddAccount ? ' Cancel' : ' Add account'}
              </button>
            </div>

            {showAddAccount && (
              <form onSubmit={handleAddAccount} style={{ marginBottom: 16 }}>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Account name *</label>
                    <input className="form-input" value={acctForm.name}
                      onChange={(e) => setAcctForm({ ...acctForm, name: e.target.value })}
                      placeholder="e.g. Operating Checking" autoFocus />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Institution</label>
                    <input className="form-input" value={acctForm.institution}
                      onChange={(e) => setAcctForm({ ...acctForm, institution: e.target.value })}
                      placeholder="e.g. Chase" />
                  </div>
                </div>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Type</label>
                    <select className="form-select" value={acctForm.type}
                      onChange={(e) => setAcctForm({ ...acctForm, type: e.target.value })}>
                      {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{accountTypeLabel(t)}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">{acctForm.type === 'CREDIT_CARD' ? 'Current balance owed' : 'Balance'}</label>
                    <input className="form-input" type="number" step="0.01" value={acctForm.balance}
                      onChange={(e) => setAcctForm({ ...acctForm, balance: e.target.value })}
                      placeholder="0.00" />
                  </div>
                </div>
                {acctForm.type === 'CREDIT_CARD' && (
                  <div className="grid-2">
                    <div className="form-group">
                      <label className="form-label">Credit limit</label>
                      <input className="form-input" type="number" step="0.01" value={acctForm.creditLimit}
                        onChange={(e) => setAcctForm({ ...acctForm, creditLimit: e.target.value })}
                        placeholder="e.g. 25000" />
                    </div>
                  </div>
                )}
                <button type="submit" className="btn btn-primary btn-sm" disabled={!acctForm.name.trim()}>
                  <i className="ti ti-plus"></i> Add account
                </button>
              </form>
            )}

            {accounts.length === 0 ? (
              <div className="empty-state">
                <i className="ti ti-building-bank"></i>
                <p>No accounts yet. Add a checking, savings, or credit card account.</p>
              </div>
            ) : (
              <div className="card-grid">
                {accounts.map((a) => (
                  <AccountCard
                    key={a.id}
                    account={a}
                    active={String(txFilter) === String(a.id)}
                    onView={() => { setTxFilter(String(a.id)); setActiveTab('cards');
                      requestAnimationFrame(() => txSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }}
                    onAddTx={() => openAddTx(a.id)}
                    onDelete={() => handleDeleteAccount(a.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Inner tabs */}
          <div className="tabs">
            {TABS.map((t) => (
              <div key={t.id} className={`tab ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>
                <i className={`ti ${t.icon}`} style={{ marginRight: 6 }}></i>{t.label}
              </div>
            ))}
          </div>

          {/* ============================================================ */}
          {/* TAB 1 — Credit Card & Expenses                               */}
          {/* ============================================================ */}
          {activeTab === 'cards' && (
            <>
              {/* Credit card focus + spending categories */}
              <div className="grid-2" style={{ marginBottom: 16 }}>
                <div className="card">
                  <div className="section-header">
                    <div className="section-title">
                      <i className="ti ti-credit-card" style={{ marginRight: 6, color: 'var(--tv-warning)' }}></i>
                      Credit cards
                    </div>
                  </div>
                  {creditCards.length === 0 ? (
                    <div className="empty-state">
                      <i className="ti ti-credit-card"></i>
                      <p>No credit card yet. Add one above to track balance, limit &amp; charges.</p>
                    </div>
                  ) : (
                    creditCards.map((c) => <CreditCardPanel key={c.id} card={c}
                      onViewCharges={() => { setTxFilter(String(c.id)); requestAnimationFrame(() => txSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }} />)
                  )}
                </div>

                <div className="card">
                  <div className="section-header">
                    <div className="section-title">
                      <i className="ti ti-chart-donut" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>
                      Spending by category
                    </div>
                    <span className="badge badge-gray">From transactions</span>
                  </div>
                  {spendingByCategory.length === 0 ? (
                    <div className="empty-state">
                      <i className="ti ti-chart-donut"></i>
                      <p>No spend recorded yet. Add transactions to see category breakdowns.</p>
                    </div>
                  ) : (
                    <CategoryBars rows={spendingByCategory} />
                  )}
                </div>
              </div>

              {/* Transactions — filterable, unified or per account */}
              <div className="card" style={{ marginBottom: 16 }} ref={txSectionRef}>
                <div className="section-header">
                  <div className="section-title">
                    <i className="ti ti-arrows-exchange" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>
                    Transactions
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={() => (showAddTx ? setShowAddTx(false) : openAddTx(txFilter !== 'ALL' ? txFilter : null))}
                    disabled={accounts.length === 0}>
                    <i className={`ti ${showAddTx ? 'ti-x' : 'ti-plus'}`}></i>
                    {showAddTx ? ' Cancel' : ' Add transaction'}
                  </button>
                </div>

                {/* Account filter */}
                <div className="seg-control" style={{ flexWrap: 'wrap', marginBottom: 14 }}>
                  <button className={`seg-btn ${txFilter === 'ALL' ? 'active' : ''}`} onClick={() => setTxFilter('ALL')}>
                    <i className="ti ti-layout-grid" style={{ marginRight: 4 }}></i>All accounts
                  </button>
                  {accounts.map((a) => {
                    const v = accountVisual(a.type);
                    return (
                      <button key={a.id} className={`seg-btn ${String(txFilter) === String(a.id) ? 'active' : ''}`}
                        onClick={() => setTxFilter(String(a.id))} title={accountTypeLabel(a.type)}>
                        <i className={`ti ${v.icon}`} style={{ marginRight: 4 }}></i>{a.name}
                      </button>
                    );
                  })}
                </div>

                {/* Add transaction form */}
                {showAddTx && (
                  <form onSubmit={handleAddTx} style={{ marginBottom: 14 }}>
                    <div className="grid-2">
                      <div className="form-group">
                        <label className="form-label">Account *</label>
                        <select className="form-select" value={txForm.accountId}
                          onChange={(e) => setTxForm({ ...txForm, accountId: e.target.value })}>
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>{a.name} · {accountTypeLabel(a.type)}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Date</label>
                        <input className="form-input" type="date" value={txForm.date}
                          onChange={(e) => setTxForm({ ...txForm, date: e.target.value })} />
                      </div>
                    </div>
                    <div className="grid-2">
                      <div className="form-group">
                        <label className="form-label">Description *</label>
                        <input className="form-input" value={txForm.description}
                          onChange={(e) => setTxForm({ ...txForm, description: e.target.value })}
                          placeholder="e.g. AWS invoice" autoFocus />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Merchant</label>
                        <input className="form-input" value={txForm.merchant}
                          onChange={(e) => setTxForm({ ...txForm, merchant: e.target.value })}
                          placeholder="e.g. Amazon Web Services" />
                      </div>
                    </div>
                    <div className="grid-3">
                      <div className="form-group">
                        <label className="form-label">Category</label>
                        <select className="form-select" value={txForm.category}
                          onChange={(e) => setTxForm({ ...txForm, category: e.target.value })}>
                          {TX_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Direction</label>
                        <select className="form-select" value={txForm.direction}
                          onChange={(e) => setTxForm({ ...txForm, direction: e.target.value })}>
                          <option value="out">Money out (charge / expense)</option>
                          <option value="in">Money in (deposit / payment)</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Amount *</label>
                        <input className="form-input" type="number" step="0.01" min="0" value={txForm.amount}
                          onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })}
                          placeholder="0.00" />
                      </div>
                    </div>
                    <button type="submit" className="btn btn-primary btn-sm"
                      disabled={!txForm.description.trim() || !(Number(txForm.amount) > 0)}>
                      <i className="ti ti-plus"></i> Add transaction
                    </button>
                  </form>
                )}

                {filteredTx.length === 0 ? (
                  <div className="empty-state">
                    <i className="ti ti-arrows-exchange"></i>
                    <p>{transactions.length === 0
                      ? 'No transactions yet. Add one to start tracking activity.'
                      : 'No transactions for this account.'}</p>
                  </div>
                ) : (
                  <div className="table-scroll">
                    <table className="tv-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Description</th>
                          <th>Account</th>
                          <th>Category</th>
                          <th style={{ textAlign: 'right' }}>Amount</th>
                          <th style={{ width: 40 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTx.map((t) => {
                          const acc = accountById.get(String(t.accountId));
                          const v = accountVisual(acc?.type);
                          const amt = Number(t.amount) || 0;
                          const out = amt < 0;
                          return (
                            <tr key={t.id}>
                              <td style={{ color: 'var(--tv-text-muted)', whiteSpace: 'nowrap' }}>{bizDate(t.postedAt)}</td>
                              <td style={{ fontWeight: 500 }}>
                                {t.description}
                                {t.merchant && <div className="item-sub" style={{ fontWeight: 400 }}>{t.merchant}</div>}
                              </td>
                              <td>
                                <span className="badge badge-gray" title={accountTypeLabel(acc?.type)}>
                                  <i className={`ti ${v.icon}`}></i> {acc?.name || '—'}
                                </span>
                              </td>
                              <td>{t.category ? <span className="badge badge-forest">{t.category}</span> : <span style={{ color: 'var(--tv-text-muted)' }}>—</span>}</td>
                              <td style={{ textAlign: 'right' }}>
                                <span className={`item-amount ${out ? 'amount-neg' : 'amount-pos'}`}>
                                  {out ? '-' : '+'}{currency(Math.abs(amt))}
                                </span>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <button className="icon-btn" title="Delete transaction" onClick={() => handleDeleteTx(t.id)}>
                                  <i className="ti ti-trash"></i>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* QuickBooks expenses (read-only, kept) */}
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="section-header">
                  <div className="section-title">
                    <i className="ti ti-receipt" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>
                    Expenses {connected && <span className="badge badge-green" style={{ marginLeft: 6 }}>QuickBooks</span>}
                  </div>
                </div>
                {expenses.length === 0 ? (
                  <div className="empty-state">
                    <i className="ti ti-receipt"></i>
                    <p>No synced expenses. Connect QuickBooks to pull expense bills automatically.</p>
                  </div>
                ) : (
                  <div className="table-scroll">
                    <table className="tv-table">
                      <thead>
                        <tr>
                          <th>Vendor</th><th>Category</th><th>Date</th><th style={{ textAlign: 'right' }}>Amount</th>
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
            </>
          )}

          {/* ============================================================ */}
          {/* TAB 2 — Business Tools                                        */}
          {/* ============================================================ */}
          {activeTab === 'tools' && (
            <>
              {/* Quick actions */}
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="section-header">
                  <div className="section-title">
                    <i className="ti ti-bolt" style={{ marginRight: 6, color: 'var(--tv-gold)' }}></i>
                    Quick actions
                  </div>
                </div>
                <div className="card-grid">
                  <QuickAction icon="ti-file-invoice" tone="icon-blue" label="Create invoice"
                    desc="Bill a customer" onClick={() => setShowAddInvoice(true)} />
                  <QuickAction icon="ti-cash-register" tone="icon-green" label="Record payment"
                    desc="Mark an invoice paid" onClick={() => document.getElementById('mb-invoices')?.scrollIntoView({ behavior: 'smooth' })} />
                  <QuickAction icon="ti-arrows-exchange" tone="icon-forest" label="Add transaction"
                    desc="Log a charge or deposit" onClick={() => openAddTx(null)} />
                  <QuickAction icon="ti-building-bank" tone="icon-forest" label="Add account"
                    desc="Bank or credit card" onClick={() => { setActiveTab('cards'); setShowAddAccount(true); }} />
                  <QuickAction icon="ti-plug" tone="icon-amber" label={connected ? 'QuickBooks synced' : 'Connect QuickBooks'}
                    desc={connected ? 'Auto-sync on' : 'Auto-sync your books'} onClick={connected ? handleSync : handleConnect} />
                  <QuickAction icon="ti-report-analytics" tone="icon-purple" label="Revenue trend"
                    desc="Last 6 months" onClick={() => document.getElementById('mb-revenue')?.scrollIntoView({ behavior: 'smooth' })} />
                </div>
              </div>

              {/* Pending payments */}
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="section-header">
                  <div className="section-title">
                    <i className="ti ti-clock-dollar" style={{ marginRight: 6, color: 'var(--tv-warning)' }}></i>
                    Pending payments
                    <span className="badge badge-amber" style={{ marginLeft: 8 }}>{currency(pendingTotal)} due</span>
                  </div>
                </div>
                {pendingInvoices.length === 0 ? (
                  <div className="empty-state">
                    <i className="ti ti-checks"></i>
                    <p>No pending payments — you're all caught up.</p>
                  </div>
                ) : (
                  <div>
                    {pendingInvoices.map((i) => (
                      <div key={i.key} className="list-item">
                        <div className={`item-icon ${i.status === 'OVERDUE' ? 'icon-red' : 'icon-amber'}`}>
                          <i className="ti ti-file-invoice"></i>
                        </div>
                        <div className="item-main">
                          <div className="item-name">{i.customer}</div>
                          <div className="item-sub">
                            <span className={`badge ${statusBadge(i.status)}`}>{i.status}</span>
                            {i.dueDate ? ` · Due ${bizDate(i.dueDate)}` : ''}
                            {!i.manual ? ' · QuickBooks' : ''}
                          </div>
                        </div>
                        <div className="item-right" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div className="item-amount">{currency(i.amount)}</div>
                          {i.manual && (
                            <button className="btn btn-secondary btn-sm" onClick={() => handleMarkInvoicePaid(i.id)}>
                              <i className="ti ti-check"></i> Mark paid
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Invoices — create + track */}
              <div className="card" id="mb-invoices" style={{ marginBottom: 16 }}>
                <div className="section-header">
                  <div className="section-title">
                    <i className="ti ti-file-invoice" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>
                    Invoices
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={() => setShowAddInvoice((v) => !v)}>
                    <i className={`ti ${showAddInvoice ? 'ti-x' : 'ti-plus'}`}></i>
                    {showAddInvoice ? ' Cancel' : ' Create invoice'}
                  </button>
                </div>

                {showAddInvoice && (
                  <form onSubmit={handleAddInvoice} style={{ marginBottom: 14 }}>
                    <div className="grid-2">
                      <div className="form-group">
                        <label className="form-label">Customer *</label>
                        <input className="form-input" value={invForm.customer}
                          onChange={(e) => setInvForm({ ...invForm, customer: e.target.value })}
                          placeholder="e.g. Acme Corp" autoFocus />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Amount *</label>
                        <input className="form-input" type="number" step="0.01" min="0" value={invForm.amount}
                          onChange={(e) => setInvForm({ ...invForm, amount: e.target.value })}
                          placeholder="0.00" />
                      </div>
                    </div>
                    <div className="grid-2">
                      <div className="form-group">
                        <label className="form-label">Due date</label>
                        <input className="form-input" type="date" value={invForm.dueDate}
                          onChange={(e) => setInvForm({ ...invForm, dueDate: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Status</label>
                        <select className="form-select" value={invForm.status}
                          onChange={(e) => setInvForm({ ...invForm, status: e.target.value })}>
                          <option value="OPEN">Open</option>
                          <option value="OVERDUE">Overdue</option>
                          <option value="PAID">Paid</option>
                        </select>
                      </div>
                    </div>
                    <button type="submit" className="btn btn-primary btn-sm"
                      disabled={!invForm.customer.trim() || !(Number(invForm.amount) > 0)}>
                      <i className="ti ti-send"></i> Create &amp; send
                    </button>
                  </form>
                )}

                {allInvoices.length === 0 ? (
                  <div className="empty-state">
                    <i className="ti ti-file-invoice"></i>
                    <p>No invoices yet. Create one to bill a customer and track payment.</p>
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
                          <th>Source</th>
                          <th style={{ width: 40 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {allInvoices.map((inv) => (
                          <tr key={inv.key}>
                            <td style={{ fontWeight: 500 }}>{inv.customer || '—'}</td>
                            <td style={{ textAlign: 'right' }}>
                              <span className="item-amount">{currency(inv.amount)}</span>
                            </td>
                            <td><span className={`badge ${statusBadge(inv.status)}`}>{inv.status}</span></td>
                            <td style={{ color: 'var(--tv-text-muted)' }}>{bizDate(inv.dueDate)}</td>
                            <td>
                              <span className={`badge ${inv.manual ? 'badge-forest' : 'badge-green'}`}>
                                {inv.manual ? 'Manual' : 'QuickBooks'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                              {inv.manual && (
                                <button className="icon-btn" title="Delete invoice" onClick={() => handleDeleteInvoice(inv.id)}>
                                  <i className="ti ti-trash"></i>
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Revenue trend */}
              <div className="card" id="mb-revenue" style={{ marginBottom: 16 }}>
                <div className="section-header">
                  <div className="section-title">
                    <i className="ti ti-chart-bar" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>
                    Revenue trend
                  </div>
                  <span className="badge badge-gray">Last 6 months</span>
                </div>
                <RevenueBarChart series={revenueSeries} max={maxRevenue} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Account card — visually distinguishes checking / savings / credit.  */
/* ------------------------------------------------------------------ */
function AccountCard({ account, active, onView, onAddTx, onDelete }) {
  const v = accountVisual(account.type);
  const cc = isCreditCard(account);
  const balance = Number(account.balance) || 0;
  const limit = Number(account.creditLimit) || 0;
  const available = Math.max(0, limit - balance);
  const util = limit > 0 ? Math.min(100, Math.round((balance / limit) * 100)) : 0;
  const utilColor = util >= 80 ? 'var(--tv-negative)' : util >= 50 ? 'var(--tv-warning)' : 'var(--tv-positive)';

  return (
    <div className="card" style={{
      borderTop: `3px solid ${v.accent}`,
      boxShadow: active ? '0 0 0 2px var(--tv-forest)' : undefined,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div className={`item-icon ${v.tone}`}><i className={`ti ${v.icon}`}></i></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="item-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {account.name}
          </div>
          <div className="item-sub">{account.institution || accountTypeLabel(account.type)}</div>
        </div>
        <span className={`badge ${accountTypeBadge(account.type)}`}>{accountTypeLabel(account.type)}</span>
      </div>

      <div className="stat-tile-label">{cc ? 'Balance owed' : 'Current balance'}</div>
      <div className="stat-tile-value" style={{ color: cc ? 'var(--tv-negative)' : 'var(--tv-text-primary)' }}>
        {currency(balance)}
      </div>

      {cc && limit > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--tv-text-muted)' }}>
            <span>{util}% used</span>
            <span>{currency(available)} available</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${util}%`, background: utilColor }}></div>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--tv-text-muted)', marginTop: 4 }}>
            Limit {currency(limit)}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn btn-secondary btn-sm" onClick={onView}>
          <i className="ti ti-list"></i> {cc ? 'Charges' : 'Activity'}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onAddTx}>
          <i className="ti ti-plus"></i> Add
        </button>
        <button className="icon-btn" title="Delete account" style={{ marginLeft: 'auto' }} onClick={onDelete}>
          <i className="ti ti-trash"></i>
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Credit card detail panel (Tab 1).                                   */
/* ------------------------------------------------------------------ */
function CreditCardPanel({ card, onViewCharges }) {
  const balance = Number(card.balance) || 0;
  const limit = Number(card.creditLimit) || 0;
  const available = Math.max(0, limit - balance);
  const util = limit > 0 ? Math.min(100, Math.round((balance / limit) * 100)) : 0;
  const utilColor = util >= 80 ? 'var(--tv-negative)' : util >= 50 ? 'var(--tv-warning)' : 'var(--tv-positive)';
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="list-item" style={{ padding: '4px 0' }}>
        <div className="item-icon icon-amber"><i className="ti ti-credit-card"></i></div>
        <div className="item-main">
          <div className="item-name">{card.name}</div>
          <div className="item-sub">{card.institution || 'Credit Card'}</div>
        </div>
        <div className="item-right">
          <div className="item-amount amount-neg">{currency(balance)}</div>
          <div className="item-sub">owed</div>
        </div>
      </div>
      {limit > 0 ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--tv-text-muted)', marginTop: 8 }}>
            <span>{util}% of {currency(limit)} limit</span>
            <span>{currency(available)} available</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${util}%`, background: utilColor }}></div>
          </div>
        </>
      ) : (
        <div className="item-sub" style={{ marginTop: 6 }}>Add a credit limit to see utilization.</div>
      )}
      <button className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={onViewCharges}>
        <i className="ti ti-list"></i> View recent charges
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Quick-action tile (Tab 2).                                          */
/* ------------------------------------------------------------------ */
function QuickAction({ icon, tone, label, desc, onClick }) {
  return (
    <button className="card" onClick={onClick}
      style={{ textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
      <div className={`item-icon ${tone}`}><i className={`ti ${icon}`}></i></div>
      <div>
        <div className="item-name">{label}</div>
        <div className="item-sub">{desc}</div>
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Horizontal category-spend bars (Tab 1).                             */
/* ------------------------------------------------------------------ */
function CategoryBars({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div>
      {rows.map((r) => (
        <div key={r.label} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 2 }}>
            <span style={{ color: 'var(--tv-text-primary)', fontWeight: 500 }}>{r.label}</span>
            <span className="item-amount">{currency(r.value)}</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${(r.value / max) * 100}%`, background: 'var(--tv-forest-light)' }}></div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Inline SVG bar chart for the 6-month revenue trend.                */
/* ------------------------------------------------------------------ */
function RevenueBarChart({ series, max }) {
  const width = 560;
  const height = 160;
  const padBottom = 24;
  const padTop = 8;
  const usableH = height - padBottom - padTop;
  const slot = width / series.length;
  const barW = Math.min(48, slot * 0.55);

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}
        preserveAspectRatio="xMidYMid meet" role="img" aria-label="Revenue over the last six months">
        {series.map((p, i) => {
          const h = Math.max(2, (p.value / max) * usableH);
          const x = i * slot + (slot - barW) / 2;
          const y = padTop + (usableH - h);
          const isLast = i === series.length - 1;
          return (
            <g key={p.label}>
              <rect x={x} y={y} width={barW} height={h} rx={6}
                fill={isLast ? 'var(--tv-forest)' : 'var(--tv-forest-light)'} opacity={isLast ? 1 : 0.75} />
              <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize="10" fill="var(--tv-text-secondary)">
                {compactMoney(p.value)}
              </text>
              <text x={x + barW / 2} y={height - 6} textAnchor="middle" fontSize="11" fill="var(--tv-text-muted)">
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
