import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from 'react';
import { currency, rangeStart } from '../utils/format';
import { api } from '../api';
import LastRefreshed from '../components/LastRefreshed';
import PlaidLinkButton from '../components/PlaidLinkButton';

/* ------------------------------------------------------------------ */
/* Local UI preference key (selection only; data is server-persisted)  */
/* ------------------------------------------------------------------ */
const LS_SELECTED = 'tv_business_selected';

/* Entity types offered when adding a business. */
const ENTITY_TYPES = ['LLC', 'S-Corp', 'C-Corp', 'Sole Prop', 'Partnership'];

/* Account types offered when adding a manual account. */
const ACCOUNT_TYPES = ['CHECKING', 'SAVINGS', 'CREDIT_CARD', 'LOAN'];

/* Categories offered when adding a manual transaction. */
const TX_CATEGORIES = [
  'Payroll', 'Rent', 'Software & SaaS', 'Marketing', 'Utilities', 'Insurance',
  'Travel', 'Meals', 'Supplies', 'Taxes', 'Professional Services', 'Income', 'Other',
];

const DATE_RANGES = ['All', '1W', '1M', '3M', '1Y', 'Custom'];

/* Types a user can assign when overriding a transaction's derived type. */
const ASSIGNABLE_TYPES = ['Income', 'Expense', 'Payroll', 'Vendor Payment', 'Transfer', 'Card Payment', 'Refund', 'Tax'];

/* Inner tabs. */
const TABS = [
  { id: 'tx', label: 'Transactions', icon: 'ti-arrows-exchange' },
  { id: 'cards', label: 'Credit Card & Expenses', icon: 'ti-credit-card' },
  { id: 'tools', label: 'Business Tools', icon: 'ti-tools' },
];

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

/* Renders a date like "May 20, 2026" (records use ISO date strings). */
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
  return 'badge-amber';
}

/* Safe JSON read/write from localStorage (failures are non-fatal). */
function readLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function writeLS(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

/* ---- Account type handling. Linked (Plaid) accounts use lowercase
   depository|credit|loan|investment|other; manual accounts use uppercase
   CHECKING|SAVINGS|CREDIT_CARD|LOAN. These helpers accept both. ---- */
function normType(type, subtype) {
  const t = (type || '').toLowerCase();
  const s = (subtype || '').toLowerCase();
  if (t === 'credit' || t === 'credit_card' || s.includes('credit')) return 'credit';
  if (t === 'checking') return 'checking';
  if (t === 'savings') return 'savings';
  if (t === 'depository') return s === 'savings' ? 'savings' : 'checking';
  if (t === 'loan') return 'loan';
  if (t === 'investment') return 'investment';
  return 'other';
}
function isCardType(t) { return t === 'credit'; }
function isBankType(t) { return t === 'checking' || t === 'savings'; }

function accountTypeLabel(t) {
  switch (t) {
    case 'checking': return 'Checking';
    case 'savings': return 'Savings';
    case 'credit': return 'Credit Card';
    case 'loan': return 'Loan';
    case 'investment': return 'Investment';
    default: return 'Account';
  }
}
function accountTypeBadge(t) {
  switch (t) {
    case 'checking': return 'badge-forest';
    case 'savings': return 'badge-green';
    case 'credit': return 'badge-amber';
    case 'loan': return 'badge-red';
    default: return 'badge-gray';
  }
}
/* Icon + tone + accent color per account type — the shared visual language. */
function accountVisual(t) {
  switch (t) {
    case 'checking': return { icon: 'ti-building-bank', tone: 'icon-forest', accent: 'var(--tv-forest)' };
    case 'savings': return { icon: 'ti-pig-money', tone: 'icon-green', accent: 'var(--tv-positive)' };
    case 'credit': return { icon: 'ti-credit-card', tone: 'icon-amber', accent: 'var(--tv-warning)' };
    case 'loan': return { icon: 'ti-file-dollar', tone: 'icon-red', accent: 'var(--tv-negative)' };
    case 'investment': return { icon: 'ti-chart-line', tone: 'icon-purple', accent: '#6B46C1' };
    default: return { icon: 'ti-wallet', tone: 'icon-blue', accent: 'var(--tv-forest-light)' };
  }
}

/* Normalize a linked (Plaid) account into the shared shape. */
function normLinkedAccount(a) {
  const type = normType(a.type, a.subtype);
  return {
    key: `lin-${a.id}`, source: 'Linked', rawId: a.id, type, subtype: a.subtype,
    plaidAccountId: a.plaidAccountId, plaidItemId: a.plaidItemId,
    name: a.name || a.officialName || `Account ${a.id}`,
    institution: a.officialName && a.officialName !== a.name ? a.officialName : null,
    mask: a.mask,
    balance: Number(a.currentBalance) || 0,
    available: a.availableBalance != null ? Number(a.availableBalance) : null,
    creditLimit: a.creditLimit != null ? Number(a.creditLimit) : null,
    minimumPayment: a.minimumPayment != null ? Number(a.minimumPayment) : null,
    nextPaymentDueDate: a.nextPaymentDueDate || null,
    holderCategory: (a.holderCategory || '').toLowerCase(),
    autoSynced: true, canDelete: false,
  };
}

/* Auto-detect whether a linked (raw) account is a business account. Prefers
   Plaid's holder_category; falls back to a name/official-name keyword heuristic
   when the institution didn't report one. */
function isBusinessLinked(a) {
  const hc = (a.holderCategory || '').toLowerCase();
  if (hc === 'business') return true;
  if (hc === 'personal') return false;
  const s = `${a.name || ''} ${a.officialName || ''}`.toLowerCase();
  return /\bbusiness\b|\bbiz\b|commercial|\bllc\b|\binc\b|\bl\.?l\.?c\b/.test(s);
}
/* Normalize a manual business account into the shared shape. */
function normManualAccount(a) {
  const type = normType(a.type);
  return {
    key: `man-${a.id}`, source: 'Manual', rawId: a.id, type, subtype: null,
    plaidAccountId: null, plaidItemId: null,
    name: a.name, institution: a.institution, mask: null,
    balance: Number(a.balance) || 0,
    available: null,
    creditLimit: a.creditLimit != null ? Number(a.creditLimit) : null,
    minimumPayment: null, nextPaymentDueDate: null,
    autoSynced: false, canDelete: true,
  };
}

/* Stable external id for reconciliation (linked vs manual). */
function txExternalId(t) {
  return t.source === 'Linked'
    ? `lin-${t.plaidTransactionId || t.id}`
    : `man-${t.id}`;
}

/* Coarse transaction TYPE bucket for tagging + filtering. Uses amount sign
   (positive = money in, negative = money out — matching the Transactions page),
   the resolved account, and keyword heuristics over name/merchant/category. */
function classifyTxType(amount, category, name, merchant, acctType) {
  const hay = `${name || ''} ${merchant || ''} ${category || ''}`.toLowerCase();
  if (/refund|reversal|\breturn\b|chargeback|adjustment/.test(hay)) return 'Refund';
  if (/\btax(es)?\b|\birs\b|franchise tax|estimated payment|sales tax/.test(hay)) return 'Tax';
  if (/transfer|\bxfer\b|zelle|wire|book transfer|internal transfer/.test(hay)) return 'Transfer';
  if (isCardType(acctType) && amount > 0) return 'Card Payment';
  if (/payroll|gusto|\badp\b|paychex|salary|wages/.test(hay)) return 'Payroll';
  if (amount > 0) return 'Income';
  if (/vendor|supplier|invoice|professional service|contractor|consult/.test(hay)) return 'Vendor Payment';
  return 'Expense';
}

/* Icon + tone for a transaction row, by type. */
function txTypeVisual(type) {
  switch (type) {
    case 'Income': return { icon: 'ti-arrow-down-left', tone: 'icon-green' };
    case 'Card Payment': return { icon: 'ti-credit-card', tone: 'icon-forest' };
    case 'Transfer': return { icon: 'ti-arrows-exchange', tone: 'icon-blue' };
    case 'Refund': return { icon: 'ti-receipt-refund', tone: 'icon-green' };
    case 'Tax': return { icon: 'ti-building-bank', tone: 'icon-amber' };
    case 'Payroll': return { icon: 'ti-users', tone: 'icon-purple' };
    case 'Vendor Payment': return { icon: 'ti-truck-delivery', tone: 'icon-amber' };
    default: return { icon: 'ti-shopping-bag', tone: 'icon-red' };
  }
}

/* Status badge variant. */
function txStatusBadge(status) {
  switch (status) {
    case 'Reconciled': return 'badge-green';
    case 'Pending': return 'badge-amber';
    case 'Failed': return 'badge-red';
    default: return 'badge-gray'; // Cleared
  }
}

/* Build a 6-month revenue series from REAL dashboard data only (no fabrication). */
function buildRevenueSeries(dashboard) {
  const apiSeries = dashboard?.revenueTrend || dashboard?.revenueSeries;
  if (Array.isArray(apiSeries) && apiSeries.length) {
    return apiSeries.slice(-6).map((p, i) => ({
      label: p.label || monthLabel(5 - i),
      value: Number(p.value ?? p.amount ?? 0),
    }));
  }
  return [5, 4, 3, 2, 1, 0].map((m) => ({ label: monthLabel(m), value: 0 }));
}
function monthLabel(monthsAgo) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - monthsAgo);
  return d.toLocaleDateString('en-US', { month: 'short' });
}

export default function MyBusinessPage({ user, formatDate, accounts = [], transactions = [], loadAll }) {
  /* ---- QuickBooks-backed state ---- */
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const [connection, setConnection] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [qboInvoices, setQboInvoices] = useState([]);
  const [expenses, setExpenses] = useState([]);

  /* ---- Server-persisted business state ---- */
  const [businesses, setBusinesses] = useState([]);
  const [selectedId, setSelectedId] = useState(() => readLS(LS_SELECTED, null));
  const [bizAccounts, setBizAccounts] = useState([]);         // manual accounts
  const [bizTransactions, setBizTransactions] = useState([]); // manual transactions
  const [manualInvoices, setManualInvoices] = useState([]);
  const [reconciledSet, setReconciledSet] = useState(() => new Set());
  /* Aggregation account ids assigned to the selected business (Set of strings). */
  const [assignedLinkedIds, setAssignedLinkedIds] = useState(() => new Set());

  /* ---- UI state ---- */
  const [activeTab, setActiveTab] = useState('tx');
  const [showAssign, setShowAssign] = useState(false);
  const [assignDraft, setAssignDraft] = useState(() => new Set());
  const [savingAssign, setSavingAssign] = useState(false);

  const [showAddBusiness, setShowAddBusiness] = useState(false);
  const [bizForm, setBizForm] = useState({ name: '', industry: '', entityType: 'LLC', ein: '' });

  const [showAddAccount, setShowAddAccount] = useState(false);
  const [acctForm, setAcctForm] = useState({ name: '', institution: '', type: 'CHECKING', balance: '', creditLimit: '' });

  const [showAddTx, setShowAddTx] = useState(false);
  const [txForm, setTxForm] = useState({
    accountKey: '', date: todayISO(), description: '', merchant: '', category: 'Software & SaaS', amount: '', direction: 'out',
  });

  const [showAddInvoice, setShowAddInvoice] = useState(false);
  const [invForm, setInvForm] = useState({ customer: '', amount: '', dueDate: '', status: 'OPEN' });

  /* ---- Transaction filters ---- */
  const [search, setSearch] = useState('');
  const [fAccount, setFAccount] = useState('ALL');   // 'ALL' | account key
  const [fCategory, setFCategory] = useState('ALL');
  const [fType, setFType] = useState('ALL');
  const [fStatus, setFStatus] = useState('ALL');
  const [fDirection, setFDirection] = useState('ALL'); // ALL | IN | OUT
  const [dateRange, setDateRange] = useState('All');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [minAmt, setMinAmt] = useState('');
  const [maxAmt, setMaxAmt] = useState('');
  const [fTag, setFTag] = useState('ALL');
  const [sortKey, setSortKey] = useState('date');
  const [sortDir, setSortDir] = useState('desc');

  /* User type/tag overrides (extId -> { type, tags[] }) + inline editor state. */
  const [overridesMap, setOverridesMap] = useState(() => new Map());
  const [editingKey, setEditingKey] = useState(null);
  const [editForm, setEditForm] = useState({ type: '', tags: '' });

  const txSectionRef = useRef(null);

  /* "All businesses" aggregate view — track every business in one place. */
  const isAllView = selectedId === 'ALL' && businesses.length > 1;
  const selectedBusiness = useMemo(() => {
    if (isAllView || !businesses.length) return null;
    return businesses.find((b) => b.id === selectedId) || businesses[0];
  }, [businesses, selectedId, isAllView]);

  /* ------------------------------------------------------------------ */
  /* Data loading                                                       */
  /* ------------------------------------------------------------------ */
  const loadBusinessQbo = useCallback(async () => {
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
    if ([conn, dash, inv, exp].every((r) => r.status === 'rejected')) {
      setError(conn.reason?.message || 'Could not load business data. Please try again.');
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadBusinessQbo(); }, [loadBusinessQbo]);

  const loadBusinesses = useCallback(async () => {
    try {
      const list = await api.getManualBusinesses();
      setBusinesses(Array.isArray(list) ? list : []);
    } catch { /* non-fatal */ }
  }, []);
  useEffect(() => { loadBusinesses(); }, [loadBusinesses]);

  const loadReconciliations = useCallback(async () => {
    try {
      const ids = await api.getReconciliations();
      setReconciledSet(new Set(Array.isArray(ids) ? ids : []));
    } catch { /* non-fatal; nothing reconciled */ }
  }, []);
  useEffect(() => { loadReconciliations(); }, [loadReconciliations]);

  const loadOverrides = useCallback(async () => {
    try {
      const list = await api.getTxOverrides();
      const m = new Map();
      (Array.isArray(list) ? list : []).forEach((o) =>
        m.set(o.externalId, { type: o.type || null, tags: Array.isArray(o.tags) ? o.tags : [] }));
      setOverridesMap(m);
    } catch { /* non-fatal; no overrides */ }
  }, []);
  useEffect(() => { loadOverrides(); }, [loadOverrides]);

  useEffect(() => {
    if (!businesses.length) return;
    const keepAll = selectedId === 'ALL' && businesses.length > 1;
    if (!keepAll && !businesses.some((b) => b.id === selectedId)) { setSelectedId(businesses[0].id); return; }
    writeLS(LS_SELECTED, selectedId);
  }, [selectedId, businesses]);

  const loadBusinessDetail = useCallback(async (businessId) => {
    if (!businessId) {
      setBizAccounts([]); setBizTransactions([]); setManualInvoices([]); setAssignedLinkedIds(new Set());
      return;
    }
    const [acc, tx, inv, linked] = await Promise.allSettled([
      api.getBusinessAccounts(businessId),
      api.getBusinessTransactions(businessId),
      api.getManualInvoices(businessId),
      api.getBusinessLinkedAccounts(businessId),
    ]);
    setBizAccounts(acc.status === 'fulfilled' && Array.isArray(acc.value) ? acc.value : []);
    setBizTransactions(tx.status === 'fulfilled' && Array.isArray(tx.value) ? tx.value : []);
    setManualInvoices(inv.status === 'fulfilled' && Array.isArray(inv.value) ? inv.value : []);
    setAssignedLinkedIds(new Set(
      linked.status === 'fulfilled' && Array.isArray(linked.value) ? linked.value.map(String) : []
    ));
  }, []);

  /* Aggregate every business's accounts/transactions/invoices/assignments into one view. */
  const loadAllBusinessesDetail = useCallback(async (list) => {
    const biz = Array.isArray(list) ? list : [];
    if (!biz.length) {
      setBizAccounts([]); setBizTransactions([]); setManualInvoices([]); setAssignedLinkedIds(new Set());
      return;
    }
    const results = await Promise.allSettled(biz.flatMap((b) => [
      api.getBusinessAccounts(b.id),
      api.getBusinessTransactions(b.id),
      api.getManualInvoices(b.id),
      api.getBusinessLinkedAccounts(b.id),
    ]));
    const accountsAll = [], txAll = [], invAll = [], linkedAll = [];
    biz.forEach((b, i) => {
      const [acc, tx, inv, linked] = results.slice(i * 4, i * 4 + 4);
      if (acc.status === 'fulfilled' && Array.isArray(acc.value)) accountsAll.push(...acc.value);
      if (tx.status === 'fulfilled' && Array.isArray(tx.value)) txAll.push(...tx.value);
      if (inv.status === 'fulfilled' && Array.isArray(inv.value)) invAll.push(...inv.value);
      if (linked.status === 'fulfilled' && Array.isArray(linked.value)) linkedAll.push(...linked.value.map(String));
    });
    setBizAccounts(accountsAll); setBizTransactions(txAll); setManualInvoices(invAll);
    setAssignedLinkedIds(new Set(linkedAll));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      if (isAllView) await loadAllBusinessesDetail(businesses);
      else await loadBusinessDetail(selectedBusiness?.id);
    })();
    return () => { cancelled = true; };
  }, [selectedBusiness, isAllView, businesses, loadBusinessDetail, loadAllBusinessesDetail]);

  /* Full refresh: linked accounts/transactions (App-level) + QuickBooks + business detail. */
  const refreshEverything = useCallback(async () => {
    await Promise.all([
      loadAll ? loadAll() : Promise.resolve(),
      loadBusinessQbo(),
      isAllView ? loadAllBusinessesDetail(businesses) : loadBusinessDetail(selectedBusiness?.id),
      loadReconciliations(),
      loadOverrides(),
    ]);
  }, [loadAll, loadBusinessQbo, isAllView, businesses, loadBusinessDetail, loadAllBusinessesDetail, loadReconciliations, loadOverrides, selectedBusiness]);

  /* ------------------------------------------------------------------ */
  /* Normalized accounts (linked + manual)                              */
  /* ------------------------------------------------------------------ */
  /* Which linked accounts count as business:
     - if the user has explicitly assigned accounts to this business, honor that;
     - otherwise auto-detect (Plaid holder_category / name heuristic).
     Manual accounts are business by definition. */
  const autoBusinessIds = useMemo(
    () => new Set((accounts || []).filter(isBusinessLinked).map((a) => String(a.id))),
    [accounts]
  );
  const effectiveLinkedIds = useMemo(() => {
    // All-businesses view: union of every business's assignments + all auto-detected.
    if (isAllView) return new Set([...autoBusinessIds, ...assignedLinkedIds]);
    return assignedLinkedIds.size > 0 ? assignedLinkedIds : autoBusinessIds;
  }, [isAllView, assignedLinkedIds, autoBusinessIds]);
  const usingAutoDetect = assignedLinkedIds.size === 0;

  const allAccounts = useMemo(() => {
    const linked = (accounts || [])
      .filter((a) => effectiveLinkedIds.has(String(a.id)))
      .map(normLinkedAccount);
    const manual = (bizAccounts || []).map(normManualAccount);
    return [...linked, ...manual];
  }, [accounts, bizAccounts, effectiveLinkedIds]);

  const linkedById = useMemo(() => {
    const m = new Map();
    (accounts || []).forEach((a) => a?.id != null && m.set(String(a.id), a));
    return m;
  }, [accounts]);
  const linkedByPlaid = useMemo(() => {
    const m = new Map();
    (accounts || []).forEach((a) => a?.plaidAccountId && m.set(a.plaidAccountId, a));
    return m;
  }, [accounts]);

  /* Resolve a raw transaction to its normalized account key. */
  const resolveAcctKey = useCallback((t) => {
    if (t.source === 'Linked') {
      if (t.accountId != null && linkedById.has(String(t.accountId))) return `lin-${t.accountId}`;
      if (t.plaidAccountId && linkedByPlaid.has(t.plaidAccountId)) return `lin-${linkedByPlaid.get(t.plaidAccountId).id}`;
      return null;
    }
    return t.accountId != null ? `man-${t.accountId}` : null;
  }, [linkedById, linkedByPlaid]);

  const accountByKey = useMemo(() => {
    const m = new Map();
    allAccounts.forEach((a) => m.set(a.key, a));
    return m;
  }, [allAccounts]);

  /* ------------------------------------------------------------------ */
  /* Unified transactions (auto-synced linked + manual)                 */
  /* ------------------------------------------------------------------ */
  const unifiedTx = useMemo(() => {
    // Only transactions from linked accounts counted as business (assigned or auto-detected).
    const linked = (transactions || [])
      .filter((t) => effectiveLinkedIds.has(String(t.accountId)))
      .map((t) => ({ ...t, source: 'Linked' }));
    const manual = (bizTransactions || []).map((t) => ({
      source: 'Manual', id: t.id,
      name: t.description, merchantName: t.merchant,
      amount: Number(t.amount) || 0,
      date: t.postedAt, category: t.category || 'Uncategorized',
      accountId: t.accountId, plaidAccountId: null, pending: false,
    }));

    return [...linked, ...manual].map((t) => {
      const acctKey = resolveAcctKey(t);
      const acct = acctKey ? accountByKey.get(acctKey) : null;
      const amount = Number(t.amount) || 0;
      const name = t.name || t.description || t.merchantName || 'Transaction';
      const category = t.category || 'Uncategorized';
      const derivedType = classifyTxType(amount, category, name, t.merchantName, acct?.type);
      const extId = txExternalId(t);
      const ov = overridesMap.get(extId);
      const type = ov?.type || derivedType;
      const tags = ov?.tags || [];
      let status = 'Cleared';
      if (reconciledSet.has(extId)) status = 'Reconciled';
      else if (t.pending === true) status = 'Pending';
      return {
        key: `${t.source}-${t.id}`,
        extId, source: t.source, rawId: t.id,
        name, merchant: t.merchantName || null,
        amount, date: t.date, category,
        type, derivedType, typeOverridden: !!ov?.type, tags, status,
        acctKey, acct,
        canDelete: t.source === 'Manual',
      };
    });
  }, [transactions, bizTransactions, effectiveLinkedIds, resolveAcctKey, accountByKey, reconciledSet, overridesMap]);

  /* Dropdown option sets, derived from the data. */
  const categoryOptions = useMemo(() => {
    const s = new Set();
    unifiedTx.forEach((t) => t.category && s.add(t.category));
    return ['ALL', ...Array.from(s).sort()];
  }, [unifiedTx]);
  const typeOptions = useMemo(() => {
    const s = new Set();
    unifiedTx.forEach((t) => s.add(t.type));
    return ['ALL', ...Array.from(s).sort()];
  }, [unifiedTx]);
  const tagOptions = useMemo(() => {
    const s = new Set();
    unifiedTx.forEach((t) => t.tags.forEach((tag) => s.add(tag)));
    return ['ALL', ...Array.from(s).sort()];
  }, [unifiedTx]);

  const hasActiveFilters =
    search || fAccount !== 'ALL' || fCategory !== 'ALL' || fType !== 'ALL' ||
    fStatus !== 'ALL' || fDirection !== 'ALL' || fTag !== 'ALL' || dateRange !== 'All' || minAmt || maxAmt;

  function clearFilters() {
    setSearch(''); setFAccount('ALL'); setFCategory('ALL'); setFType('ALL');
    setFStatus('ALL'); setFDirection('ALL'); setFTag('ALL'); setDateRange('All');
    setCustomFrom(''); setCustomTo(''); setMinAmt(''); setMaxAmt('');
  }

  const filteredTx = useMemo(() => {
    const q = search.trim().toLowerCase();
    let from = null, to = null;
    if (dateRange === 'Custom') {
      from = customFrom ? new Date(customFrom + 'T00:00:00') : null;
      to = customTo ? new Date(customTo + 'T23:59:59') : null;
    } else if (dateRange !== 'All') {
      from = rangeStart(dateRange);
    }
    const lo = minAmt !== '' ? Math.abs(Number(minAmt)) : null;
    const hi = maxAmt !== '' ? Math.abs(Number(maxAmt)) : null;

    return unifiedTx.filter((t) => {
      if (q && !t.name.toLowerCase().includes(q) &&
        !t.category.toLowerCase().includes(q) &&
        !(t.merchant || '').toLowerCase().includes(q) &&
        !t.tags.some((tag) => tag.toLowerCase().includes(q))) return false;
      if (fAccount !== 'ALL' && t.acctKey !== fAccount) return false;
      if (fCategory !== 'ALL' && t.category !== fCategory) return false;
      if (fType !== 'ALL' && t.type !== fType) return false;
      if (fTag !== 'ALL' && !t.tags.includes(fTag)) return false;
      if (fStatus !== 'ALL' && t.status !== fStatus) return false;
      if (fDirection === 'IN' && t.amount < 0) return false;
      if (fDirection === 'OUT' && t.amount >= 0) return false;
      if (from || to) {
        const d = t.date ? new Date(t.date) : null;
        if (!d || Number.isNaN(d.getTime())) return false;
        if (from && d < from) return false;
        if (to && d > to) return false;
      }
      const mag = Math.abs(t.amount);
      if (lo != null && mag < lo) return false;
      if (hi != null && mag > hi) return false;
      return true;
    });
  }, [unifiedTx, search, fAccount, fCategory, fType, fTag, fStatus, fDirection, dateRange, customFrom, customTo, minAmt, maxAmt]);

  const sortedTx = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const val = (t) => {
      switch (sortKey) {
        case 'amount': return t.amount;
        case 'name': return t.name.toLowerCase();
        case 'category': return t.category.toLowerCase();
        case 'date':
        default: return t.date ? new Date(t.date).getTime() : 0;
      }
    };
    return [...filteredTx].sort((a, b) => {
      const av = val(a), bv = val(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [filteredTx, sortKey, sortDir]);

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'name' || key === 'category' ? 'asc' : 'desc'); }
  }

  const txTotals = useMemo(() => {
    let moneyIn = 0, moneyOut = 0;
    filteredTx.forEach((t) => { if (t.amount >= 0) moneyIn += t.amount; else moneyOut += t.amount; });
    return { moneyIn, moneyOut, net: moneyIn + moneyOut, count: filteredTx.length };
  }, [filteredTx]);

  /* ------------------------------------------------------------------ */
  /* API actions                                                        */
  /* ------------------------------------------------------------------ */
  async function handleSync() {
    setSyncing(true);
    try {
      // Linked accounts also auto-sync on a schedule; this is a manual "sync now".
      await Promise.allSettled([api.syncBusiness(), api.syncTransactions()]);
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
      if (res?.authorizeUrl) { window.location.href = res.authorizeUrl; return; }
      await loadBusinessQbo();
    } catch (e) {
      setError(e?.message || 'Could not connect QuickBooks.');
    } finally {
      setConnecting(false);
    }
  }

  async function handleReconcileToggle(t) {
    const isRec = reconciledSet.has(t.extId);
    // Optimistic update.
    setReconciledSet((prev) => {
      const next = new Set(prev);
      if (isRec) next.delete(t.extId); else next.add(t.extId);
      return next;
    });
    try {
      if (isRec) await api.removeReconciliation(t.extId);
      else await api.addReconciliation(t.extId);
    } catch (e) {
      // Roll back on failure.
      setReconciledSet((prev) => {
        const next = new Set(prev);
        if (isRec) next.add(t.extId); else next.delete(t.extId);
        return next;
      });
      setError(e?.message || 'Could not update reconciliation.');
    }
  }

  /* ---- Transaction type/tag overrides ---- */
  function openEditOverride(t) {
    setEditingKey(t.key);
    setEditForm({ type: t.typeOverridden ? t.type : '', tags: t.tags.join(', ') });
  }
  async function saveOverride(t) {
    const type = editForm.type || null;
    const tags = editForm.tags.split(',').map((s) => s.trim()).filter(Boolean);
    const cleared = !type && tags.length === 0;
    // Optimistic update.
    setOverridesMap((prev) => {
      const next = new Map(prev);
      if (cleared) next.delete(t.extId);
      else next.set(t.extId, { type, tags });
      return next;
    });
    setEditingKey(null);
    try {
      if (cleared) await api.deleteTxOverride(t.extId);
      else await api.setTxOverride(t.extId, { type, tags });
    } catch (e) {
      setError(e?.message || 'Could not save override.');
      loadOverrides(); // resync on failure
    }
  }

  /* ---- Business CRUD ---- */
  async function handleAddBusiness(e) {
    e.preventDefault();
    const name = bizForm.name.trim();
    if (!name) return;
    try {
      const created = await api.createManualBusiness({
        name, industry: bizForm.industry.trim(), entityType: bizForm.entityType, ein: bizForm.ein.trim(),
      });
      setBusinesses((prev) => [...prev, created]);
      setSelectedId(created.id);
      setBizForm({ name: '', industry: '', entityType: 'LLC', ein: '' });
      setShowAddBusiness(false);
    } catch (err) { setError(err?.message || 'Could not add business.'); }
  }
  async function handleDeleteBusiness(id) {
    try {
      await api.deleteManualBusiness(id);
      setBusinesses((prev) => prev.filter((b) => b.id !== id));
    } catch (err) { setError(err?.message || 'Could not delete business.'); }
  }

  /* ---- Manual account CRUD ---- */
  async function handleAddAccount(e) {
    e.preventDefault();
    const name = acctForm.name.trim();
    if (!name || !selectedBusiness) return;
    try {
      const created = await api.createBusinessAccount(selectedBusiness.id, {
        name, institution: acctForm.institution.trim(), type: acctForm.type,
        balance: Number(acctForm.balance) || 0,
        creditLimit: acctForm.type === 'CREDIT_CARD' && acctForm.creditLimit !== ''
          ? Number(acctForm.creditLimit) || 0 : null,
      });
      setBizAccounts((prev) => [...prev, created]);
      setAcctForm({ name: '', institution: '', type: 'CHECKING', balance: '', creditLimit: '' });
      setShowAddAccount(false);
    } catch (err) { setError(err?.message || 'Could not add account.'); }
  }
  async function handleDeleteAccount(rawId) {
    try {
      await api.deleteBusinessAccount(rawId);
      setBizAccounts((prev) => prev.filter((a) => a.id !== rawId));
      setBizTransactions((prev) => prev.filter((t) => String(t.accountId) !== String(rawId)));
    } catch (err) { setError(err?.message || 'Could not delete account.'); }
  }

  /* ---- Linked-account assignment ---- */
  function openAssign() {
    // Seed with what's currently shown (explicit assignment, or the auto-detected set).
    setAssignDraft(new Set(effectiveLinkedIds));
    setShowAssign(true);
  }
  /* Revert to auto-detect: clear explicit assignment for this business. */
  async function resetAssignToAuto() {
    if (!selectedBusiness) return;
    setSavingAssign(true);
    try {
      await api.setBusinessLinkedAccounts(selectedBusiness.id, []);
      setAssignedLinkedIds(new Set());
      setShowAssign(false);
    } catch (err) {
      setError(err?.message || 'Could not reset assignment.');
    } finally {
      setSavingAssign(false);
    }
  }

  /* Unlink a linked institution (removes its accounts, transactions & holdings). */
  async function handleUnlink(account) {
    if (!account?.plaidItemId) return;
    const label = account.institution || account.name || 'this institution';
    if (!window.confirm(`Unlink ${label}?\n\nThis disconnects the institution and removes its linked account(s) — including any others under the same login — from TerraVest. You can re-link anytime.`)) return;
    try {
      await api.unlinkItem(account.plaidItemId);
      await refreshEverything();
    } catch (err) {
      setError(err?.message || 'Could not unlink the account.');
    }
  }
  function toggleAssignDraft(id) {
    setAssignDraft((prev) => {
      const next = new Set(prev);
      const k = String(id);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }
  async function saveAssign() {
    if (!selectedBusiness) return;
    setSavingAssign(true);
    const ids = Array.from(assignDraft);
    try {
      await api.setBusinessLinkedAccounts(selectedBusiness.id, ids);
      setAssignedLinkedIds(new Set(ids));
      setShowAssign(false);
    } catch (err) {
      setError(err?.message || 'Could not save account assignment.');
    } finally {
      setSavingAssign(false);
    }
  }

  /* ---- Manual transaction CRUD ---- */
  function openAddTx(accountKey) {
    setActiveTab('tx');
    const manualKeys = allAccounts.filter((a) => a.source === 'Manual');
    const preferred = (accountKey && accountKey.startsWith('man-')) ? accountKey : (manualKeys[0]?.key || '');
    setTxForm((f) => ({ ...f, accountKey: preferred, date: todayISO() }));
    setShowAddTx(true);
    requestAnimationFrame(() => txSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  async function handleAddTx(e) {
    e.preventDefault();
    if (!selectedBusiness) return;
    const acct = accountByKey.get(txForm.accountKey);
    if (!acct || acct.source !== 'Manual') { setError('Pick a manual account to add a transaction to.'); return; }
    const magnitude = Math.abs(Number(txForm.amount) || 0);
    if (!txForm.description.trim() || !magnitude) return;
    const signed = txForm.direction === 'in' ? magnitude : -magnitude;
    try {
      const created = await api.createBusinessTransaction(selectedBusiness.id, {
        accountId: acct.rawId, description: txForm.description.trim(), merchant: txForm.merchant.trim(),
        category: txForm.category, amount: signed, postedAt: txForm.date || todayISO(),
      });
      setBizTransactions((prev) => [created, ...prev]);
      setTxForm({ accountKey: txForm.accountKey, date: todayISO(), description: '', merchant: '', category: 'Software & SaaS', amount: '', direction: 'out' });
      setShowAddTx(false);
    } catch (err) { setError(err?.message || 'Could not add transaction.'); }
  }
  async function handleDeleteTx(t) {
    if (t.source !== 'Manual') return;
    try {
      await api.deleteBusinessTransaction(t.rawId);
      setBizTransactions((prev) => prev.filter((x) => x.id !== t.rawId));
    } catch (err) { setError(err?.message || 'Could not delete transaction.'); }
  }

  /* ---- Invoice CRUD ---- */
  async function handleAddInvoice(e) {
    e.preventDefault();
    if (!selectedBusiness) return;
    const customer = invForm.customer.trim();
    const amount = Number(invForm.amount) || 0;
    if (!customer || !amount) return;
    try {
      const created = await api.createManualInvoice(selectedBusiness.id, {
        customer, amount, status: invForm.status, dueDate: invForm.dueDate || null,
      });
      setManualInvoices((prev) => [created, ...prev]);
      setInvForm({ customer: '', amount: '', dueDate: '', status: 'OPEN' });
      setShowAddInvoice(false);
    } catch (err) { setError(err?.message || 'Could not create invoice.'); }
  }
  async function handleMarkInvoicePaid(id) {
    try {
      const updated = await api.updateManualInvoice(id, { status: 'PAID' });
      setManualInvoices((prev) => prev.map((i) => (i.id === id ? updated : i)));
    } catch (err) { setError(err?.message || 'Could not update invoice.'); }
  }
  async function handleDeleteInvoice(id) {
    try {
      await api.deleteManualInvoice(id);
      setManualInvoices((prev) => prev.filter((i) => i.id !== id));
    } catch (err) { setError(err?.message || 'Could not delete invoice.'); }
  }

  /* CSV export of the current filtered transaction view. */
  function exportCsv() {
    const header = ['Date', 'Description', 'Merchant', 'Account', 'Category', 'Type', 'Tags', 'Status', 'Source', 'Amount'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = sortedTx.map((t) => [
      bizDate(t.date), t.name, t.merchant || '', t.acct?.name || '—',
      t.category, t.type, t.tags.join('; '), t.status, t.source, t.amount,
    ].map(esc).join(','));
    const csv = [header.map(esc).join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'business-transactions.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* ------------------------------------------------------------------ */
  /* Derived values                                                     */
  /* ------------------------------------------------------------------ */
  const connected = connection?.connected ?? dashboard?.connected ?? false;
  const companyName = connection?.companyName || dashboard?.companyName || 'Your Business';
  const changePct = Number(dashboard?.revenueChangePct ?? 0);
  const hasAnyLinked = (accounts || []).length > 0;        // any linked accounts exist to assign
  const hasLinked = allAccounts.some((a) => a.source === 'Linked'); // any assigned to this business
  const hasContext = connected || !!selectedBusiness || isAllView || hasAnyLinked;
  /* All linked accounts, normalized — the pool shown in the assignment picker. */
  const availableLinked = useMemo(() => (accounts || []).map(normLinkedAccount), [accounts]);

  const bankAccounts = useMemo(() => allAccounts.filter((a) => isBankType(a.type)), [allAccounts]);
  const creditCards = useMemo(() => allAccounts.filter((a) => isCardType(a.type)), [allAccounts]);
  const cashTotal = useMemo(() => bankAccounts.reduce((s, a) => s + a.balance, 0), [bankAccounts]);
  const creditOwed = useMemo(() => creditCards.reduce((s, a) => s + a.balance, 0), [creditCards]);

  const allInvoices = useMemo(() => {
    const m = manualInvoices.map((i) => ({
      key: `m-${i.id}`, id: i.id, manual: true, customer: i.customer,
      amount: Number(i.amount) || 0, status: (i.status || 'OPEN').toUpperCase(), dueDate: i.dueDate,
    }));
    const q = qboInvoices.map((i) => ({
      key: `q-${i.id}`, id: i.id, manual: false, customer: i.customer,
      amount: Number(i.amount) || 0, status: (i.status || 'OPEN').toUpperCase(), dueDate: i.dueDate,
    }));
    return [...m, ...q];
  }, [manualInvoices, qboInvoices]);
  const pendingInvoices = useMemo(() => allInvoices.filter((i) => i.status !== 'PAID'), [allInvoices]);
  const pendingTotal = useMemo(() => pendingInvoices.reduce((s, i) => s + i.amount, 0), [pendingInvoices]);

  const manualFigures = useMemo(() => {
    // All-businesses view: sum the per-business figures across every business.
    if (isAllView) {
      return businesses.reduce((acc, b) => ({
        revenueMtd: acc.revenueMtd + (Number(b.revenueMtd) || 0),
        expensesMtd: acc.expensesMtd + (Number(b.expensesMtd) || 0),
        outstandingInvoices: acc.outstandingInvoices + (Number(b.outstandingInvoices) || 0),
      }), { revenueMtd: 0, expensesMtd: 0, outstandingInvoices: 0 });
    }
    return {
      revenueMtd: Number(selectedBusiness?.revenueMtd) || 0,
      expensesMtd: Number(selectedBusiness?.expensesMtd) || 0,
      outstandingInvoices: Number(selectedBusiness?.outstandingInvoices) || 0,
    };
  }, [isAllView, businesses, selectedBusiness]);

  /* Deposits (money in) so far this calendar month — surfaced as a KPI. */
  const depositsMtd = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear(), mo = now.getMonth();
    return unifiedTx.reduce((s, t) => {
      if (t.amount <= 0) return s;
      const d = t.date ? new Date(t.date) : null;
      if (!d || d.getFullYear() !== y || d.getMonth() !== mo) return s;
      return s + t.amount;
    }, 0);
  }, [unifiedTx]);

  /* Money in vs money out across the last 6 calendar months, from real
     transactions — powers the Cash Flow chart. */
  const cashFlowSeries = useMemo(() => {
    const now = new Date();
    const buckets = [];
    for (let k = 5; k >= 0; k--) {
      const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
      buckets.push({ y: d.getFullYear(), m: d.getMonth(), label: d.toLocaleDateString('en-US', { month: 'short' }), moneyIn: 0, moneyOut: 0 });
    }
    const idx = new Map(buckets.map((b, i) => [`${b.y}-${b.m}`, i]));
    unifiedTx.forEach((t) => {
      if (!t.date) return;
      const d = new Date(t.date);
      if (Number.isNaN(d.getTime())) return;
      const i = idx.get(`${d.getFullYear()}-${d.getMonth()}`);
      if (i == null) return;
      if (t.amount >= 0) buckets[i].moneyIn += t.amount;
      else buckets[i].moneyOut += Math.abs(t.amount);
    });
    return buckets;
  }, [unifiedTx]);
  const cashFlowNet = useMemo(
    () => cashFlowSeries.reduce((s, b) => s + b.moneyIn - b.moneyOut, 0),
    [cashFlowSeries]
  );
  const cashFlowHasData = useMemo(
    () => cashFlowSeries.some((b) => b.moneyIn > 0 || b.moneyOut > 0),
    [cashFlowSeries]
  );

  const kpi = connected
    ? {
        revenueMtd: dashboard?.revenueMtd, expensesMtd: dashboard?.expensesMtd,
        netProfitMtd: dashboard?.netProfitMtd, cashBalance: dashboard?.cashBalance,
        outstandingInvoices: dashboard?.outstandingInvoices,
      }
    : {
        revenueMtd: manualFigures.revenueMtd, expensesMtd: manualFigures.expensesMtd,
        netProfitMtd: manualFigures.revenueMtd - manualFigures.expensesMtd,
        cashBalance: cashTotal,
        outstandingInvoices: pendingTotal || manualFigures.outstandingInvoices,
      };

  const revenueSeries = useMemo(() => buildRevenueSeries(connected ? dashboard : null), [connected, dashboard]);
  const maxRevenue = Math.max(1, ...revenueSeries.map((p) => p.value));

  const spendingByCategory = useMemo(() => {
    const totals = new Map();
    unifiedTx.forEach((t) => {
      if (t.amount >= 0) return;
      totals.set(t.category, (totals.get(t.category) || 0) + Math.abs(t.amount));
    });
    const rows = [...totals.entries()].map(([label, value]) => ({ label, value }));
    rows.sort((a, b) => b.value - a.value);
    return rows.slice(0, 6);
  }, [unifiedTx]);

  const manualAccountCount = useMemo(() => allAccounts.filter((a) => a.source === 'Manual').length, [allAccounts]);

  /* ---- Insights ---- */
  /* Top vendors by spend (money out, grouped by merchant/name). */
  const topVendors = useMemo(() => {
    const totals = new Map();
    unifiedTx.forEach((t) => {
      if (t.amount >= 0) return;
      const label = t.merchant || t.name || 'Unknown';
      totals.set(label, (totals.get(label) || 0) + Math.abs(t.amount));
    });
    return [...totals.entries()].map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value).slice(0, 6);
  }, [unifiedTx]);

  /* P&L snapshot for the last 6 months (income vs expenses from real transactions). */
  const pnl = useMemo(() => {
    let income = 0, expenses = 0;
    const from = new Date();
    from.setMonth(from.getMonth() - 6);
    unifiedTx.forEach((t) => {
      const d = t.date ? new Date(t.date) : null;
      if (d && !Number.isNaN(d.getTime()) && d < from) return;
      if (t.amount >= 0) income += t.amount; else expenses += Math.abs(t.amount);
    });
    return { income, expenses, net: income - expenses };
  }, [unifiedTx]);

  /* All-businesses breakdown: each business's manual revenue/expenses figures. */
  const byBusiness = useMemo(() => businesses.map((b) => {
    const revenue = Number(b.revenueMtd) || 0;
    const exp = Number(b.expensesMtd) || 0;
    return { id: b.id, name: b.name, industry: b.industry, revenue, expenses: exp, net: revenue - exp };
  }), [businesses]);

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */
  return (
    <div id="page-mybusiness" className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">My Business</div>
          <div className="page-subtitle">
            {isAllView
              ? `All businesses · ${businesses.length}`
              : connected
                ? companyName
                : (selectedBusiness?.name || `Dashboard for ${user?.email ? user.email.split('@')[0] : 'Your'} Business`)}
            {connected && (
              <span className="badge badge-green" style={{ marginLeft: '8px' }}>
                <i className="ti ti-plug-connected"></i> Connected
              </span>
            )}
            {!loading && !connected && (
              <span className="badge badge-gray" style={{ marginLeft: '8px' }}>QuickBooks not connected</span>
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
          <LastRefreshed onRefresh={refreshEverything} />
          <button className="btn btn-secondary btn-sm" onClick={handleSync} disabled={syncing}>
            <i className={`ti ti-refresh ${syncing ? 'spin' : ''}`}></i> {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
      </div>

      {/* Business switcher */}
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
            {businesses.length > 1 && (
              <button className={`seg-btn ${isAllView ? 'active' : ''}`} onClick={() => setSelectedId('ALL')}
                title="Track all businesses in one place">
                <i className="ti ti-layout-grid" style={{ marginRight: 4 }}></i>All businesses
              </button>
            )}
            {businesses.map((b) => (
              <button key={b.id} className={`seg-btn ${selectedBusiness?.id === b.id ? 'active' : ''}`}
                onClick={() => setSelectedId(b.id)} title={b.industry ? `${b.name} · ${b.industry}` : b.name}>
                <i className="ti ti-switch-horizontal" style={{ marginRight: 4 }}></i>{b.name}
              </button>
            ))}
          </div>
        )}

        {/* All-businesses summary chip. */}
        {isAllView && !showAddBusiness && (
          <>
            <div className="divider" style={{ margin: '14px 0' }}></div>
            <div className="list-item" style={{ padding: 0 }}>
              <div className="item-icon icon-forest"><i className="ti ti-layout-grid"></i></div>
              <div className="item-main">
                <div className="item-name">All businesses</div>
                <div className="item-sub">{businesses.length} businesses · combined accounts, transactions &amp; invoices</div>
              </div>
            </div>
          </>
        )}

        {showAddBusiness && (
          <form onSubmit={handleAddBusiness} style={{ marginTop: 4 }}>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Business name *</label>
                <input className="form-input" value={bizForm.name} onChange={(e) => setBizForm({ ...bizForm, name: e.target.value })} placeholder="e.g. Acme Ventures LLC" autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Industry</label>
                <input className="form-input" value={bizForm.industry} onChange={(e) => setBizForm({ ...bizForm, industry: e.target.value })} placeholder="e.g. Consulting" />
              </div>
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Entity type</label>
                <select className="form-select" value={bizForm.entityType} onChange={(e) => setBizForm({ ...bizForm, entityType: e.target.value })}>
                  {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">EIN (optional)</label>
                <input className="form-input" value={bizForm.ein} onChange={(e) => setBizForm({ ...bizForm, ein: e.target.value })} placeholder="12-3456789" />
              </div>
            </div>
            <button type="submit" className="btn btn-primary btn-sm" disabled={!bizForm.name.trim()}>
              <i className="ti ti-plus"></i> Add business
            </button>
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
                  <button className="icon-btn" title="Delete this business" onClick={() => handleDeleteBusiness(selectedBusiness.id)}>
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
              <div className="item-sub">Link QuickBooks to auto-sync revenue, expenses, invoices, and your cash position.</div>
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
        <div className="card"><div className="empty-state"><i className="ti ti-loader spin"></i><p>Loading business data…</p></div></div>
      ) : !hasContext ? (
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-building-store"></i>
            <p style={{ fontWeight: 600, color: 'var(--tv-text-primary)', marginBottom: 4 }}>No business yet</p>
            <p style={{ marginBottom: 12 }}>Add a business, link a bank account, or connect QuickBooks to get started.</p>
            <button className="btn btn-primary" onClick={() => setShowAddBusiness(true)}><i className="ti ti-plus"></i> Add a business</button>
          </div>
        </div>
      ) : (
        <>
          {/* Hero — cash position at a glance */}
          <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid var(--tv-forest)' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <div style={{ minWidth: 220 }}>
                <div style={{ fontSize: 13, color: 'var(--tv-text-muted)', fontWeight: 500 }}>
                  {isAllView ? 'Total cash · all businesses' : 'Total business cash'}
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 700, color: 'var(--tv-text-primary)', lineHeight: 1.1, marginTop: 2 }}>
                  {currency(cashTotal)}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--tv-text-muted)', marginTop: 6 }}>
                  {bankAccounts.length} cash account{bankAccounts.length === 1 ? '' : 's'}
                  {creditCards.length > 0 ? ` · ${currency(creditOwed)} owed on ${creditCards.length} card${creditCards.length === 1 ? '' : 's'}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
                <HeroStat label="Net position" value={currency(cashTotal - creditOwed)} tone={cashTotal - creditOwed >= 0 ? 'pos' : 'neg'} />
                <HeroStat label="Deposits (MTD)" value={currency(depositsMtd)} />
                <HeroStat label="Net cash flow · 6mo" value={`${cashFlowNet >= 0 ? '+' : ''}${currency(cashFlowNet)}`} tone={cashFlowNet >= 0 ? 'pos' : 'neg'} />
              </div>
            </div>
          </div>

          {/* KPI Row */}
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-label"><i className="ti ti-arrow-up" style={{ fontSize: '13px', color: 'var(--tv-positive)' }}></i> Revenue (MTD)</div>
              <div className="kpi-value">{currency(kpi.revenueMtd)}</div>
              {connected ? (
                <div className={`kpi-delta ${changePct >= 0 ? 'pos' : 'neg'}`}>
                  <i className={changePct >= 0 ? 'ti ti-arrow-up-right' : 'ti ti-arrow-down-right'}></i>
                  {changePct >= 0 ? '+' : ''}{changePct.toFixed(1)}% vs last month
                </div>
              ) : (<div className="kpi-delta" style={{ color: 'var(--tv-text-muted)' }}>Connect to track changes</div>)}
            </div>
            <div className="kpi-card">
              <div className="kpi-label"><i className="ti ti-arrow-down" style={{ fontSize: '13px', color: 'var(--tv-negative)' }}></i> Expenses (MTD)</div>
              <div className="kpi-value">{currency(kpi.expensesMtd)}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label"><i className="ti ti-chart-line" style={{ fontSize: '13px', color: 'var(--tv-forest-light)' }}></i> Net Profit (MTD)</div>
              <div className="kpi-value">{currency(kpi.netProfitMtd)}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label"><i className="ti ti-file-invoice" style={{ fontSize: '13px', color: 'var(--tv-forest-light)' }}></i> Outstanding Invoices</div>
              <div className="kpi-value">{currency(kpi.outstandingInvoices)}</div>
            </div>
          </div>

          {/* Cash flow — money in vs money out (last 6 months) */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="section-header">
              <div className="section-title">
                <i className="ti ti-chart-bar" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>
                Cash flow
                <span className={`badge ${cashFlowNet >= 0 ? 'badge-green' : 'badge-red'}`} style={{ marginLeft: 8 }}>
                  Net {cashFlowNet >= 0 ? '+' : ''}{currency(cashFlowNet)}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--tv-text-muted)' }}>
                <span><i className="ti ti-square-rounded-filled" style={{ color: 'var(--tv-positive)' }}></i> In</span>
                <span><i className="ti ti-square-rounded-filled" style={{ color: 'var(--tv-negative)' }}></i> Out</span>
                <span className="badge badge-gray">Last 6 months</span>
              </div>
            </div>
            {cashFlowHasData ? (
              <CashFlowChart series={cashFlowSeries} />
            ) : (
              <div className="empty-state" style={{ padding: 24 }}>
                <i className="ti ti-chart-bar"></i>
                <p>No transaction activity yet. Link a business account or add transactions to see cash flow.</p>
              </div>
            )}
          </div>

          {/* All-businesses breakdown — each business at a glance */}
          {isAllView && byBusiness.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="section-header">
                <div className="section-title">
                  <i className="ti ti-layout-grid" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>
                  By business
                </div>
                <span className="badge badge-gray">Revenue &amp; expenses (MTD)</span>
              </div>
              <div className="table-scroll">
                <table className="tv-table">
                  <thead>
                    <tr>
                      <th>Business</th>
                      <th style={{ textAlign: 'right' }}>Revenue</th>
                      <th style={{ textAlign: 'right' }}>Expenses</th>
                      <th style={{ textAlign: 'right' }}>Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byBusiness.map((b) => (
                      <tr key={b.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedId(b.id)} title={`View ${b.name}`}>
                        <td style={{ fontWeight: 500 }}>
                          {b.name}
                          {b.industry && <div className="item-sub" style={{ fontWeight: 400 }}>{b.industry}</div>}
                        </td>
                        <td style={{ textAlign: 'right' }}><span className="item-amount">{currency(b.revenue)}</span></td>
                        <td style={{ textAlign: 'right' }}><span className="item-amount amount-neg">{currency(b.expenses)}</span></td>
                        <td style={{ textAlign: 'right' }}>
                          <span className={`item-amount ${b.net >= 0 ? 'amount-pos' : 'amount-neg'}`}>{currency(b.net)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Connected accounts overview */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="section-header">
              <div className="section-title">
                <i className="ti ti-building-bank" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>
                Connected accounts
                <span className="badge badge-gray" style={{ marginLeft: 8 }}>
                  {currency(cashTotal)} cash{creditCards.length > 0 ? ` · ${currency(creditOwed)} owed` : ''}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <PlaidLinkButton onLinkSuccess={refreshEverything}>
                  <i className="ti ti-plug"></i> Link account
                </PlaidLinkButton>
                {hasAnyLinked && selectedBusiness && (
                  <button className="btn btn-secondary btn-sm" onClick={() => (showAssign ? setShowAssign(false) : openAssign())}
                    title="Choose which linked accounts are business">
                    <i className={`ti ${showAssign ? 'ti-x' : 'ti-adjustments'}`}></i>
                    {showAssign ? ' Cancel' : ' Edit accounts'}
                  </button>
                )}
                <button className="btn btn-secondary btn-sm" onClick={() => setShowAddAccount((v) => !v)}>
                  <i className={`ti ${showAddAccount ? 'ti-x' : 'ti-plus'}`}></i>
                  {showAddAccount ? ' Cancel' : ' Add manual account'}
                </button>
              </div>
            </div>

            {hasLinked && !showAssign && (
              <div className="item-sub" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <i className="ti ti-refresh" style={{ color: 'var(--tv-positive)' }}></i>
                {usingAutoDetect
                  ? 'Business accounts are auto-detected and sync automatically.'
                  : 'Showing your chosen business accounts; they sync automatically.'}
                {' '}Use “Sync now” to pull the latest.
                {hasAnyLinked && selectedBusiness && (
                  <button onClick={openAssign}
                    style={{ background: 'none', border: 'none', padding: 0, color: 'var(--tv-forest)', cursor: 'pointer', fontWeight: 600 }}>
                    {usingAutoDetect ? 'Pick manually' : 'Edit selection'}
                  </button>
                )}
              </div>
            )}

            {/* Assignment picker: choose which linked accounts belong to this business. */}
            {showAssign && (
              <div style={{ marginBottom: 16 }}>
                <div className="item-sub" style={{ marginBottom: 10 }}>
                  Business accounts are auto-detected. Tick to override which linked accounts belong to <strong>{selectedBusiness?.name || 'this business'}</strong> — only these (plus manual accounts) show here.
                </div>
                {availableLinked.length === 0 ? (
                  <div className="empty-state" style={{ padding: '20px' }}>
                    <i className="ti ti-link-off"></i>
                    <p>No linked accounts yet. Link a bank/credit account from the Accounts page first.</p>
                  </div>
                ) : (
                  <>
                    <div className="card-grid">
                      {availableLinked.map((a) => {
                        const checked = assignDraft.has(String(a.rawId));
                        const v = accountVisual(a.type);
                        return (
                          <button key={a.key} type="button" onClick={() => toggleAssignDraft(a.rawId)}
                            className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', textAlign: 'left',
                              boxShadow: checked ? '0 0 0 2px var(--tv-forest)' : undefined }}>
                            <div className={`tv-checkbox ${checked ? 'checked' : ''}`}>{checked && <i className="ti ti-check"></i>}</div>
                            <div className={`item-icon ${v.tone}`}><i className={`ti ${v.icon}`}></i></div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className="item-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {a.name}{a.mask ? ` ••${a.mask}` : ''}
                              </div>
                              <div className="item-sub">{accountTypeLabel(a.type)}{a.institution ? ` · ${a.institution}` : ''} · {currency(a.balance)}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                      <button className="btn btn-primary btn-sm" onClick={saveAssign} disabled={savingAssign}>
                        <i className={`ti ${savingAssign ? 'ti-loader spin' : 'ti-check'}`}></i> {savingAssign ? ' Saving…' : ` Save (${assignDraft.size} selected)`}
                      </button>
                      {!usingAutoDetect && (
                        <button className="btn btn-secondary btn-sm" onClick={resetAssignToAuto} disabled={savingAssign} title="Clear manual selection and auto-detect business accounts">
                          <i className="ti ti-wand"></i> Reset to auto-detect
                        </button>
                      )}
                      <button className="btn btn-secondary btn-sm" onClick={() => setShowAssign(false)}>Cancel</button>
                    </div>
                  </>
                )}
              </div>
            )}

            {showAddAccount && (
              <form onSubmit={handleAddAccount} style={{ marginBottom: 16 }}>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Account name *</label>
                    <input className="form-input" value={acctForm.name} onChange={(e) => setAcctForm({ ...acctForm, name: e.target.value })} placeholder="e.g. Operating Checking" autoFocus />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Institution</label>
                    <input className="form-input" value={acctForm.institution} onChange={(e) => setAcctForm({ ...acctForm, institution: e.target.value })} placeholder="e.g. Chase" />
                  </div>
                </div>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Type</label>
                    <select className="form-select" value={acctForm.type} onChange={(e) => setAcctForm({ ...acctForm, type: e.target.value })}>
                      {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{accountTypeLabel(normType(t))}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">{acctForm.type === 'CREDIT_CARD' ? 'Current balance owed' : 'Balance'}</label>
                    <input className="form-input" type="number" step="0.01" value={acctForm.balance} onChange={(e) => setAcctForm({ ...acctForm, balance: e.target.value })} placeholder="0.00" />
                  </div>
                </div>
                {acctForm.type === 'CREDIT_CARD' && (
                  <div className="grid-2">
                    <div className="form-group">
                      <label className="form-label">Credit limit</label>
                      <input className="form-input" type="number" step="0.01" value={acctForm.creditLimit} onChange={(e) => setAcctForm({ ...acctForm, creditLimit: e.target.value })} placeholder="e.g. 25000" />
                    </div>
                  </div>
                )}
                <button type="submit" className="btn btn-primary btn-sm" disabled={!acctForm.name.trim() || !selectedBusiness}>
                  <i className="ti ti-plus"></i> Add account
                </button>
                {!selectedBusiness && <div className="item-sub" style={{ marginTop: 6 }}>Add a business first to attach manual accounts.</div>}
              </form>
            )}

            {allAccounts.length === 0 ? (
              <div className="empty-state">
                <i className="ti ti-building-bank"></i>
                {hasAnyLinked ? (
                  <>
                    <p style={{ fontWeight: 600, color: 'var(--tv-text-primary)', marginBottom: 4 }}>No business accounts selected</p>
                    <p style={{ marginBottom: 12 }}>You have linked accounts — choose which ones belong to this business.</p>
                    <button className="btn btn-primary" onClick={openAssign} disabled={!selectedBusiness}>
                      <i className="ti ti-link"></i> Assign accounts
                    </button>
                  </>
                ) : (
                  <p>No accounts yet. Link a bank/credit account from the Accounts page, or add a manual account here.</p>
                )}
              </div>
            ) : (
              <div className="card-grid">
                {allAccounts.map((a) => (
                  <AccountCard key={a.key} account={a}
                    active={fAccount === a.key}
                    onView={() => { setFAccount(a.key); setActiveTab('tx'); requestAnimationFrame(() => txSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }}
                    onAddTx={a.source === 'Manual' ? () => openAddTx(a.key) : null}
                    onDelete={a.canDelete ? () => handleDeleteAccount(a.rawId) : null}
                    onUnlink={a.source === 'Linked' && a.plaidItemId ? () => handleUnlink(a) : null}
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
          {/* TAB — Transactions (auto-synced + manual, comprehensive)     */}
          {/* ============================================================ */}
          {activeTab === 'tx' && (
            <>
              {/* Filtered totals */}
              <div className="kpi-grid" style={{ marginBottom: 16 }}>
                <div className="kpi-card">
                  <div className="kpi-label"><i className="ti ti-arrow-down-left" style={{ color: 'var(--tv-positive)' }}></i> Money In</div>
                  <div className="kpi-value">{currency(txTotals.moneyIn)}</div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-label"><i className="ti ti-arrow-up-right" style={{ color: 'var(--tv-negative)' }}></i> Money Out</div>
                  <div className="kpi-value">{currency(Math.abs(txTotals.moneyOut))}</div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-label"><i className="ti ti-equal" style={{ color: 'var(--tv-forest-light)' }}></i> Net</div>
                  <div className="kpi-value">{currency(txTotals.net)}</div>
                  <div className={`kpi-delta ${txTotals.net >= 0 ? 'pos' : 'neg'}`}>
                    <i className="ti ti-list"></i> {txTotals.count} transaction{txTotals.count === 1 ? '' : 's'}
                  </div>
                </div>
              </div>

              <div className="card" ref={txSectionRef}>
                <div className="section-header">
                  <div className="section-title">
                    <i className="ti ti-arrows-exchange" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>
                    Transactions
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary btn-sm" onClick={exportCsv} disabled={sortedTx.length === 0} title="Export current view to CSV">
                      <i className="ti ti-download"></i> Export
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => (showAddTx ? setShowAddTx(false) : openAddTx(fAccount !== 'ALL' ? fAccount : null))}
                      disabled={manualAccountCount === 0 || isAllView}
                      title={isAllView ? 'Switch to a specific business to add' : (manualAccountCount === 0 ? 'Add a manual account to log a transaction' : 'Add a manual transaction')}>
                      <i className={`ti ${showAddTx ? 'ti-x' : 'ti-plus'}`}></i>{showAddTx ? ' Cancel' : ' Add manual'}
                    </button>
                  </div>
                </div>

                {/* Quick filters — the common views at a glance. */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  {[
                    { label: 'All', icon: 'ti-list', active: fDirection === 'ALL' && fType === 'ALL', on: () => { setFDirection('ALL'); setFType('ALL'); } },
                    { label: 'Deposits', icon: 'ti-arrow-down-left', active: fDirection === 'IN', on: () => { setFDirection('IN'); setFType('ALL'); } },
                    { label: 'Payments', icon: 'ti-arrow-up-right', active: fDirection === 'OUT' && fType === 'ALL', on: () => { setFDirection('OUT'); setFType('ALL'); } },
                    { label: 'Transfers', icon: 'ti-arrows-exchange', active: fType === 'Transfer', on: () => { setFType('Transfer'); setFDirection('ALL'); } },
                    { label: 'Refunds', icon: 'ti-receipt-refund', active: fType === 'Refund', on: () => { setFType('Refund'); setFDirection('ALL'); } },
                    { label: 'Tax', icon: 'ti-building-bank', active: fType === 'Tax', on: () => { setFType('Tax'); setFDirection('ALL'); } },
                  ].map((c) => (
                    <button key={c.label} onClick={c.on} className={`seg-btn ${c.active ? 'active' : ''}`}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '7px 14px',
                        border: `1px solid ${c.active ? 'var(--tv-forest)' : 'var(--tv-border)'}`,
                        background: c.active ? 'var(--tv-forest)' : 'var(--tv-surface)',
                        color: c.active ? '#fff' : 'var(--tv-text-primary)', cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>
                      <i className={`ti ${c.icon}`}></i> {c.label}
                    </button>
                  ))}
                </div>

                {/* Filter bar (row 1): search + account + category + type + status + direction */}
                <div className="filter-bar">
                  <div className="filter-search">
                    <i className="ti ti-search"></i>
                    <input type="text" placeholder="Search description, merchant, or category…" value={search} onChange={(e) => setSearch(e.target.value)} />
                  </div>
                  <select className="form-select filter-select" value={fAccount} onChange={(e) => setFAccount(e.target.value)} title="Account">
                    <option value="ALL">All accounts</option>
                    {creditCards.length > 0 && (
                      <optgroup label="Credit cards">
                        {creditCards.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
                      </optgroup>
                    )}
                    {bankAccounts.length > 0 && (
                      <optgroup label="Bank accounts">
                        {bankAccounts.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}
                      </optgroup>
                    )}
                    {allAccounts.filter((a) => !isBankType(a.type) && !isCardType(a.type)).length > 0 && (
                      <optgroup label="Other">
                        {allAccounts.filter((a) => !isBankType(a.type) && !isCardType(a.type)).map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}
                      </optgroup>
                    )}
                  </select>
                  <select className="form-select filter-select" value={fCategory} onChange={(e) => setFCategory(e.target.value)} title="Category">
                    {categoryOptions.map((c) => <option key={c} value={c}>{c === 'ALL' ? 'All categories' : c}</option>)}
                  </select>
                  <select className="form-select filter-select" value={fType} onChange={(e) => setFType(e.target.value)} title="Type">
                    {typeOptions.map((t) => <option key={t} value={t}>{t === 'ALL' ? 'All types' : t}</option>)}
                  </select>
                  <select className="form-select filter-select" value={fStatus} onChange={(e) => setFStatus(e.target.value)} title="Status">
                    {['ALL', 'Pending', 'Cleared', 'Reconciled'].map((s) => <option key={s} value={s}>{s === 'ALL' ? 'All statuses' : s}</option>)}
                  </select>
                  <div className="seg-control">
                    {['ALL', 'IN', 'OUT'].map((d) => (
                      <button key={d} className={`seg-btn ${fDirection === d ? 'active' : ''}`} onClick={() => setFDirection(d)}>
                        {d === 'ALL' ? 'All' : d === 'IN' ? 'In' : 'Out'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Filter bar (row 2): date + amount range */}
                <div className="filter-bar" style={{ marginTop: 10, flexWrap: 'wrap', gap: 10 }}>
                  {tagOptions.length > 1 && (
                    <select className="form-select filter-select" value={fTag} onChange={(e) => setFTag(e.target.value)} title="Tag">
                      {tagOptions.map((tg) => <option key={tg} value={tg}>{tg === 'ALL' ? 'All tags' : `#${tg}`}</option>)}
                    </select>
                  )}
                  <select className="form-select filter-select" value={dateRange} onChange={(e) => setDateRange(e.target.value)} title="Date range">
                    {DATE_RANGES.map((r) => (
                      <option key={r} value={r}>
                        {r === 'All' ? 'All time' : r === 'Custom' ? 'Custom range…' : `Last ${r.replace('1W', '1 week').replace('1M', '1 month').replace('3M', '3 months').replace('1Y', '1 year')}`}
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

                {/* Add manual transaction */}
                {showAddTx && (
                  <form onSubmit={handleAddTx} style={{ margin: '14px 0' }}>
                    <div className="grid-2">
                      <div className="form-group">
                        <label className="form-label">Account *</label>
                        <select className="form-select" value={txForm.accountKey} onChange={(e) => setTxForm({ ...txForm, accountKey: e.target.value })}>
                          {allAccounts.filter((a) => a.source === 'Manual').map((a) => (
                            <option key={a.key} value={a.key}>{a.name} · {accountTypeLabel(a.type)}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Date</label>
                        <input className="form-input" type="date" value={txForm.date} onChange={(e) => setTxForm({ ...txForm, date: e.target.value })} />
                      </div>
                    </div>
                    <div className="grid-2">
                      <div className="form-group">
                        <label className="form-label">Description *</label>
                        <input className="form-input" value={txForm.description} onChange={(e) => setTxForm({ ...txForm, description: e.target.value })} placeholder="e.g. AWS invoice" autoFocus />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Merchant</label>
                        <input className="form-input" value={txForm.merchant} onChange={(e) => setTxForm({ ...txForm, merchant: e.target.value })} placeholder="e.g. Amazon Web Services" />
                      </div>
                    </div>
                    <div className="grid-3">
                      <div className="form-group">
                        <label className="form-label">Category</label>
                        <select className="form-select" value={txForm.category} onChange={(e) => setTxForm({ ...txForm, category: e.target.value })}>
                          {TX_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Direction</label>
                        <select className="form-select" value={txForm.direction} onChange={(e) => setTxForm({ ...txForm, direction: e.target.value })}>
                          <option value="out">Money out (charge / expense)</option>
                          <option value="in">Money in (deposit / payment)</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Amount *</label>
                        <input className="form-input" type="number" step="0.01" min="0" value={txForm.amount} onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })} placeholder="0.00" />
                      </div>
                    </div>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={!txForm.description.trim() || !(Number(txForm.amount) > 0)}>
                      <i className="ti ti-plus"></i> Add transaction
                    </button>
                  </form>
                )}

                {unifiedTx.length === 0 ? (
                  <div className="empty-state">
                    <i className="ti ti-arrows-exchange"></i>
                    <p style={{ fontWeight: 600, color: 'var(--tv-text-primary)', marginBottom: 4 }}>No transactions yet</p>
                    <p>Link a bank or credit account to auto-sync activity, or add a manual transaction.</p>
                  </div>
                ) : sortedTx.length === 0 ? (
                  <div className="empty-state"><i className="ti ti-filter-off"></i><p>No transactions match your filters.</p></div>
                ) : (
                  <div className="table-scroll" style={{ marginTop: 4 }}>
                    <table className="tv-table">
                      <thead>
                        <tr>
                          <SortableTh k="name" label="Description" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                          {fAccount === 'ALL' && <th>Account</th>}
                          <SortableTh k="category" label="Category" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                          <th>Type</th>
                          <th>Status</th>
                          <SortableTh k="date" label="Date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                          <SortableTh k="amount" label="Amount" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                          <th style={{ width: 70 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedTx.map((t) => {
                          const v = txTypeVisual(t.type);
                          const colSpan = fAccount === 'ALL' ? 8 : 7;
                          return (
                            <Fragment key={t.key}>
                              <tr>
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div className={`item-icon ${v.tone}`} style={{ width: 32, height: 32, fontSize: 15 }}><i className={`ti ${v.icon}`}></i></div>
                                    <div>
                                      <div style={{ fontWeight: 500 }}>{t.name}</div>
                                      {t.merchant && t.merchant !== t.name && <div className="item-sub">{t.merchant}</div>}
                                      {t.tags.length > 0 && (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
                                          {t.tags.map((tag) => (
                                            <button key={tag} className="badge badge-gold" onClick={() => setFTag(tag)} title={`Filter by #${tag}`}
                                              style={{ border: 'none', cursor: 'pointer' }}>#{tag}</button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                {fAccount === 'ALL' && (
                                  <td>
                                    {t.acct ? (
                                      <button className="badge badge-gray" onClick={() => setFAccount(t.acctKey)} title={`Show only ${t.acct.name}`}
                                        style={{ border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                        <i className={`ti ${accountVisual(t.acct.type).icon}`} style={{ fontSize: 13 }}></i> {t.acct.name}
                                      </button>
                                    ) : (<span style={{ color: 'var(--tv-text-muted)' }}>—</span>)}
                                  </td>
                                )}
                                <td><span className="badge badge-gray">{t.category}</span></td>
                                <td>
                                  <span className={`badge ${t.typeOverridden ? 'badge-forest' : 'badge-gray'}`}
                                    title={t.typeOverridden ? `Overridden (auto: ${t.derivedType})` : 'Auto-classified'}>
                                    {t.typeOverridden && <i className="ti ti-pencil" style={{ fontSize: 10 }}></i>} {t.type}
                                  </span>
                                </td>
                                <td><span className={`badge ${txStatusBadge(t.status)}`}>{t.status}</span></td>
                                <td style={{ color: 'var(--tv-text-muted)', whiteSpace: 'nowrap' }}>{bizDate(t.date)}</td>
                                <td style={{ textAlign: 'right' }}>
                                  <span className={`item-amount ${t.amount >= 0 ? 'amount-pos' : 'amount-neg'}`}>
                                    {t.amount >= 0 ? '+' : ''}{currency(t.amount)}
                                  </span>
                                </td>
                                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                  <button className="icon-btn" title="Edit type & tags" onClick={() => openEditOverride(t)}>
                                    <i className="ti ti-tag"></i>
                                  </button>
                                  <button className="icon-btn" title={t.status === 'Reconciled' ? 'Un-reconcile' : 'Mark reconciled'}
                                    onClick={() => handleReconcileToggle(t)}>
                                    <i className={`ti ${t.status === 'Reconciled' ? 'ti-checks' : 'ti-check'}`}
                                      style={{ color: t.status === 'Reconciled' ? 'var(--tv-positive)' : undefined }}></i>
                                  </button>
                                  {t.canDelete && (
                                    <button className="icon-btn" title="Delete transaction" onClick={() => handleDeleteTx(t)}>
                                      <i className="ti ti-trash"></i>
                                    </button>
                                  )}
                                </td>
                              </tr>
                              {editingKey === t.key && (
                                <tr>
                                  <td colSpan={colSpan} style={{ background: 'var(--tv-bg)' }}>
                                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', padding: '4px 2px 8px' }}>
                                      <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">Type</label>
                                        <select className="form-select" value={editForm.type} onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}>
                                          <option value="">Auto ({t.derivedType})</option>
                                          {ASSIGNABLE_TYPES.map((x) => <option key={x} value={x}>{x}</option>)}
                                        </select>
                                      </div>
                                      <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 220 }}>
                                        <label className="form-label">Tags (comma-separated)</label>
                                        <input className="form-input" value={editForm.tags} onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
                                          placeholder="e.g. deductible, q3, client-acme" />
                                      </div>
                                      <button className="btn btn-primary btn-sm" onClick={() => saveOverride(t)}><i className="ti ti-check"></i> Save</button>
                                      <button className="btn btn-secondary btn-sm" onClick={() => setEditingKey(null)}><i className="ti ti-x"></i> Cancel</button>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ============================================================ */}
          {/* TAB — Credit Card & Expenses                                 */}
          {/* ============================================================ */}
          {activeTab === 'cards' && (
            <>
              <div className="grid-2" style={{ marginBottom: 16 }}>
                <div className="card">
                  <div className="section-header">
                    <div className="section-title"><i className="ti ti-credit-card" style={{ marginRight: 6, color: 'var(--tv-warning)' }}></i>Credit cards</div>
                  </div>
                  {creditCards.length === 0 ? (
                    <div className="empty-state"><i className="ti ti-credit-card"></i><p>No credit card yet. Link one from the Accounts page or add one manually above.</p></div>
                  ) : (
                    creditCards.map((c) => <CreditCardPanel key={c.key} card={c}
                      onViewCharges={() => { setFAccount(c.key); setActiveTab('tx'); requestAnimationFrame(() => txSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }} />)
                  )}
                </div>

                <div className="card">
                  <div className="section-header">
                    <div className="section-title"><i className="ti ti-chart-donut" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>Spending by category</div>
                    <span className="badge badge-gray">All accounts</span>
                  </div>
                  {spendingByCategory.length === 0 ? (
                    <div className="empty-state"><i className="ti ti-chart-donut"></i><p>No spend recorded yet.</p></div>
                  ) : (<CategoryBars rows={spendingByCategory} />)}
                </div>
              </div>

              {/* Insights: P&L snapshot + top vendors */}
              <div className="grid-2" style={{ marginBottom: 16 }}>
                <div className="card">
                  <div className="section-header">
                    <div className="section-title"><i className="ti ti-report-money" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>P&amp;L snapshot</div>
                    <span className="badge badge-gray">Last 6 months</span>
                  </div>
                  <div className="list-item" style={{ padding: '8px 0' }}>
                    <div className="item-icon icon-green"><i className="ti ti-arrow-down-left"></i></div>
                    <div className="item-main"><div className="item-name">Income</div></div>
                    <div className="item-right"><div className="item-amount amount-pos">{currency(pnl.income)}</div></div>
                  </div>
                  <div className="list-item" style={{ padding: '8px 0' }}>
                    <div className="item-icon icon-red"><i className="ti ti-arrow-up-right"></i></div>
                    <div className="item-main"><div className="item-name">Expenses</div></div>
                    <div className="item-right"><div className="item-amount amount-neg">{currency(pnl.expenses)}</div></div>
                  </div>
                  <div className="divider" style={{ margin: '10px 0' }}></div>
                  <div className="list-item" style={{ padding: '4px 0' }}>
                    <div className="item-icon icon-forest"><i className="ti ti-scale"></i></div>
                    <div className="item-main"><div className="item-name" style={{ fontWeight: 600 }}>Net profit</div></div>
                    <div className="item-right">
                      <div className={`item-amount ${pnl.net >= 0 ? 'amount-pos' : 'amount-neg'}`} style={{ fontSize: 16 }}>{currency(pnl.net)}</div>
                    </div>
                  </div>
                  {pnl.income === 0 && pnl.expenses === 0 && (
                    <div className="item-sub" style={{ marginTop: 8 }}>No transaction activity in the last 6 months yet.</div>
                  )}
                </div>

                <div className="card">
                  <div className="section-header">
                    <div className="section-title"><i className="ti ti-building-store" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>Top vendors</div>
                    <span className="badge badge-gray">By spend</span>
                  </div>
                  {topVendors.length === 0 ? (
                    <div className="empty-state"><i className="ti ti-building-store"></i><p>No vendor spend recorded yet.</p></div>
                  ) : (<CategoryBars rows={topVendors} />)}
                </div>
              </div>

              <div className="card" style={{ marginBottom: 16 }}>
                <div className="section-header">
                  <div className="section-title">
                    <i className="ti ti-receipt" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>
                    Expenses {connected && <span className="badge badge-green" style={{ marginLeft: 6 }}>QuickBooks</span>}
                  </div>
                </div>
                {expenses.length === 0 ? (
                  <div className="empty-state"><i className="ti ti-receipt"></i><p>No synced expenses. Connect QuickBooks to pull expense bills automatically.</p></div>
                ) : (
                  <div className="table-scroll">
                    <table className="tv-table">
                      <thead><tr><th>Vendor</th><th>Category</th><th>Date</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                      <tbody>
                        {expenses.map((exp) => (
                          <tr key={exp.id}>
                            <td style={{ fontWeight: 500 }}>{exp.vendor || '—'}</td>
                            <td><span className="badge badge-gray">{exp.category || 'Uncategorized'}</span></td>
                            <td style={{ color: 'var(--tv-text-muted)' }}>{bizDate(exp.date)}</td>
                            <td style={{ textAlign: 'right' }}><span className="item-amount amount-neg">{currency(exp.amount)}</span></td>
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
          {/* TAB — Business Tools                                         */}
          {/* ============================================================ */}
          {activeTab === 'tools' && (
            <>
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="section-header">
                  <div className="section-title"><i className="ti ti-bolt" style={{ marginRight: 6, color: 'var(--tv-gold)' }}></i>Quick actions</div>
                </div>
                <div className="card-grid">
                  <QuickAction icon="ti-file-invoice" tone="icon-blue" label="Create invoice" desc="Bill a customer" onClick={() => setShowAddInvoice(true)} />
                  <QuickAction icon="ti-cash-register" tone="icon-green" label="Record payment" desc="Mark an invoice paid" onClick={() => document.getElementById('mb-invoices')?.scrollIntoView({ behavior: 'smooth' })} />
                  <QuickAction icon="ti-arrows-exchange" tone="icon-forest" label="Add transaction" desc="Log a charge or deposit" onClick={() => openAddTx(null)} />
                  <QuickAction icon="ti-building-bank" tone="icon-forest" label="Add manual account" desc="Bank or credit card" onClick={() => setShowAddAccount(true)} />
                  <QuickAction icon="ti-plug" tone="icon-amber" label={connected ? 'QuickBooks synced' : 'Connect QuickBooks'} desc={connected ? 'Auto-sync on' : 'Auto-sync your books'} onClick={connected ? handleSync : handleConnect} />
                  <QuickAction icon="ti-report-analytics" tone="icon-purple" label="Revenue trend" desc="Last 6 months" onClick={() => document.getElementById('mb-revenue')?.scrollIntoView({ behavior: 'smooth' })} />
                </div>
              </div>

              <div className="card" style={{ marginBottom: 16 }}>
                <div className="section-header">
                  <div className="section-title">
                    <i className="ti ti-clock-dollar" style={{ marginRight: 6, color: 'var(--tv-warning)' }}></i>
                    Pending payments
                    <span className="badge badge-amber" style={{ marginLeft: 8 }}>{currency(pendingTotal)} due</span>
                  </div>
                </div>
                {pendingInvoices.length === 0 ? (
                  <div className="empty-state"><i className="ti ti-checks"></i><p>No pending payments — you're all caught up.</p></div>
                ) : (
                  <div>
                    {pendingInvoices.map((i) => (
                      <div key={i.key} className="list-item">
                        <div className={`item-icon ${i.status === 'OVERDUE' ? 'icon-red' : 'icon-amber'}`}><i className="ti ti-file-invoice"></i></div>
                        <div className="item-main">
                          <div className="item-name">{i.customer}</div>
                          <div className="item-sub">
                            <span className={`badge ${statusBadge(i.status)}`}>{i.status}</span>
                            {i.dueDate ? ` · Due ${bizDate(i.dueDate)}` : ''}{!i.manual ? ' · QuickBooks' : ''}
                          </div>
                        </div>
                        <div className="item-right" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div className="item-amount">{currency(i.amount)}</div>
                          {i.manual && (
                            <button className="btn btn-secondary btn-sm" onClick={() => handleMarkInvoicePaid(i.id)}><i className="ti ti-check"></i> Mark paid</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="card" id="mb-invoices" style={{ marginBottom: 16 }}>
                <div className="section-header">
                  <div className="section-title"><i className="ti ti-file-invoice" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>Invoices</div>
                  <button className="btn btn-secondary btn-sm" onClick={() => setShowAddInvoice((v) => !v)}>
                    <i className={`ti ${showAddInvoice ? 'ti-x' : 'ti-plus'}`}></i>{showAddInvoice ? ' Cancel' : ' Create invoice'}
                  </button>
                </div>

                {showAddInvoice && (
                  <form onSubmit={handleAddInvoice} style={{ marginBottom: 14 }}>
                    <div className="grid-2">
                      <div className="form-group">
                        <label className="form-label">Customer *</label>
                        <input className="form-input" value={invForm.customer} onChange={(e) => setInvForm({ ...invForm, customer: e.target.value })} placeholder="e.g. Acme Corp" autoFocus />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Amount *</label>
                        <input className="form-input" type="number" step="0.01" min="0" value={invForm.amount} onChange={(e) => setInvForm({ ...invForm, amount: e.target.value })} placeholder="0.00" />
                      </div>
                    </div>
                    <div className="grid-2">
                      <div className="form-group">
                        <label className="form-label">Due date</label>
                        <input className="form-input" type="date" value={invForm.dueDate} onChange={(e) => setInvForm({ ...invForm, dueDate: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Status</label>
                        <select className="form-select" value={invForm.status} onChange={(e) => setInvForm({ ...invForm, status: e.target.value })}>
                          <option value="OPEN">Open</option><option value="OVERDUE">Overdue</option><option value="PAID">Paid</option>
                        </select>
                      </div>
                    </div>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={!invForm.customer.trim() || !(Number(invForm.amount) > 0) || !selectedBusiness}>
                      <i className="ti ti-send"></i> Create &amp; send
                    </button>
                    {!selectedBusiness && <div className="item-sub" style={{ marginTop: 6 }}>Add a business first to create invoices.</div>}
                  </form>
                )}

                {allInvoices.length === 0 ? (
                  <div className="empty-state"><i className="ti ti-file-invoice"></i><p>No invoices yet. Create one to bill a customer and track payment.</p></div>
                ) : (
                  <div className="table-scroll">
                    <table className="tv-table">
                      <thead><tr><th>Customer</th><th style={{ textAlign: 'right' }}>Amount</th><th>Status</th><th>Due date</th><th>Source</th><th style={{ width: 40 }}></th></tr></thead>
                      <tbody>
                        {allInvoices.map((inv) => (
                          <tr key={inv.key}>
                            <td style={{ fontWeight: 500 }}>{inv.customer || '—'}</td>
                            <td style={{ textAlign: 'right' }}><span className="item-amount">{currency(inv.amount)}</span></td>
                            <td><span className={`badge ${statusBadge(inv.status)}`}>{inv.status}</span></td>
                            <td style={{ color: 'var(--tv-text-muted)' }}>{bizDate(inv.dueDate)}</td>
                            <td><span className={`badge ${inv.manual ? 'badge-forest' : 'badge-green'}`}>{inv.manual ? 'Manual' : 'QuickBooks'}</span></td>
                            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                              {inv.manual && (
                                <button className="icon-btn" title="Delete invoice" onClick={() => handleDeleteInvoice(inv.id)}><i className="ti ti-trash"></i></button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="card" id="mb-revenue" style={{ marginBottom: 16 }}>
                <div className="section-header">
                  <div className="section-title"><i className="ti ti-chart-bar" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>Revenue trend</div>
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
/* A sortable table header cell with a direction indicator.            */
/* ------------------------------------------------------------------ */
function SortableTh({ k, label, align, sortKey, sortDir, onSort }) {
  const active = sortKey === k;
  const icon = active ? (sortDir === 'asc' ? 'ti-arrow-up' : 'ti-arrow-down') : 'ti-arrows-sort';
  return (
    <th onClick={() => onSort(k)} style={{ cursor: 'pointer', userSelect: 'none', textAlign: align || 'left', whiteSpace: 'nowrap' }}
      title={`Sort by ${label}`} aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      {label} <i className={`ti ${icon}`} style={{ fontSize: 13, opacity: active ? 0.9 : 0.35, verticalAlign: 'middle' }}></i>
    </th>
  );
}

/* ------------------------------------------------------------------ */
/* Account card — distinguishes checking / savings / credit / linked.  */
/* ------------------------------------------------------------------ */
function AccountCard({ account, active, onView, onAddTx, onDelete, onUnlink }) {
  const v = accountVisual(account.type);
  const cc = isCardType(account.type);
  const limit = account.creditLimit || 0;
  const available = account.available != null ? account.available : Math.max(0, limit - account.balance);
  const util = limit > 0 ? Math.min(100, Math.round((account.balance / limit) * 100)) : 0;
  const utilColor = util >= 80 ? 'var(--tv-negative)' : util >= 50 ? 'var(--tv-warning)' : 'var(--tv-positive)';

  return (
    <div className="card" style={{ borderTop: `3px solid ${v.accent}`, boxShadow: active ? '0 0 0 2px var(--tv-forest)' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div className={`item-icon ${v.tone}`}><i className={`ti ${v.icon}`}></i></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="item-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {account.name}{account.mask ? ` ••${account.mask}` : ''}
          </div>
          <div className="item-sub">{account.institution || accountTypeLabel(account.type)}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
          <span className={`badge ${accountTypeBadge(account.type)}`}>{accountTypeLabel(account.type)}</span>
          <span className={`badge ${account.autoSynced ? 'badge-green' : 'badge-gray'}`} title={account.autoSynced ? 'Auto-synced (linked)' : 'Manually entered'}>
            {account.autoSynced ? 'Linked' : 'Manual'}
          </span>
        </div>
      </div>

      <div className="stat-tile-label">{cc ? 'Balance owed' : 'Current balance'}</div>
      <div className="stat-tile-value" style={{ color: cc ? 'var(--tv-negative)' : 'var(--tv-text-primary)' }}>{currency(account.balance)}</div>

      {cc && limit > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--tv-text-muted)' }}>
            <span>{util}% used</span><span>{currency(available)} available</span>
          </div>
          <div className="progress-bar"><div className="progress-fill" style={{ width: `${util}%`, background: utilColor }}></div></div>
          <div style={{ fontSize: 11.5, color: 'var(--tv-text-muted)', marginTop: 4 }}>
            Limit {currency(limit)}{account.minimumPayment ? ` · Min ${currency(account.minimumPayment)}` : ''}
            {account.nextPaymentDueDate ? ` · Due ${bizDate(account.nextPaymentDueDate)}` : ''}
          </div>
        </div>
      )}
      {!cc && account.available != null && (
        <div style={{ fontSize: 11.5, color: 'var(--tv-text-muted)', marginTop: 6 }}>{currency(account.available)} available</div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn btn-secondary btn-sm" onClick={onView}><i className="ti ti-list"></i> {cc ? 'Charges' : 'Activity'}</button>
        {onAddTx && <button className="btn btn-secondary btn-sm" onClick={onAddTx}><i className="ti ti-plus"></i> Add</button>}
        {onUnlink && <button className="icon-btn" title="Unlink institution" style={{ marginLeft: 'auto' }} onClick={onUnlink}><i className="ti ti-unlink"></i></button>}
        {onDelete && <button className="icon-btn" title="Delete account" style={{ marginLeft: onUnlink ? 0 : 'auto' }} onClick={onDelete}><i className="ti ti-trash"></i></button>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Credit card detail panel (Credit Card & Expenses tab).              */
/* ------------------------------------------------------------------ */
function CreditCardPanel({ card, onViewCharges }) {
  const limit = card.creditLimit || 0;
  const available = card.available != null ? card.available : Math.max(0, limit - card.balance);
  const util = limit > 0 ? Math.min(100, Math.round((card.balance / limit) * 100)) : 0;
  const utilColor = util >= 80 ? 'var(--tv-negative)' : util >= 50 ? 'var(--tv-warning)' : 'var(--tv-positive)';
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="list-item" style={{ padding: '4px 0' }}>
        <div className="item-icon icon-amber"><i className="ti ti-credit-card"></i></div>
        <div className="item-main">
          <div className="item-name">{card.name}{card.mask ? ` ••${card.mask}` : ''}</div>
          <div className="item-sub">{card.institution || 'Credit Card'} · <span className={`badge ${card.autoSynced ? 'badge-green' : 'badge-gray'}`}>{card.autoSynced ? 'Linked' : 'Manual'}</span></div>
        </div>
        <div className="item-right"><div className="item-amount amount-neg">{currency(card.balance)}</div><div className="item-sub">owed</div></div>
      </div>
      {limit > 0 ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--tv-text-muted)', marginTop: 8 }}>
            <span>{util}% of {currency(limit)} limit</span><span>{currency(available)} available</span>
          </div>
          <div className="progress-bar"><div className="progress-fill" style={{ width: `${util}%`, background: utilColor }}></div></div>
          {(card.minimumPayment || card.nextPaymentDueDate) && (
            <div style={{ fontSize: 11.5, color: 'var(--tv-text-muted)', marginTop: 6 }}>
              {card.minimumPayment ? `Min payment ${currency(card.minimumPayment)}` : ''}
              {card.minimumPayment && card.nextPaymentDueDate ? ' · ' : ''}
              {card.nextPaymentDueDate ? `Due ${bizDate(card.nextPaymentDueDate)}` : ''}
            </div>
          )}
        </>
      ) : (<div className="item-sub" style={{ marginTop: 6 }}>Add a credit limit to see utilization.</div>)}
      <button className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={onViewCharges}><i className="ti ti-list"></i> View recent charges</button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Quick-action tile (Business Tools tab).                             */
/* ------------------------------------------------------------------ */
function HeroStat({ label, value, tone }) {
  const color = tone === 'pos' ? 'var(--tv-positive)' : tone === 'neg' ? 'var(--tv-negative)' : 'var(--tv-text-primary)';
  return (
    <div style={{ minWidth: 110 }}>
      <div style={{ fontSize: 12, color: 'var(--tv-text-muted)', fontWeight: 500 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function QuickAction({ icon, tone, label, desc, onClick }) {
  return (
    <button className="card" onClick={onClick} style={{ textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
      <div className={`item-icon ${tone}`}><i className={`ti ${icon}`}></i></div>
      <div><div className="item-name">{label}</div><div className="item-sub">{desc}</div></div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Cash-flow grouped bar chart: money in vs money out per month.       */
/* ------------------------------------------------------------------ */
function CashFlowChart({ series }) {
  const width = 620, height = 190, padBottom = 26, padTop = 10;
  const usableH = height - padBottom - padTop;
  const slot = width / series.length;
  const groupW = Math.min(64, slot * 0.6);
  const barW = groupW / 2 - 3;
  const max = Math.max(1, ...series.map((b) => Math.max(b.moneyIn, b.moneyOut)));
  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="xMidYMid meet"
        role="img" aria-label="Cash flow: money in versus money out over the last six months">
        {/* baseline */}
        <line x1="0" y1={padTop + usableH} x2={width} y2={padTop + usableH} stroke="var(--tv-border)" strokeWidth="1" />
        {series.map((b, i) => {
          const cx = i * slot + slot / 2;
          const inH = Math.max(b.moneyIn > 0 ? 2 : 0, (b.moneyIn / max) * usableH);
          const outH = Math.max(b.moneyOut > 0 ? 2 : 0, (b.moneyOut / max) * usableH);
          const inX = cx - barW - 3;
          const outX = cx + 3;
          return (
            <g key={`${b.y}-${b.m}`}>
              <rect x={inX} y={padTop + (usableH - inH)} width={barW} height={inH} rx={4} fill="var(--tv-positive)" />
              <rect x={outX} y={padTop + (usableH - outH)} width={barW} height={outH} rx={4} fill="var(--tv-negative)" />
              <text x={cx} y={height - 8} textAnchor="middle" fontSize="11" fill="var(--tv-text-muted)">{b.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Horizontal category-spend bars.                                     */
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
          <div className="progress-bar"><div className="progress-fill" style={{ width: `${(r.value / max) * 100}%`, background: 'var(--tv-forest-light)' }}></div></div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Inline SVG bar chart for the 6-month revenue trend.                */
/* ------------------------------------------------------------------ */
function RevenueBarChart({ series, max }) {
  const width = 560, height = 160, padBottom = 24, padTop = 8;
  const usableH = height - padBottom - padTop;
  const slot = width / series.length;
  const barW = Math.min(48, slot * 0.55);
  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Revenue over the last six months">
        {series.map((p, i) => {
          const h = Math.max(2, (p.value / max) * usableH);
          const x = i * slot + (slot - barW) / 2;
          const y = padTop + (usableH - h);
          const isLast = i === series.length - 1;
          return (
            <g key={p.label}>
              <rect x={x} y={y} width={barW} height={h} rx={6} fill={isLast ? 'var(--tv-forest)' : 'var(--tv-forest-light)'} opacity={isLast ? 1 : 0.75} />
              <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize="10" fill="var(--tv-text-secondary)">{compactMoney(p.value)}</text>
              <text x={x + barW / 2} y={height - 6} textAnchor="middle" fontSize="11" fill="var(--tv-text-muted)">{p.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function compactMoney(n) {
  const v = Number(n) || 0;
  if (v >= 1000) return `$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
  return `$${v}`;
}
