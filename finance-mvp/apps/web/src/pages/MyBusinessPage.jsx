import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from 'react';
import { currency, rangeStart } from '../utils/format';
import { api } from '../api';
import LastRefreshed from '../components/LastRefreshed';
import PlaidLinkButton from '../components/PlaidLinkButton';
import ExpensesTab from '../components/business/ExpensesTab';

/* ------------------------------------------------------------------ */
/* Local UI preference key (selection only; data is server-persisted)  */
/* ------------------------------------------------------------------ */
const LS_SELECTED = 'tv_business_selected';
const LS_QBO_DISMISSED = 'tv_business_qbo_prompt_dismissed';

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
  { id: 'overview', label: 'Overview', icon: 'ti-layout-dashboard' },
  { id: 'tx', label: 'Transactions', icon: 'ti-arrows-exchange' },
  { id: 'expenses', label: 'Expenses', icon: 'ti-receipt-2' },
  // Renamed from "Credit Card & Expenses": the expense analytics moved to the Expenses tab,
  // so this one is now genuinely just the cards.
  { id: 'cards', label: 'Credit Cards', icon: 'ti-credit-card' },
  { id: 'tools', label: 'Business Tools', icon: 'ti-tools' },
  { id: 'reports', label: 'Reports', icon: 'ti-report-analytics' },
  { id: 'docs', label: 'Documents', icon: 'ti-folder' },
];

/* Document types available in the per-business document center. */
const DOC_TYPES = ['INVOICE', 'RECEIPT', 'CONTRACT', 'TAX', 'STATEMENT', 'LICENSE', 'OTHER'];

/* Icon + tone for a document type (mirrors the transaction-type visual style). */
function docTypeVisual(type) {
  switch ((type || 'OTHER').toUpperCase()) {
    case 'INVOICE': return { icon: 'ti-file-invoice', tone: 'icon-blue', label: 'Invoice' };
    case 'RECEIPT': return { icon: 'ti-receipt', tone: 'icon-green', label: 'Receipt' };
    case 'CONTRACT': return { icon: 'ti-file-text', tone: 'icon-purple', label: 'Contract' };
    case 'TAX': return { icon: 'ti-report-money', tone: 'icon-amber', label: 'Tax' };
    case 'STATEMENT': return { icon: 'ti-file-dollar', tone: 'icon-blue', label: 'Statement' };
    case 'LICENSE': return { icon: 'ti-certificate', tone: 'icon-purple', label: 'License' };
    default: return { icon: 'ti-file', tone: 'icon-gray', label: 'Other' };
  }
}

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

/* Clamp a number into [lo, hi]. */
function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/* A friendly date `n` days from today (used by forecast/insight copy). */
function inDaysDate(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return bizDate(d.toISOString().slice(0, 10));
}

/* Health-score → tone/label. Shared by the gauge and the summary badge. */
function healthTone(score) {
  if (score >= 80) return { tone: 'pos', color: 'var(--tv-positive)', label: 'Strong' };
  if (score >= 65) return { tone: 'pos', color: 'var(--tv-forest-light)', label: 'Healthy' };
  if (score >= 45) return { tone: 'warn', color: 'var(--tv-warning)', label: 'Fair' };
  return { tone: 'neg', color: 'var(--tv-negative)', label: 'Needs attention' };
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
  const [notice, setNotice] = useState('');   // transient success confirmation
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [qboDismissed, setQboDismissed] = useState(() => readLS(LS_QBO_DISMISSED, false));
  const noticeTimer = useRef(null);

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
  const [bizDocuments, setBizDocuments] = useState([]);       // document center
  const [reconciledSet, setReconciledSet] = useState(() => new Set());
  /* Aggregation account ids assigned to the selected business (Set of strings). */
  const [assignedLinkedIds, setAssignedLinkedIds] = useState(() => new Set());

  /* ---- UI state ---- */
  const [activeTab, setActiveTab] = useState('overview');
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
  const [invForm, setInvForm] = useState({ customer: '', amount: '', dueDate: '', status: 'OPEN', customerEmail: '', customerPhone: '', payInstructions: '', notes: '' });
  const [sendInv, setSendInv] = useState(null);   // invoice being sent to a customer
  const [payInv, setPayInv] = useState(null);     // invoice being reconciled (record payment)
  const [reminding, setReminding] = useState(false); // bulk overdue-reminder run in progress
  const [budgets, setBudgets] = useState([]);         // [{ category, monthlyLimit }] for the selected business
  const [budgetForm, setBudgetForm] = useState({ category: '', limit: '' });
  const [goals, setGoals] = useState({ reserveTarget: 0, taxRate: 0, taxSetAside: 0 });
  const [vendorMeta, setVendorMeta] = useState([]);   // [{ vendorName, status, renewalDate, notes }]
  const [vendorEditKey, setVendorEditKey] = useState(null);
  const [vendorForm, setVendorForm] = useState({ status: 'ACTIVE', renewalDate: '', notes: '' });
  const [shareBizDoc, setShareBizDoc] = useState(null); // business document being securely shared

  const [showAddDoc, setShowAddDoc] = useState(false);
  const [docForm, setDocForm] = useState({ label: '', url: '', docType: 'INVOICE', note: '', invoiceId: '', periodYear: String(new Date().getFullYear()), periodMonth: '' });
  const [docMode, setDocMode] = useState('file');       // 'file' (upload) | 'link'
  const [docFile, setDocFile] = useState(null);         // File to upload
  const [docFileKey, setDocFileKey] = useState(0);      // bump to reset the native <input type=file>
  const [docBusinessId, setDocBusinessId] = useState(''); // target business (used in All view)
  const [uploadEnabled, setUploadEnabled] = useState(false); // GCS configured on backend
  const [savingDoc, setSavingDoc] = useState(false);
  const [fDocType, setFDocType] = useState('ALL'); // document-center type filter
  const [fDocYear, setFDocYear] = useState('ALL'); // document-center year filter (year-wise)
  const [fDocBusiness, setFDocBusiness] = useState('ALL'); // doc folder: filter to one business (All view)

  /* ---- Dashboard period selector (ledger-derived, period-aware KPIs) ---- */
  const [dashPeriod, setDashPeriod] = useState('THIS_MONTH'); // THIS_MONTH | THIS_YEAR | T12M | CUSTOM
  const [dashFrom, setDashFrom] = useState('');
  const [dashTo, setDashTo] = useState('');
  /* Authoritative one-to-one map: linked accountId(String) -> businessId. Loaded
     globally so every linked account (and its transactions) binds to exactly one
     business. Manual rows carry businessId already. */
  const [linkedOwner, setLinkedOwner] = useState(() => new Map());
  /* Which business panels are expanded in the accordion (Set of business ids). */
  const [expandedBiz, setExpandedBiz] = useState(() => new Set());

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

  /* Show a transient success confirmation (auto-dismisses). Clears any error too. */
  const flash = useCallback((msg) => {
    setError('');
    setNotice(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 3500);
  }, []);
  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);
  /* Don't let a stale error linger when the user navigates away. (The success
     notice clears itself on a timer, so it survives a same-tick business switch.) */
  useEffect(() => { setError(''); }, [selectedId, activeTab]);

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

  /* Authoritative one-to-one linked-account ownership map (accountId -> businessId),
     loaded once globally. Every place that attributes a linked account or its
     transactions to a business reads from here, so an account can only ever belong
     to one business. */
  const loadLinkedOwner = useCallback(async () => {
    try {
      const rows = await api.getAllLinkedAccounts();
      const m = new Map();
      (Array.isArray(rows) ? rows : []).forEach((r) => {
        if (r && r.accountId != null && r.businessId != null) m.set(String(r.accountId), r.businessId);
      });
      setLinkedOwner(m);
    } catch { /* non-fatal; no assignments */ }
  }, []);
  useEffect(() => { loadLinkedOwner(); }, [loadLinkedOwner]);

  /* Whether the backend has file-upload storage (GCS) configured. When off, the
     document center falls back to link-only. */
  useEffect(() => {
    (async () => {
      try {
        const cfg = await api.getBusinessDocumentConfig();
        setUploadEnabled(!!cfg?.uploadEnabled);
      } catch { setUploadEnabled(false); }
    })();
  }, []);

  useEffect(() => {
    if (!businesses.length) return;
    const keepAll = selectedId === 'ALL' && businesses.length > 1;
    if (!keepAll && !businesses.some((b) => b.id === selectedId)) { setSelectedId(businesses[0].id); return; }
    writeLS(LS_SELECTED, selectedId);
  }, [selectedId, businesses]);

  const loadBusinessDetail = useCallback(async (businessId) => {
    if (!businessId) {
      setBizAccounts([]); setBizTransactions([]); setManualInvoices([]); setBizDocuments([]); setAssignedLinkedIds(new Set());
      return;
    }
    const [acc, tx, inv, linked, docs] = await Promise.allSettled([
      api.getBusinessAccounts(businessId),
      api.getBusinessTransactions(businessId),
      api.getManualInvoices(businessId),
      api.getBusinessLinkedAccounts(businessId),
      api.getBusinessDocuments(businessId),
    ]);
    setBizAccounts(acc.status === 'fulfilled' && Array.isArray(acc.value) ? acc.value : []);
    setBizTransactions(tx.status === 'fulfilled' && Array.isArray(tx.value) ? tx.value : []);
    setManualInvoices(inv.status === 'fulfilled' && Array.isArray(inv.value) ? inv.value : []);
    setBizDocuments(docs.status === 'fulfilled' && Array.isArray(docs.value) ? docs.value : []);
    const linkedIds = linked.status === 'fulfilled' && Array.isArray(linked.value) ? linked.value.map(String) : [];
    setAssignedLinkedIds(new Set(linkedIds));
  }, []);

  /* Aggregate every business's accounts/transactions/invoices/assignments into one view. */
  const loadAllBusinessesDetail = useCallback(async (list) => {
    const biz = Array.isArray(list) ? list : [];
    if (!biz.length) {
      setBizAccounts([]); setBizTransactions([]); setManualInvoices([]); setBizDocuments([]); setAssignedLinkedIds(new Set());
      return;
    }
    const results = await Promise.allSettled(biz.flatMap((b) => [
      api.getBusinessAccounts(b.id),
      api.getBusinessTransactions(b.id),
      api.getManualInvoices(b.id),
      api.getBusinessLinkedAccounts(b.id),
      api.getBusinessDocuments(b.id),
    ]));
    const accountsAll = [], txAll = [], invAll = [], linkedAll = [], docsAll = [];
    const STRIDE = 5;
    biz.forEach((b, i) => {
      const [acc, tx, inv, linked, docs] = results.slice(i * STRIDE, i * STRIDE + STRIDE);
      if (acc.status === 'fulfilled' && Array.isArray(acc.value)) accountsAll.push(...acc.value);
      if (tx.status === 'fulfilled' && Array.isArray(tx.value)) txAll.push(...tx.value);
      if (inv.status === 'fulfilled' && Array.isArray(inv.value)) invAll.push(...inv.value);
      if (linked.status === 'fulfilled' && Array.isArray(linked.value)) {
        linked.value.map(String).forEach((id) => { linkedAll.push(id); });
      }
      if (docs.status === 'fulfilled' && Array.isArray(docs.value)) docsAll.push(...docs.value);
    });
    setBizAccounts(accountsAll); setBizTransactions(txAll); setManualInvoices(invAll); setBizDocuments(docsAll);
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
      loadLinkedOwner(),
    ]);
  }, [loadAll, loadBusinessQbo, isAllView, businesses, loadBusinessDetail, loadAllBusinessesDetail, loadReconciliations, loadOverrides, loadLinkedOwner, selectedBusiness]);

  /* After linking via Plaid, bind any brand-new account(s) to the business the user
     linked them under, so each account belongs to exactly one business without a
     separate "assign" step. (No-op in the All view, where there's no single target.) */
  const handleLinkSuccess = useCallback(async () => {
    const targetId = selectedBusiness?.id;
    const before = new Set((accounts || []).map((a) => String(a.id)));
    try {
      if (loadAll) await loadAll();
      if (targetId != null) {
        const fresh = await api.getAccounts();
        const newIds = (Array.isArray(fresh) ? fresh : [])
          .map((a) => String(a.id))
          .filter((id) => !before.has(id));
        if (newIds.length) {
          const current = await api.getBusinessLinkedAccounts(targetId).catch(() => []);
          const merged = Array.from(new Set([...(Array.isArray(current) ? current : []).map(String), ...newIds]));
          await api.setBusinessLinkedAccounts(targetId, merged);
        }
      }
    } catch { /* fall through to a normal refresh */ }
    await refreshEverything();
  }, [accounts, loadAll, selectedBusiness, refreshEverything]);

  /* ------------------------------------------------------------------ */
  /* Normalized accounts (linked + manual)                              */
  /* ------------------------------------------------------------------ */
  /* Which linked accounts count as business — STRICT one-to-one:
     an account shows under a business only if it's explicitly assigned to it
     (linkedOwner). Auto-detect (Plaid holder_category / name) is only used to
     *suggest* accounts in the assignment picker, never to display — so the same
     account can never appear under two businesses. Manual accounts are business
     by definition. */
  const autoBusinessIds = useMemo(
    () => new Set((accounts || []).filter(isBusinessLinked).map((a) => String(a.id))),
    [accounts]
  );
  const effectiveLinkedIds = useMemo(() => {
    if (isAllView) {
      // Every linked account owned by ANY business (each counted once).
      return new Set([...linkedOwner.keys()]);
    }
    // Strictly this business's owned accounts.
    const bid = selectedBusiness?.id;
    const s = new Set();
    if (bid != null) linkedOwner.forEach((owner, id) => { if (owner === bid) s.add(id); });
    return s;
  }, [isAllView, linkedOwner, selectedBusiness]);
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
      source: 'Manual', id: t.id, businessId: t.businessId,
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
      // Attribute to a business: manual tx carry businessId; linked tx resolve via
      // the assigned-account -> business map (used by the consolidated breakdown).
      const businessId = t.source === 'Manual'
        ? (t.businessId ?? null)
        : (linkedOwner.get(String(t.accountId)) ?? null);
      return {
        key: `${t.source}-${t.id}`,
        extId, source: t.source, rawId: t.id, businessId,
        name, merchant: t.merchantName || null,
        amount, date: t.date, category,
        type, derivedType, typeOverridden: !!ov?.type, tags, status,
        acctKey, acct,
        canDelete: t.source === 'Manual',
      };
    });
  }, [transactions, bizTransactions, effectiveLinkedIds, resolveAcctKey, accountByKey, reconciledSet, overridesMap, linkedOwner]);

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
      flash(`"${name}" added — track its P&L, accounts and invoices.`);
    } catch (err) { setError(err?.message || 'Could not add business.'); }
  }
  async function handleDeleteBusiness(id) {
    const b = businesses.find((x) => x.id === id);
    const name = b?.name || 'this business';
    if (!window.confirm(`Delete "${name}"?\n\nThis permanently removes its accounts, transactions, invoices and documents. This cannot be undone.`)) return;
    try {
      await api.deleteManualBusiness(id);
      setBusinesses((prev) => prev.filter((b) => b.id !== id));
      flash(`"${name}" deleted.`);
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
      flash(`Account "${name}" added.`);
    } catch (err) { setError(err?.message || 'Could not add account.'); }
  }
  async function handleDeleteAccount(rawId) {
    const acct = (bizAccounts || []).find((a) => a.id === rawId);
    const name = acct?.name || 'this account';
    if (!window.confirm(`Delete "${name}"?\n\nIts transactions on this business will be removed too.`)) return;
    try {
      await api.deleteBusinessAccount(rawId);
      setBizAccounts((prev) => prev.filter((a) => a.id !== rawId));
      setBizTransactions((prev) => prev.filter((t) => String(t.accountId) !== String(rawId)));
      flash(`"${name}" removed.`);
    } catch (err) { setError(err?.message || 'Could not delete account.'); }
  }

  /* ---- Linked-account assignment ---- */
  function openAssign() {
    // Seed with this business's current accounts; if it has none yet, pre-tick the
    // auto-detected business-looking accounts as a suggestion (the user confirms).
    const seed = effectiveLinkedIds.size > 0 ? effectiveLinkedIds : autoBusinessIds;
    setAssignDraft(new Set(seed));
    setShowAssign(true);
  }
  /* Revert to auto-detect: clear explicit assignment for this business. */
  async function resetAssignToAuto() {
    if (!selectedBusiness) return;
    setSavingAssign(true);
    try {
      await api.setBusinessLinkedAccounts(selectedBusiness.id, []);
      setAssignedLinkedIds(new Set());
      await loadLinkedOwner();
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
      // Assignment is one-to-one and may have moved accounts off other businesses —
      // reload the authoritative global map so every view reflects the new owner.
      await loadLinkedOwner();
      setShowAssign(false);
      flash(`${ids.length} account${ids.length === 1 ? '' : 's'} assigned to ${selectedBusiness.name}.`);
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
      flash(`${txForm.direction === 'in' ? 'Deposit' : 'Expense'} of ${currency(magnitude)} added.`);
    } catch (err) { setError(err?.message || 'Could not add transaction.'); }
  }
  async function handleDeleteTx(t) {
    if (t.source !== 'Manual') return;
    if (!window.confirm(`Delete transaction "${t.name}" (${currency(t.amount)})?`)) return;
    try {
      await api.deleteBusinessTransaction(t.rawId);
      setBizTransactions((prev) => prev.filter((x) => x.id !== t.rawId));
      flash('Transaction deleted.');
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
        customerEmail: invForm.customerEmail || null, customerPhone: invForm.customerPhone || null,
        payInstructions: invForm.payInstructions || null, notes: invForm.notes || null,
      });
      setManualInvoices((prev) => [created, ...prev]);
      setInvForm({ customer: '', amount: '', dueDate: '', status: 'OPEN', customerEmail: '', customerPhone: '', payInstructions: '', notes: '' });
      setShowAddInvoice(false);
      flash(`Invoice for ${currency(amount)} to ${customer} created.`);
    } catch (err) { setError(err?.message || 'Could not create invoice.'); }
  }
  async function handleMarkInvoicePaid(id) {
    try {
      const updated = await api.updateManualInvoice(id, { status: 'PAID' });
      setManualInvoices((prev) => prev.map((i) => (i.id === id ? updated : i)));
      flash('Invoice marked paid — nice, money in the door.');
    } catch (err) { setError(err?.message || 'Could not update invoice.'); }
  }
  async function handleDeleteInvoice(id) {
    const inv = (manualInvoices || []).find((i) => i.id === id);
    if (!window.confirm(`Delete this invoice${inv ? ` to ${inv.customer} for ${currency(Number(inv.amount) || 0)}` : ''}?`)) return;
    try {
      await api.deleteManualInvoice(id);
      setManualInvoices((prev) => prev.filter((i) => i.id !== id));
      // Any documents pinned to it are detached server-side; reflect that locally.
      setBizDocuments((prev) => prev.map((d) => (d.invoiceId === id ? { ...d, invoiceId: null } : d)));
      flash('Invoice deleted.');
    } catch (err) { setError(err?.message || 'Could not delete invoice.'); }
  }

  /* Bulk collections: send a payment reminder to every overdue manual invoice
     that has a contact on file. Reuses the real per-invoice send endpoint. */
  async function remindAllOverdue() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const targets = (manualInvoices || []).filter((i) => {
      const status = (i.status || '').toUpperCase();
      if (status === 'PAID') return false;
      const due = i.dueDate ? new Date(i.dueDate) : null;
      const overdue = status === 'OVERDUE' || (due && !Number.isNaN(due.getTime()) && due < today);
      return overdue && (i.customerEmail || i.customerPhone);
    });
    if (targets.length === 0) {
      flash('No overdue invoices with a customer email or phone on file.');
      return;
    }
    if (!window.confirm(`Send a payment reminder to ${targets.length} overdue customer${targets.length === 1 ? '' : 's'}?`)) return;
    setReminding(true);
    let sent = 0, failed = 0;
    for (const inv of targets) {
      const channel = inv.customerEmail ? 'EMAIL' : 'SMS';
      const recipient = inv.customerEmail || inv.customerPhone;
      try { await api.sendManualInvoice(inv.id, { channel, recipient }); sent++; }
      catch { failed++; }
    }
    setReminding(false);
    flash(`Reminder${sent === 1 ? '' : 's'} sent to ${sent} customer${sent === 1 ? '' : 's'}${failed ? ` · ${failed} could not be sent` : ''}.`);
  }

  /* ---- Budgets (per selected business) ---- */
  const loadBudgets = useCallback(async () => {
    const bid = selectedBusiness?.id;
    if (bid == null) { setBudgets([]); return; }
    try {
      const rows = await api.getBusinessBudgets(bid);
      setBudgets(Array.isArray(rows) ? rows.map((r) => ({ category: r.category, monthlyLimit: Number(r.monthlyLimit) || 0 })) : []);
    } catch { setBudgets([]); }
  }, [selectedBusiness]);
  useEffect(() => { loadBudgets(); }, [loadBudgets]);

  async function saveBudget(category, monthlyLimit) {
    const bid = selectedBusiness?.id;
    const cat = (category || '').trim();
    if (bid == null || !cat) return;
    const limit = Number(monthlyLimit) || 0;
    try {
      if (limit <= 0) await api.deleteBusinessBudget(bid, cat);
      else await api.setBusinessBudget(bid, cat, { monthlyLimit: limit });
      await loadBudgets();
      setBudgetForm({ category: '', limit: '' });
      flash('Budget saved.');
    } catch (e) { setError(e?.message || 'Could not save budget.'); }
  }
  async function removeBudget(category) {
    const bid = selectedBusiness?.id;
    if (bid == null) return;
    try { await api.deleteBusinessBudget(bid, category); await loadBudgets(); }
    catch (e) { setError(e?.message || 'Could not remove budget.'); }
  }

  /* ---- Goals (cash reserve + tax set-aside, per selected business) ---- */
  const loadGoals = useCallback(async () => {
    const bid = selectedBusiness?.id;
    if (bid == null) { setGoals({ reserveTarget: 0, taxRate: 0, taxSetAside: 0 }); return; }
    try {
      const g = await api.getBusinessGoals(bid);
      setGoals({
        reserveTarget: Number(g?.reserveTarget) || 0,
        taxRate: Number(g?.taxRate) || 0,
        taxSetAside: Number(g?.taxSetAside) || 0,
      });
    } catch { setGoals({ reserveTarget: 0, taxRate: 0, taxSetAside: 0 }); }
  }, [selectedBusiness]);
  useEffect(() => { loadGoals(); }, [loadGoals]);

  async function saveGoals(patch) {
    const bid = selectedBusiness?.id;
    if (bid == null) return;
    const next = { ...goals, ...patch };
    setGoals(next); // optimistic
    try { await api.setBusinessGoals(bid, patch); }
    catch (e) { setError(e?.message || 'Could not save goal.'); loadGoals(); }
  }

  /* ---- Vendors (metadata overlay per selected business) ---- */
  const loadVendors = useCallback(async () => {
    const bid = selectedBusiness?.id;
    if (bid == null) { setVendorMeta([]); return; }
    try {
      const rows = await api.getBusinessVendors(bid);
      setVendorMeta(Array.isArray(rows) ? rows : []);
    } catch { setVendorMeta([]); }
  }, [selectedBusiness]);
  useEffect(() => { loadVendors(); }, [loadVendors]);

  function openVendorEdit(v) {
    setVendorEditKey(v.name);
    setVendorForm({ status: v.status || 'ACTIVE', renewalDate: v.renewalDate || '', notes: v.notes || '' });
  }
  async function saveVendor(name) {
    const bid = selectedBusiness?.id;
    if (bid == null || !name) return;
    const patch = {
      status: vendorForm.status,
      renewalDate: vendorForm.renewalDate || null,
      notes: vendorForm.notes || null,
    };
    try {
      await api.setBusinessVendor(bid, name, patch);
      setVendorEditKey(null);
      await loadVendors();
      flash('Vendor saved.');
    } catch (e) { setError(e?.message || 'Could not save vendor.'); }
  }
  async function clearVendor(name) {
    const bid = selectedBusiness?.id;
    if (bid == null) return;
    try { await api.deleteBusinessVendor(bid, name); setVendorEditKey(null); await loadVendors(); }
    catch (e) { setError(e?.message || 'Could not clear vendor.'); }
  }

  /* ---- Document center CRUD ---- */
  /* Resolve which business a new document belongs to. Priority: the invoice it's
     pinned to → the business explicitly chosen (All view) → the selected business. */
  function docTargetBusinessId() {
    if (docForm.invoiceId) {
      const inv = manualInvoices.find((i) => String(i.id) === String(docForm.invoiceId));
      if (inv) return inv.businessId;
    }
    if (isAllView) return docBusinessId ? Number(docBusinessId) : null;
    return selectedBusiness?.id || null;
  }
  function openAttachDoc(invoice) {
    setDocForm({ label: '', url: '', docType: 'INVOICE', note: '', invoiceId: String(invoice.id), periodYear: String(new Date().getFullYear()), periodMonth: '' });
    setDocFile(null);
    setActiveTab('docs');
    setShowAddDoc(true);
    requestAnimationFrame(() => document.getElementById('mb-docs')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  async function handleAddDoc(e) {
    e.preventDefault();
    const businessId = docTargetBusinessId();
    if (!businessId) { setError('Pick a business before adding a document.'); return; }
    setSavingDoc(true);
    try {
      let created;
      if (docMode === 'file') {
        if (!docFile) { setError('Choose a file to upload.'); setSavingDoc(false); return; }
        created = await api.uploadBusinessDocument(businessId, docFile, {
          label: docForm.label.trim() || undefined,
          docType: docForm.docType,
          note: docForm.note.trim() || undefined,
          invoiceId: docForm.invoiceId || undefined,
          periodYear: docForm.periodYear || undefined,
          periodMonth: docForm.periodMonth || undefined,
        });
      } else {
        const label = docForm.label.trim();
        let url = docForm.url.trim();
        if (!label || !url) { setSavingDoc(false); return; }
        if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
        created = await api.createBusinessDocument(businessId, {
          label, url, docType: docForm.docType, note: docForm.note.trim() || null,
          invoiceId: docForm.invoiceId ? Number(docForm.invoiceId) : null,
          periodYear: docForm.periodYear ? Number(docForm.periodYear) : null,
          periodMonth: docForm.periodMonth ? Number(docForm.periodMonth) : null,
        });
      }
      // Reflect it locally when the created doc is in the current view's scope.
      setBizDocuments((prev) => [created, ...prev]);
      setDocForm({ label: '', url: '', docType: 'INVOICE', note: '', invoiceId: '', periodYear: String(new Date().getFullYear()), periodMonth: '' });
      setDocFile(null);
      setShowAddDoc(false);
      flash(docMode === 'file' ? 'File uploaded to the document center.' : 'Document link added.');
    } catch (err) { setError(err?.message || 'Could not add document.'); }
    finally { setSavingDoc(false); }
  }

  /* Open an uploaded (GCS) document via an authenticated blob fetch; link docs
     open directly. */
  async function openDoc(d) {
    if ((d.storageType || 'LINK') === 'GCS') {
      try {
        const objUrl = await api.openBusinessDocument(d.id);
        window.open(objUrl, '_blank', 'noopener');
        setTimeout(() => URL.revokeObjectURL(objUrl), 60000);
      } catch (err) { setError(err?.message || 'Could not open the file.'); }
    } else if (d.url) {
      window.open(d.url, '_blank', 'noopener');
    }
  }
  async function handleDeleteDoc(id) {
    const d = (bizDocuments || []).find((x) => x.id === id);
    const isFile = d && (d.storageType || 'LINK') === 'GCS';
    if (!window.confirm(isFile
      ? `Remove "${d?.label || 'this file'}"?\n\nThe uploaded file will be deleted from storage.`
      : 'Remove this document link?')) return;
    try {
      await api.deleteBusinessDocument(id);
      setBizDocuments((prev) => prev.filter((d) => d.id !== id));
      flash(isFile ? 'File removed.' : 'Document removed.');
    } catch (err) { setError(err?.message || 'Could not delete document.'); }
  }

  /* A single document row (shared by the per-business folder and the flat list). */
  function docRow(d, showBusiness) {
    const v = docTypeVisual(d.docType);
    const inv = d.invoiceId != null ? manualInvoices.find((i) => i.id === d.invoiceId) : null;
    const monthLbl = d.periodMonth != null
      ? ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.periodMonth - 1]
      : null;
    const isFile = (d.storageType || 'LINK') === 'GCS';
    const sizeKb = d.sizeBytes ? `${Math.max(1, Math.round(d.sizeBytes / 1024))} KB` : null;
    return (
      <div key={d.id} className="list-item">
        <div className={`item-icon ${v.tone}`}><i className={`ti ${isFile ? 'ti-file-upload' : v.icon}`}></i></div>
        <div className="item-main" style={{ minWidth: 0 }}>
          <div className="item-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.label}</div>
          <div className="item-sub">
            <span className="badge badge-gray">{v.label}</span>
            {isFile ? <span className="badge badge-forest" style={{ marginLeft: 4 }}>File{sizeKb ? ` · ${sizeKb}` : ''}</span> : null}
            {monthLbl ? ` · ${monthLbl} ${d.periodYear}` : (d.periodYear != null ? ` · ${d.periodYear}` : '')}
            {showBusiness && businessNameById.get(d.businessId) ? ` · ${businessNameById.get(d.businessId)}` : ''}
            {inv ? ` · Invoice: ${inv.customer}` : ''}
            {d.createdAt ? ` · added ${bizDate(d.createdAt)}` : ''}
            {d.note ? ` · ${d.note}` : ''}
          </div>
        </div>
        <div className="item-right" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => openDoc(d)} title={isFile ? 'Open file' : 'Open document'}>
            <i className={`ti ${isFile ? 'ti-download' : 'ti-external-link'}`}></i> Open
          </button>
          {d.centralDocumentId && (
            <button className="btn btn-secondary btn-sm" title="Securely share with a CPA or client" onClick={() => setShareBizDoc(d)}>
              <i className="ti ti-share"></i> Share
            </button>
          )}
          <button className="icon-btn" title="Remove document" onClick={() => handleDeleteDoc(d.id)}><i className="ti ti-trash"></i></button>
        </div>
      </div>
    );
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
      key: `m-${i.id}`, id: i.id, manual: true, businessId: i.businessId ?? null, customer: i.customer,
      amount: Number(i.amount) || 0, status: (i.status || 'OPEN').toUpperCase(), dueDate: i.dueDate,
    }));
    const q = qboInvoices.map((i) => ({
      key: `q-${i.id}`, id: i.id, manual: false, businessId: null, customer: i.customer,
      amount: Number(i.amount) || 0, status: (i.status || 'OPEN').toUpperCase(), dueDate: i.dueDate,
    }));
    return [...m, ...q];
  }, [manualInvoices, qboInvoices]);
  const pendingInvoices = useMemo(() => allInvoices.filter((i) => i.status !== 'PAID'), [allInvoices]);
  const pendingTotal = useMemo(() => pendingInvoices.reduce((s, i) => s + i.amount, 0), [pendingInvoices]);

  /* ---- Document center ---- */
  const businessNameById = useMemo(() => {
    const m = new Map();
    businesses.forEach((b) => m.set(b.id, b.name));
    return m;
  }, [businesses]);
  /* How many documents are pinned to each invoice (id -> count). */
  const docCountByInvoice = useMemo(() => {
    const m = new Map();
    bizDocuments.forEach((d) => {
      if (d.invoiceId != null) m.set(d.invoiceId, (m.get(d.invoiceId) || 0) + 1);
    });
    return m;
  }, [bizDocuments]);
  const sortedDocs = useMemo(
    () => [...bizDocuments].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))),
    [bizDocuments]
  );
  const filteredDocs = useMemo(
    () => sortedDocs.filter((d) =>
      (fDocType === 'ALL' || (d.docType || 'OTHER').toUpperCase() === fDocType) &&
      (fDocBusiness === 'ALL' || String(d.businessId) === String(fDocBusiness)) &&
      (fDocYear === 'ALL'
        ? true
        : fDocYear === 'NONE'
          ? d.periodYear == null
          : String(d.periodYear) === String(fDocYear))),
    [sortedDocs, fDocType, fDocYear, fDocBusiness]
  );
  /* Distinct years present in the document center, newest first (for year-wise grouping). */
  const docYears = useMemo(() => {
    const s = new Set();
    sortedDocs.forEach((d) => { if (d.periodYear != null) s.add(Number(d.periodYear)); });
    return [...s].sort((a, b) => b - a);
  }, [sortedDocs]);
  const hasUndatedDocs = useMemo(() => sortedDocs.some((d) => d.periodYear == null), [sortedDocs]);
  /* All-businesses view: group the filtered docs into a folder per business, in the
     businesses' own order, each folder's docs newest-first (filteredDocs is already
     sorted by added-date desc). Docs whose business is unknown fall into "Other". */
  const docsByBusiness = useMemo(() => {
    const groups = new Map();
    filteredDocs.forEach((d) => {
      const key = d.businessId != null ? d.businessId : 'other';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(d);
    });
    const rows = [];
    businesses.forEach((b) => {
      if (groups.has(b.id)) rows.push({ id: b.id, name: b.name, docs: groups.get(b.id) });
    });
    if (groups.has('other')) rows.push({ id: 'other', name: 'Other', docs: groups.get('other') });
    return rows;
  }, [filteredDocs, businesses]);

  /* Resolve the dashboard period into a concrete [from, to] date window. Mirrors
     the server PeriodResolver so all surfaces agree. `to` defaults to now. */
  const dashRange = useMemo(() => {
    const now = new Date();
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    if (dashPeriod === 'THIS_YEAR') {
      return { from: new Date(now.getFullYear(), 0, 1), to: endOfToday, label: 'This year' };
    }
    if (dashPeriod === 'T12M') {
      const from = new Date(now.getFullYear(), now.getMonth() - 12, now.getDate() + 1);
      return { from, to: endOfToday, label: 'Trailing 12 months' };
    }
    if (dashPeriod === 'CUSTOM') {
      let from = dashFrom ? new Date(dashFrom + 'T00:00:00') : new Date(now.getFullYear(), now.getMonth(), 1);
      let to = dashTo ? new Date(dashTo + 'T23:59:59') : endOfToday;
      if (to < from) { const t = from; from = to; to = t; }
      return { from, to, label: 'Custom range' };
    }
    return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfToday, label: 'This month' };
  }, [dashPeriod, dashFrom, dashTo]);

  const inDashPeriod = useCallback((iso) => {
    if (!iso) return false;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return false;
    return (!dashRange.from || d >= dashRange.from) && (!dashRange.to || d <= dashRange.to);
  }, [dashRange]);

  /* Ledger-derived flow metrics for the selected period, over the currently
     scoped merged ledger (one business, or all in the "All" view). Replaces the
     old stale stored-column figures — a single source of truth so the headline
     and the per-business breakdown can never disagree. */
  const periodFlow = useMemo(() => {
    let revenue = 0, expenses = 0;
    unifiedTx.forEach((t) => {
      if (!inDashPeriod(t.date)) return;
      if (t.amount >= 0) revenue += t.amount;
      else expenses += Math.abs(t.amount);
    });
    return { revenue, expenses, netProfit: revenue - expenses };
  }, [unifiedTx, inDashPeriod]);

  /* Consolidated per-business breakdown (All view): one row per business, each
     computed from the same merged ledger filtered to that business. Parts sum to
     the headline totals by construction. */
  const acctKeyToBusiness = useMemo(() => {
    const m = new Map();
    (bizAccounts || []).forEach((a) => m.set(`man-${a.id}`, a.businessId));
    linkedOwner.forEach((bid, id) => m.set(`lin-${id}`, bid));
    return m;
  }, [bizAccounts, linkedOwner]);

  const businessBreakdown = useMemo(() => {
    const rows = new Map();
    businesses.forEach((b) => rows.set(b.id, {
      businessId: b.id, name: b.name, industry: b.industry, revenue: 0, expenses: 0,
      cashOnHand: 0, creditOwed: 0, outstandingInvoices: 0, outstandingCount: 0,
    }));
    unifiedTx.forEach((t) => {
      const row = t.businessId != null ? rows.get(t.businessId) : null;
      if (!row || !inDashPeriod(t.date)) return;
      if (t.amount >= 0) row.revenue += t.amount; else row.expenses += Math.abs(t.amount);
    });
    allAccounts.forEach((a) => {
      const bid = acctKeyToBusiness.get(a.key);
      const row = bid != null ? rows.get(bid) : null;
      if (!row) return;
      if (isCardType(a.type)) row.creditOwed += a.balance;
      else if (isBankType(a.type)) row.cashOnHand += a.balance;
    });
    allInvoices.forEach((i) => {
      const row = i.businessId != null ? rows.get(i.businessId) : null;
      if (!row || i.status === 'PAID') return;
      row.outstandingInvoices += i.amount;
      row.outstandingCount += 1;
    });
    return [...rows.values()].map((r) => ({ ...r, netProfit: r.revenue - r.expenses }));
  }, [businesses, unifiedTx, allAccounts, allInvoices, acctKeyToBusiness, inDashPeriod]);

  /* Per-business accounts, split into bank / cards / manual — powers the
     expandable accordion so each business shows exactly its own one-to-one
     accounts and cards. */
  const accountsByBusiness = useMemo(() => {
    const m = new Map();
    businesses.forEach((b) => m.set(b.id, { bank: [], cards: [], all: [] }));
    allAccounts.forEach((a) => {
      const bid = acctKeyToBusiness.get(a.key);
      const g = bid != null ? m.get(bid) : null;
      if (!g) return;
      g.all.push(a);
      if (isCardType(a.type)) g.cards.push(a);
      else if (isBankType(a.type)) g.bank.push(a);
    });
    return m;
  }, [businesses, allAccounts, acctKeyToBusiness]);

  /* Per-business transactions (newest first) for the accordion. */
  const txByBusiness = useMemo(() => {
    const m = new Map();
    businesses.forEach((b) => m.set(b.id, []));
    unifiedTx.forEach((t) => {
      const arr = t.businessId != null ? m.get(t.businessId) : null;
      if (arr) arr.push(t);
    });
    m.forEach((arr) => arr.sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0;
      const db = b.date ? new Date(b.date).getTime() : 0;
      return db - da;
    }));
    return m;
  }, [businesses, unifiedTx]);

  const breakdownById = useMemo(() => {
    const m = new Map();
    businessBreakdown.forEach((r) => m.set(r.businessId, r));
    return m;
  }, [businessBreakdown]);

  const toggleExpandBiz = useCallback((id) => {
    setExpandedBiz((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

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
        // Ledger-derived, period-aware. Flows sum over the selected period;
        // balances/AR are point-in-time (today), independent of the period.
        revenueMtd: periodFlow.revenue, expensesMtd: periodFlow.expenses,
        netProfitMtd: periodFlow.netProfit,
        cashBalance: cashTotal,
        outstandingInvoices: pendingTotal,
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

  /* ================================================================== */
  /* INTELLIGENCE LAYER — Command Center                                 */
  /* Everything below is derived client-side from the same merged ledger */
  /* + invoices, so it always agrees with the figures shown elsewhere.   */
  /* ================================================================== */

  /* Trailing-window income/expense/net over the merged ledger. */
  const trailing = useMemo(() => {
    const now = Date.now();
    const win = (days) => {
      const from = now - days * 86400000;
      let income = 0, expense = 0, count = 0;
      unifiedTx.forEach((t) => {
        const d = t.date ? new Date(t.date).getTime() : NaN;
        if (Number.isNaN(d) || d < from || d > now) return;
        count++;
        if (t.amount >= 0) income += t.amount; else expense += Math.abs(t.amount);
      });
      return { income, expense, net: income - expense, count };
    };
    return { d30: win(30), d60: win(60), d90: win(90) };
  }, [unifiedTx]);

  /* Average monthly operating burn + daily net trend (trailing 90 days). */
  const monthlyBurn = useMemo(() => trailing.d90.expense / 3, [trailing]);
  const dailyNet = useMemo(() => trailing.d90.net / 90, [trailing]);
  /* Months of cash runway at the current burn (Infinity when not burning). */
  const runwayMonths = useMemo(
    () => (monthlyBurn <= 0 ? Infinity : cashTotal / monthlyBurn),
    [cashTotal, monthlyBurn]
  );

  /* AR aging — bucket open/overdue invoices by days past their due date. */
  const arAging = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90: 0 };
    const counts = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90: 0 };
    const byCustomer = new Map();
    let overdue = 0, total = 0;
    pendingInvoices.forEach((i) => {
      const amt = Number(i.amount) || 0;
      total += amt;
      const due = i.dueDate ? new Date(i.dueDate) : null;
      let key = 'current';
      if (due && !Number.isNaN(due.getTime())) {
        due.setHours(0, 0, 0, 0);
        const days = Math.floor((today - due) / 86400000);
        if (days <= 0) key = 'current';
        else if (days <= 30) key = 'd1_30';
        else if (days <= 60) key = 'd31_60';
        else if (days <= 90) key = 'd61_90';
        else key = 'd90';
      } else if (i.status === 'OVERDUE') {
        key = 'd1_30';
      }
      buckets[key] += amt; counts[key] += 1;
      if (key !== 'current') {
        overdue += amt;
        const c = i.customer || 'Unknown';
        byCustomer.set(c, (byCustomer.get(c) || 0) + amt);
      }
    });
    const worstCustomer = [...byCustomer.entries()].sort((a, b) => b[1] - a[1])[0] || null;
    return {
      buckets, counts, overdue, total,
      overduePct: total > 0 ? overdue / total : 0,
      worstCustomer: worstCustomer ? { name: worstCustomer[0], amount: worstCustomer[1] } : null,
    };
  }, [pendingInvoices]);

  /* 90-day cash-flow forecast. Projects available cash from the trailing
     daily-net trend, plus the expected collection of overdue receivables
     (assumed to land ~14 days out — money the trend hasn't captured yet). */
  const forecast = useMemo(() => {
    const horizon = 90;
    const start = cashTotal;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const inflow = new Array(horizon + 1).fill(0);
    let overdueAR = 0;
    pendingInvoices.forEach((i) => {
      const amt = Number(i.amount) || 0;
      if (amt <= 0) return;
      let overdue = i.status === 'OVERDUE';
      const due = i.dueDate ? new Date(i.dueDate) : null;
      if (due && !Number.isNaN(due.getTime())) {
        due.setHours(0, 0, 0, 0);
        if (due < today) overdue = true;
      }
      if (overdue) { inflow[14] += amt; overdueAR += amt; }
    });
    const series = [];
    let low = { day: 0, balance: start };
    let shortfallDay = null;
    let cum = 0;
    for (let d = 0; d <= horizon; d++) {
      cum += inflow[d];
      const bal = start + dailyNet * d + cum;
      if (bal < low.balance) low = { day: d, balance: bal };
      if (shortfallDay == null && bal < 0) shortfallDay = d;
      if (d % 3 === 0 || d === horizon) series.push({ day: d, balance: bal });
    }
    const at = (d) => start + dailyNet * d + (d >= 14 ? overdueAR : 0);
    return {
      start, series, low, shortfallDay, overdueAR, dailyNet,
      d30: at(30), d60: at(60), d90: at(90),
      hasTrend: trailing.d90.count > 0,
    };
  }, [cashTotal, pendingInvoices, dailyNet, trailing]);

  /* Business Health Score (0–100) — a weighted blend of liquidity,
     profitability, receivables quality, and cash trend. */
  const health = useMemo(() => {
    const liq = monthlyBurn <= 0
      ? (cashTotal > 0 ? 100 : 50)
      : clamp((runwayMonths / 6) * 100, 0, 100);
    const rev90 = trailing.d90.income;
    const margin = rev90 > 0 ? trailing.d90.net / rev90 : (trailing.d90.net >= 0 ? 0 : -0.2);
    const prof = clamp(50 + margin * 250, 0, 100);       // -20%→0, 0%→50, +20%→100
    const arh = clamp(100 - arAging.overduePct * 100, 0, 100);
    const trend = trailing.d90.net >= 0
      ? 100
      : clamp(50 + (trailing.d90.net / Math.max(1, trailing.d90.expense)) * 50, 0, 50);
    const score = Math.round(liq * 0.35 + prof * 0.30 + arh * 0.20 + trend * 0.15);
    const t = healthTone(score);
    return {
      score, ...t,
      parts: [
        { label: 'Liquidity', value: Math.round(liq), weight: '35%',
          hint: runwayMonths === Infinity ? 'Not burning cash' : `${runwayMonths.toFixed(1)} mo runway` },
        { label: 'Profitability', value: Math.round(prof), weight: '30%',
          hint: `${(margin * 100).toFixed(0)}% net margin (90d)` },
        { label: 'Receivables', value: Math.round(arh), weight: '20%',
          hint: arAging.total > 0 ? `${Math.round(arAging.overduePct * 100)}% overdue` : 'Nothing outstanding' },
        { label: 'Cash trend', value: Math.round(trend), weight: '15%',
          hint: `${trailing.d90.net >= 0 ? '+' : ''}${compactMoney(trailing.d90.net)} over 90d` },
      ],
    };
  }, [monthlyBurn, cashTotal, runwayMonths, trailing, arAging]);

  /* Which expense categories moved most in the last 30 days vs the prior 30. */
  const categoryDelta = useMemo(() => {
    const now = Date.now();
    const cur = new Map(), prev = new Map();
    unifiedTx.forEach((t) => {
      if (t.amount >= 0) return;
      const d = t.date ? new Date(t.date).getTime() : NaN;
      if (Number.isNaN(d)) return;
      const ageDays = (now - d) / 86400000;
      const amt = Math.abs(t.amount);
      const cat = t.category || 'Uncategorized';
      if (ageDays <= 30) cur.set(cat, (cur.get(cat) || 0) + amt);
      else if (ageDays <= 60) prev.set(cat, (prev.get(cat) || 0) + amt);
    });
    let top = null;
    cur.forEach((v, cat) => {
      const p = prev.get(cat) || 0;
      const delta = v - p;
      if (p > 0 && delta > 0 && (!top || delta > top.delta)) {
        top = { cat, delta, pct: delta / p, cur: v };
      }
    });
    return top;
  }, [unifiedTx]);

  /* Smart alerts — ranked, high-signal, generated from the metrics above. */
  const insights = useMemo(() => {
    const out = [];
    // Cash shortfall / runway.
    if (forecast.hasTrend && forecast.shortfallDay != null) {
      out.push({
        tone: 'neg', icon: 'ti-alert-triangle',
        title: `Cash projected to run out in ${forecast.shortfallDay} days`,
        detail: `At your current trend${forecast.overdueAR > 0 ? ', even after collecting overdue receivables,' : ''} available cash is on track to reach $0 around ${inDaysDate(forecast.shortfallDay)}.`,
        action: 'Review upcoming expenses and accelerate collections.',
      });
    } else if (runwayMonths !== Infinity && runwayMonths < 3) {
      out.push({
        tone: 'warn', icon: 'ti-clock-hour-4',
        title: `About ${runwayMonths.toFixed(1)} months of runway left`,
        detail: `Your cash covers roughly ${Math.round(runwayMonths * 30)} more days at the current burn of ${currency(monthlyBurn)}/mo.`,
        action: 'Build a reserve or trim discretionary spend.',
      });
    }
    // Overdue receivables.
    if (arAging.overdue > 0) {
      const extraDays = Math.max(1, Math.round(arAging.overdue / Math.max(1, monthlyBurn) * 30));
      out.push({
        tone: arAging.overduePct >= 0.4 ? 'neg' : 'warn', icon: 'ti-clock-dollar',
        title: `${currency(arAging.overdue)} in receivables is overdue`,
        detail: `${arAging.overduePct >= 0.5 ? 'More than half' : `${Math.round(arAging.overduePct * 100)}%`} of what you're owed is past due${arAging.worstCustomer ? `; ${arAging.worstCustomer.name} is the largest at ${currency(arAging.worstCustomer.amount)}` : ''}. Collecting it adds roughly ${extraDays} days of runway.`,
        action: 'Send reminders to overdue customers.',
      });
    }
    // Expense category spike.
    if (categoryDelta && categoryDelta.pct >= 0.25) {
      out.push({
        tone: 'warn', icon: 'ti-trending-up',
        title: `${categoryDelta.cat} spend up ${Math.round(categoryDelta.pct * 100)}% this month`,
        detail: `You've spent ${currency(categoryDelta.cur)} on ${categoryDelta.cat} in the last 30 days — ${currency(categoryDelta.delta)} more than the prior 30.`,
        action: 'Check whether this increase is expected.',
      });
    }
    // Revenue trend (last full month vs the one before, from the 6-mo series).
    if (cashFlowSeries.length >= 2) {
      const last = cashFlowSeries[cashFlowSeries.length - 1];
      const prev = cashFlowSeries[cashFlowSeries.length - 2];
      if (prev.moneyIn > 0) {
        const chg = (last.moneyIn - prev.moneyIn) / prev.moneyIn;
        if (chg <= -0.15) {
          out.push({
            tone: 'warn', icon: 'ti-arrow-down-right',
            title: `Revenue down ${Math.round(Math.abs(chg) * 100)}% vs last month`,
            detail: `Money in fell from ${currency(prev.moneyIn)} to ${currency(last.moneyIn)} month-over-month.`,
            action: 'Look at pipeline and recent churn.',
          });
        } else if (chg >= 0.15) {
          out.push({
            tone: 'pos', icon: 'ti-arrow-up-right',
            title: `Revenue up ${Math.round(chg * 100)}% vs last month`,
            detail: `Money in rose from ${currency(prev.moneyIn)} to ${currency(last.moneyIn)} month-over-month — nice momentum.`,
            action: 'Consider reinvesting while demand is strong.',
          });
        }
      }
    }
    // A positive note when things look solid.
    if (out.filter((i) => i.tone !== 'pos').length === 0) {
      if (trailing.d90.net > 0) {
        out.push({
          tone: 'pos', icon: 'ti-circle-check',
          title: 'Cash-flow positive over the last 90 days',
          detail: `You've netted ${currency(trailing.d90.net)} across the last quarter${arAging.overdue === 0 && arAging.total > 0 ? ' with no overdue receivables' : ''}.`,
          action: 'Keep the momentum — set a cash-reserve goal.',
        });
      } else if (arAging.total > 0 && arAging.overdue === 0) {
        out.push({
          tone: 'pos', icon: 'ti-circle-check',
          title: 'All receivables are current',
          detail: 'No invoices are past due — collections are healthy.',
          action: '',
        });
      }
    }
    return out.slice(0, 6);
  }, [forecast, runwayMonths, monthlyBurn, arAging, categoryDelta, cashFlowSeries, trailing]);

  /* Recurring charges / subscriptions — detect merchants billed on a regular
     cadence with a consistent amount, so owners can see (and cut) their fixed
     monthly commitment. Pure pattern detection over the merged ledger. */
  const recurring = useMemo(() => {
    const groups = new Map();
    unifiedTx.forEach((t) => {
      if (t.amount >= 0) return;                     // outflows only
      const key = (t.merchant || t.name || '').trim().toLowerCase();
      if (!key) return;
      if (!groups.has(key)) groups.set(key, { label: t.merchant || t.name, txns: [] });
      const d = t.date ? new Date(t.date) : null;
      groups.get(key).txns.push({ amount: Math.abs(t.amount), date: d && !Number.isNaN(d.getTime()) ? d : null, category: t.category });
    });
    const out = [];
    groups.forEach((g) => {
      const dated = g.txns.filter((t) => t.date).sort((a, b) => a.date - b.date);
      if (dated.length < 2) return;
      const gaps = [];
      for (let i = 1; i < dated.length; i++) gaps.push((dated[i].date - dated[i - 1].date) / 86400000);
      const avgGap = gaps.reduce((s, x) => s + x, 0) / gaps.length;
      const amts = dated.map((t) => t.amount);
      const mean = amts.reduce((s, x) => s + x, 0) / amts.length;
      const variance = amts.reduce((s, x) => s + (x - mean) ** 2, 0) / amts.length;
      const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
      if (cv > 0.25) return;                          // amounts too irregular to be a subscription
      let cadence = null, perMonth = 0;
      if (avgGap >= 6 && avgGap <= 9) { cadence = 'Weekly'; perMonth = mean * 4.33; }
      else if (avgGap >= 12 && avgGap <= 16) { cadence = 'Biweekly'; perMonth = mean * 2.17; }
      else if (avgGap >= 25 && avgGap <= 35) { cadence = 'Monthly'; perMonth = mean; }
      else if (avgGap >= 80 && avgGap <= 100) { cadence = 'Quarterly'; perMonth = mean / 3; }
      else if (avgGap >= 350 && avgGap <= 380) { cadence = 'Annual'; perMonth = mean / 12; }
      if (!cadence) return;
      const last = dated[dated.length - 1].date;
      const next = new Date(last); next.setDate(next.getDate() + Math.round(avgGap));
      out.push({
        label: g.label, cadence, amount: mean, perMonth, perYear: perMonth * 12,
        count: dated.length, next, category: dated[dated.length - 1].category,
      });
    });
    out.sort((a, b) => b.perMonth - a.perMonth);
    return out;
  }, [unifiedTx]);
  const recurringMonthly = useMemo(() => recurring.reduce((s, r) => s + r.perMonth, 0), [recurring]);

  /* Per-customer receivables behavior — who's billed, what's outstanding,
     what's overdue, and a simple risk read. Drives the collections view. */
  const customerInsights = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const m = new Map();
    allInvoices.forEach((inv) => {
      const name = (inv.customer || 'Unknown').trim() || 'Unknown';
      if (!m.has(name)) m.set(name, { name, billed: 0, outstanding: 0, overdue: 0, paid: 0, count: 0, overdueCount: 0 });
      const r = m.get(name);
      const amt = Number(inv.amount) || 0;
      r.count++; r.billed += amt;
      if (inv.status === 'PAID') { r.paid += amt; return; }
      r.outstanding += amt;
      const due = inv.dueDate ? new Date(inv.dueDate) : null;
      const isOverdue = inv.status === 'OVERDUE' || (due && !Number.isNaN(due.getTime()) && due < today);
      if (isOverdue) { r.overdue += amt; r.overdueCount++; }
    });
    return [...m.values()]
      .map((r) => ({ ...r, riskPct: r.billed > 0 ? r.overdue / r.billed : 0 }))
      .sort((a, b) => b.overdue - a.overdue || b.outstanding - a.outstanding || b.billed - a.billed);
  }, [allInvoices]);

  /* Vendors — spend aggregated from the ledger (money out grouped by merchant/
     name), merged with the persisted metadata overlay (status/renewal/notes). */
  const vendorAgg = useMemo(() => {
    const map = new Map();
    unifiedTx.forEach((t) => {
      if (t.amount >= 0) return;
      const name = (t.merchant || t.name || 'Unknown').trim();
      if (!name) return;
      if (!map.has(name)) map.set(name, { name, total: 0, period: 0, count: 0, last: null, cats: new Map() });
      const v = map.get(name);
      const amt = Math.abs(t.amount);
      v.total += amt; v.count += 1;
      if (inDashPeriod(t.date)) v.period += amt;
      const d = t.date ? new Date(t.date) : null;
      if (d && !Number.isNaN(d.getTime()) && (!v.last || d > v.last)) v.last = d;
      const c = t.category || 'Uncategorized';
      v.cats.set(c, (v.cats.get(c) || 0) + amt);
    });
    const recurringNames = new Set(recurring.map((r) => (r.label || '').trim().toLowerCase()));
    const metaByName = new Map(vendorMeta.map((m) => [m.vendorName, m]));
    return [...map.values()].map((v) => {
      const topCat = [...v.cats.entries()].sort((a, b) => b[1] - a[1])[0];
      const meta = metaByName.get(v.name);
      return {
        name: v.name, total: v.total, period: v.period, count: v.count, last: v.last,
        topCategory: topCat ? topCat[0] : '—',
        recurring: recurringNames.has(v.name.toLowerCase()),
        status: meta?.status || 'ACTIVE',
        renewalDate: meta?.renewalDate || '',
        notes: meta?.notes || '',
        hasMeta: !!meta,
      };
    }).sort((a, b) => b.period - a.period || b.total - a.total);
  }, [unifiedTx, inDashPeriod, recurring, vendorMeta]);

  /* Contract renewals coming up within 60 days (soonest first). */
  const upcomingRenewals = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return vendorAgg
      .filter((v) => v.renewalDate)
      .map((v) => {
        const d = new Date(v.renewalDate);
        return { ...v, renewalIn: Number.isNaN(d.getTime()) ? null : Math.round((d - today) / 86400000) };
      })
      .filter((v) => v.renewalIn != null && v.renewalIn <= 60)
      .sort((a, b) => a.renewalIn - b.renewalIn);
  }, [vendorAgg]);

  /* Actual spend per category for the CURRENT calendar month (budgets are
     monthly), over the selected-business ledger. */
  const monthlySpendByCategory = useMemo(() => {
    const now = new Date(); const y = now.getFullYear(), mo = now.getMonth();
    const m = new Map();
    unifiedTx.forEach((t) => {
      if (t.amount >= 0) return;
      const d = t.date ? new Date(t.date) : null;
      if (!d || Number.isNaN(d.getTime()) || d.getFullYear() !== y || d.getMonth() !== mo) return;
      const c = t.category || 'Uncategorized';
      m.set(c, (m.get(c) || 0) + Math.abs(t.amount));
    });
    return m;
  }, [unifiedTx]);

  /* Budget vs actual rows, worst-variance first. */
  const budgetRows = useMemo(() => {
    return budgets.map((b) => {
      const limit = Number(b.monthlyLimit) || 0;
      const spent = monthlySpendByCategory.get(b.category) || 0;
      const pct = limit > 0 ? spent / limit : (spent > 0 ? 1 : 0);
      return { category: b.category, limit, spent, pct, remaining: limit - spent, over: spent > limit };
    }).sort((a, b) => b.pct - a.pct);
  }, [budgets, monthlySpendByCategory]);
  const budgetTotals = useMemo(() => {
    let limit = 0, spent = 0;
    budgetRows.forEach((r) => { limit += r.limit; spent += r.spent; });
    return { limit, spent, remaining: limit - spent, over: spent > limit, overCount: budgetRows.filter((r) => r.over).length };
  }, [budgetRows]);
  /* Expense categories available to budget (union of known + already-spent). */
  const budgetableCategories = useMemo(() => {
    const s = new Set(TX_CATEGORIES.filter((c) => c !== 'Income'));
    monthlySpendByCategory.forEach((_v, c) => s.add(c));
    budgets.forEach((b) => s.delete(b.category)); // hide ones already budgeted from the add picker
    return [...s].sort();
  }, [monthlySpendByCategory, budgets]);

  /* Cash-reserve goal progress (funded from current cash on hand). */
  const reservePlan = useMemo(() => {
    const target = Number(goals.reserveTarget) || 0;
    const funded = cashTotal;
    const pct = target > 0 ? clamp(funded / target, 0, 1) : 0;
    const monthsCovered = monthlyBurn > 0 ? target / monthlyBurn : Infinity;
    return { target, funded, pct, remaining: Math.max(0, target - funded), fullyFunded: target > 0 && funded >= target, monthsCovered };
  }, [goals, cashTotal, monthlyBurn]);

  /* Tax set-aside plan: recommended = rate% of net profit for the selected period. */
  const taxPlan = useMemo(() => {
    const rate = Number(goals.taxRate) || 0;
    const netProfit = Math.max(0, periodFlow.netProfit);
    const recommended = netProfit * (rate / 100);
    const setAside = Number(goals.taxSetAside) || 0;
    const pct = recommended > 0 ? clamp(setAside / recommended, 0, 1) : (setAside > 0 ? 1 : 0);
    return { rate, netProfit, recommended, setAside, pct, remaining: Math.max(0, recommended - setAside), periodLabel: dashRange.label };
  }, [goals, periodFlow, dashRange]);

  /* ---- Financial statements (cash-basis, period-aware) ----
     Each is a plain data model { title, period, sections[], grandTotal } so the
     same structure renders on screen and serializes to both CSV and print/PDF. */
  const statementBizName = isAllView ? 'All businesses' : (selectedBusiness?.name || companyName);

  const plStatement = useMemo(() => {
    const inc = new Map(), exp = new Map();
    unifiedTx.forEach((t) => {
      if (!inDashPeriod(t.date)) return;
      const cat = t.category || 'Uncategorized';
      if (t.amount >= 0) inc.set(cat, (inc.get(cat) || 0) + t.amount);
      else exp.set(cat, (exp.get(cat) || 0) + Math.abs(t.amount));
    });
    const incRows = [...inc.entries()].map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount);
    const expRows = [...exp.entries()].map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount);
    const totalInc = incRows.reduce((s, r) => s + r.amount, 0);
    const totalExp = expRows.reduce((s, r) => s + r.amount, 0);
    return {
      title: 'Profit & Loss', period: dashRange.label,
      sections: [
        { heading: 'Revenue', rows: incRows, total: { label: 'Total revenue', amount: totalInc } },
        { heading: 'Expenses', rows: expRows, total: { label: 'Total expenses', amount: totalExp } },
      ],
      grandTotal: { label: 'Net profit', amount: totalInc - totalExp },
    };
  }, [unifiedTx, inDashPeriod, dashRange]);

  const balanceSheet = useMemo(() => {
    const cash = cashTotal;
    const ar = arAging.total;
    const loans = allAccounts.filter((a) => a.type === 'loan').reduce((s, a) => s + Math.abs(a.balance), 0);
    const assets = cash + ar;
    const liabilities = creditOwed + loans;
    return {
      title: 'Balance Sheet', period: `As of ${bizDate(todayISO())}`,
      sections: [
        { heading: 'Assets', rows: [
          { label: 'Cash & bank accounts', amount: cash },
          { label: 'Accounts receivable', amount: ar },
        ], total: { label: 'Total assets', amount: assets } },
        { heading: 'Liabilities', rows: [
          { label: 'Credit cards', amount: creditOwed },
          { label: 'Loans', amount: loans },
        ], total: { label: 'Total liabilities', amount: liabilities } },
      ],
      grandTotal: { label: "Owner's equity", amount: assets - liabilities },
    };
  }, [cashTotal, arAging, creditOwed, allAccounts]);

  const cashFlowStatement = useMemo(() => {
    let inflow = 0;
    const outByType = new Map();
    unifiedTx.forEach((t) => {
      if (!inDashPeriod(t.date)) return;
      if (t.amount >= 0) inflow += t.amount;
      else outByType.set(t.type, (outByType.get(t.type) || 0) + Math.abs(t.amount));
    });
    const outRows = [...outByType.entries()].map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount);
    const totalOut = outRows.reduce((s, r) => s + r.amount, 0);
    return {
      title: 'Cash Flow Statement', period: dashRange.label,
      sections: [
        { heading: 'Cash in', rows: [{ label: 'Customer receipts & deposits', amount: inflow }], total: { label: 'Total cash in', amount: inflow } },
        { heading: 'Cash out', rows: outRows, total: { label: 'Total cash out', amount: totalOut } },
      ],
      grandTotal: { label: 'Net cash flow', amount: inflow - totalOut },
    };
  }, [unifiedTx, inDashPeriod, dashRange]);

  const allStatements = useMemo(
    () => [plStatement, balanceSheet, cashFlowStatement],
    [plStatement, balanceSheet, cashFlowStatement]
  );

  /* Export handlers — one data model, three outputs. */
  const exportStatementCsv = useCallback((stmt) => {
    downloadCsv(`${statementBizName} - ${stmt.title}.csv`, statementToCsvRows(stmt, statementBizName));
  }, [statementBizName]);
  const exportStatementPdf = useCallback((stmt) => {
    printHtmlDocument(stmt.title, statementToHtml(stmt, statementBizName));
  }, [statementBizName]);
  const exportAllPdf = useCallback(() => {
    const html = allStatements
      .map((s) => statementToHtml(s, statementBizName))
      .join('<div style="page-break-after:always"></div>');
    printHtmlDocument(`${statementBizName} — Financial statements`, html);
  }, [allStatements, statementBizName]);

  /* All-businesses breakdown: each business's manual revenue/expenses figures. */
  // Ledger-derived per-business rows for the consolidated table (replaces the old
  // stale stored-column figures). Same source as the headline totals, so parts sum.
  const byBusiness = useMemo(
    () => businessBreakdown.map((r) => ({
      id: r.businessId, name: r.name, industry: r.industry,
      revenue: r.revenue, expenses: r.expenses, net: r.netProfit,
      cashOnHand: r.cashOnHand, outstanding: r.outstandingInvoices,
    })),
    [businessBreakdown]
  );

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

      {/* Business tabs — each business is its own tab, plus an "All businesses" tab */}
      {(
        <div style={{ display: 'flex', gap: 2, borderBottom: '1.5px solid var(--tv-border)', overflowX: 'auto', marginBottom: 16 }}>
          {businesses.length > 1 && (
            <div className={`outer-tab ${isAllView ? 'active' : ''}`} onClick={() => { setSelectedId('ALL'); setShowAddBusiness(false); }}
              title="Track all businesses in one place">
              <i className="ti ti-layout-grid"></i> All businesses
            </div>
          )}
          {businesses.map((b) => (
            <div key={b.id} className={`outer-tab ${!isAllView && selectedBusiness?.id === b.id ? 'active' : ''}`}
              onClick={() => { setSelectedId(b.id); setShowAddBusiness(false); }}
              title={b.industry ? `${b.name} · ${b.industry}` : b.name}>
              <i className="ti ti-building-store"></i> {b.name}
            </div>
          ))}
          <div className={`outer-tab ${showAddBusiness ? 'active' : ''}`} onClick={() => setShowAddBusiness((v) => !v)}>
            <i className={`ti ${showAddBusiness ? 'ti-x' : 'ti-plus'}`}></i> {showAddBusiness ? 'Cancel' : 'Add business'}
          </div>
        </div>
      )}

      {/* Add-business form (opens from the Add business tab) */}
      {showAddBusiness && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="section-header">
            <div className="section-title"><i className="ti ti-building-store" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>New business</div>
          </div>
          <form onSubmit={handleAddBusiness}>
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
        </div>
      )}

      {/* Selected-business meta (slim) */}
      {selectedBusiness && !showAddBusiness && (
        <div className="card" style={{ marginBottom: 16, padding: '12px 16px' }}>
          <div className="list-item" style={{ padding: 0, cursor: 'default' }}>
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
        </div>
      )}

      {/* Success confirmation (auto-dismisses) */}
      {notice && (
        <div className="card" style={{ borderColor: 'var(--tv-positive)', marginBottom: 12 }}>
          <div className="list-item" style={{ padding: 0 }}>
            <div className="item-icon icon-green"><i className="ti ti-circle-check"></i></div>
            <div className="item-main"><div className="item-sub" style={{ color: 'var(--tv-text-primary)', fontWeight: 500 }}>{notice}</div></div>
            <div className="item-right">
              <button className="icon-btn" title="Dismiss" onClick={() => setNotice('')}><i className="ti ti-x"></i></button>
            </div>
          </div>
        </div>
      )}

      {/* Error card (dismissible; Retry only reloads for genuine load failures) */}
      {error && (
        <div className="card" style={{ borderColor: 'var(--tv-negative)', marginBottom: 12 }}>
          <div className="list-item" style={{ padding: 0 }}>
            <div className="item-icon icon-red"><i className="ti ti-alert-triangle"></i></div>
            <div className="item-main">
              <div className="item-name">Something went wrong</div>
              <div className="item-sub">{error}</div>
            </div>
            <div className="item-right" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => { setError(''); refreshEverything(); }}>
                <i className="ti ti-refresh"></i> Retry
              </button>
              <button className="icon-btn" title="Dismiss" onClick={() => setError('')}><i className="ti ti-x"></i></button>
            </div>
          </div>
        </div>
      )}

      {/* QuickBooks connect prompt — optional; dismissible for manual/linked users */}
      {!loading && !connected && !qboDismissed && hasContext && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="list-item" style={{ padding: 0 }}>
            <div className="item-icon icon-blue"><i className="ti ti-plug"></i></div>
            <div className="item-main">
              <div className="item-name">Connect QuickBooks <span className="badge badge-gray" style={{ marginLeft: 4 }}>optional</span></div>
              <div className="item-sub">Prefer to track manually or via linked accounts? You're all set. Connect QuickBooks only if you want to auto-sync revenue, expenses and invoices.</div>
            </div>
            <div className="item-right" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button className="btn btn-primary btn-sm" onClick={handleConnect} disabled={connecting}>
                <i className={`ti ${connecting ? 'ti-loader spin' : 'ti-plug'}`}></i>
                {connecting ? ' Connecting…' : ' Connect'}
              </button>
              <button className="icon-btn" title="Dismiss" onClick={() => { setQboDismissed(true); writeLS(LS_QBO_DISMISSED, true); }}><i className="ti ti-x"></i></button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="card"><div className="empty-state"><i className="ti ti-loader spin"></i><p>Loading business data…</p></div></div>
      ) : !hasContext ? (
        <div className="card">
          <div className="empty-state" style={{ paddingBottom: 8 }}>
            <i className="ti ti-building-store"></i>
            <p style={{ fontWeight: 600, color: 'var(--tv-text-primary)', marginBottom: 4 }}>Set up your first business</p>
            <p style={{ marginBottom: 4 }}>Track each business separately — its own accounts, cash flow, invoices and documents — with a consolidated view across all of them.</p>
          </div>
          {/* Guided 3-step first run */}
          <div className="card-grid" style={{ marginTop: 4 }}>
            <div className="card" style={{ borderTop: '3px solid var(--tv-forest)' }}>
              <div className="item-icon icon-forest" style={{ marginBottom: 8 }}><i className="ti ti-building-store"></i></div>
              <div className="item-name">1 · Add a business</div>
              <div className="item-sub" style={{ marginBottom: 10 }}>Name it, pick the entity type — that's it. You can add more anytime.</div>
              <button className="btn btn-primary btn-sm" onClick={() => setShowAddBusiness(true)}><i className="ti ti-plus"></i> Add a business</button>
            </div>
            <div className="card" style={{ borderTop: '3px solid var(--tv-positive)' }}>
              <div className="item-icon icon-green" style={{ marginBottom: 8 }}><i className="ti ti-plug-connected"></i></div>
              <div className="item-name">2 · Link its accounts</div>
              <div className="item-sub">Link a bank or credit card and assign it to the business — transactions sync automatically. Or add a manual account.</div>
            </div>
            <div className="card" style={{ borderTop: '3px solid var(--tv-forest-light)' }}>
              <div className="item-icon icon-blue" style={{ marginBottom: 8 }}><i className="ti ti-file-invoice"></i></div>
              <div className="item-name">3 · Invoice &amp; file</div>
              <div className="item-sub">Create invoices, track pending payments, and keep receipts &amp; contracts in the document center — filed by year.</div>
            </div>
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

          {/* Period selector — drives the flow KPIs (revenue/expenses/profit).
              Balances & outstanding AR stay point-in-time (today). */}
          {!connected && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 12.5, color: 'var(--tv-text-muted)', fontWeight: 500 }}>
                <i className="ti ti-calendar-stats" style={{ marginRight: 4 }}></i>Period
              </span>
              {[
                { k: 'THIS_MONTH', label: 'This month' },
                { k: 'THIS_YEAR', label: 'This year' },
                { k: 'T12M', label: 'Trailing 12 mo' },
                { k: 'CUSTOM', label: 'Custom' },
              ].map((p) => (
                <button key={p.k} className={`seg-btn ${dashPeriod === p.k ? 'active' : ''}`} onClick={() => setDashPeriod(p.k)}>
                  {p.label}
                </button>
              ))}
              {dashPeriod === 'CUSTOM' && (
                <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <input type="date" className="tv-input" style={{ height: 30, padding: '2px 8px' }} value={dashFrom} onChange={(e) => setDashFrom(e.target.value)} />
                  <span style={{ color: 'var(--tv-text-muted)' }}>→</span>
                  <input type="date" className="tv-input" style={{ height: 30, padding: '2px 8px' }} value={dashTo} onChange={(e) => setDashTo(e.target.value)} />
                </span>
              )}
            </div>
          )}

          {/* KPI Row */}
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-label"><i className="ti ti-arrow-up" style={{ fontSize: '13px', color: 'var(--tv-positive)' }}></i> Revenue{connected ? ' (MTD)' : ''}</div>
              <div className="kpi-value">{currency(kpi.revenueMtd)}</div>
              {connected ? (
                <div className={`kpi-delta ${changePct >= 0 ? 'pos' : 'neg'}`}>
                  <i className={changePct >= 0 ? 'ti ti-arrow-up-right' : 'ti ti-arrow-down-right'}></i>
                  {changePct >= 0 ? '+' : ''}{changePct.toFixed(1)}% vs last month
                </div>
              ) : (<div className="kpi-delta" style={{ color: 'var(--tv-text-muted)' }}>{dashRange.label}</div>)}
            </div>
            <div className="kpi-card">
              <div className="kpi-label"><i className="ti ti-arrow-down" style={{ fontSize: '13px', color: 'var(--tv-negative)' }}></i> Expenses{connected ? ' (MTD)' : ''}</div>
              <div className="kpi-value">{currency(kpi.expensesMtd)}</div>
              {!connected && <div className="kpi-delta" style={{ color: 'var(--tv-text-muted)' }}>{dashRange.label}</div>}
            </div>
            <div className="kpi-card">
              <div className="kpi-label"><i className="ti ti-chart-line" style={{ fontSize: '13px', color: 'var(--tv-forest-light)' }}></i> Net Profit{connected ? ' (MTD)' : ''}</div>
              <div className="kpi-value">{currency(kpi.netProfitMtd)}</div>
              {!connected && <div className="kpi-delta" style={{ color: 'var(--tv-text-muted)' }}>{dashRange.label}</div>}
            </div>
            <div className="kpi-card">
              <div className="kpi-label"><i className="ti ti-file-invoice" style={{ fontSize: '13px', color: 'var(--tv-forest-light)' }}></i> Outstanding Invoices</div>
              <div className="kpi-value">{currency(kpi.outstandingInvoices)}</div>
              {!connected && <div className="kpi-delta" style={{ color: 'var(--tv-text-muted)' }}>As of today</div>}
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
                <span className="badge badge-gray">{dashRange.label} · click a row to open</span>
              </div>
              <div className="table-scroll">
                <table className="tv-table">
                  <thead>
                    <tr>
                      <th>Business</th>
                      <th style={{ textAlign: 'right' }}>Revenue</th>
                      <th style={{ textAlign: 'right' }}>Expenses</th>
                      <th style={{ textAlign: 'right' }}>Net</th>
                      <th style={{ textAlign: 'right' }}>Cash</th>
                      <th style={{ textAlign: 'right' }}>Outstanding</th>
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
                        <td style={{ textAlign: 'right' }}><span className="item-amount">{currency(b.cashOnHand)}</span></td>
                        <td style={{ textAlign: 'right' }}><span className="item-amount">{currency(b.outstanding)}</span></td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: '2px solid var(--tv-border)', fontWeight: 600 }}>
                      <td>All businesses</td>
                      <td style={{ textAlign: 'right' }}>{currency(byBusiness.reduce((s, b) => s + b.revenue, 0))}</td>
                      <td style={{ textAlign: 'right' }}>{currency(byBusiness.reduce((s, b) => s + b.expenses, 0))}</td>
                      <td style={{ textAlign: 'right' }}>{currency(byBusiness.reduce((s, b) => s + b.net, 0))}</td>
                      <td style={{ textAlign: 'right' }}>{currency(byBusiness.reduce((s, b) => s + b.cashOnHand, 0))}</td>
                      <td style={{ textAlign: 'right' }}>{currency(byBusiness.reduce((s, b) => s + b.outstanding, 0))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Expandable per-business accordion — each business expands in place to
              reveal its own (one-to-one) accounts, cards, KPIs and transactions. */}
          {isAllView && businesses.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="section-header">
                <div className="section-title">
                  <i className="ti ti-stack-2" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>
                  Businesses
                  <span className="badge badge-gray" style={{ marginLeft: 8 }}>{businesses.length}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setExpandedBiz(new Set(businesses.map((b) => b.id)))}>Expand all</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setExpandedBiz(new Set())}>Collapse all</button>
                </div>
              </div>
              <p className="item-sub" style={{ marginTop: -4, marginBottom: 12 }}>
                Each business keeps its own accounts, cards and transactions. Expand one to see its detail, or open it for full tools.
              </p>
              {businesses.map((b) => {
                const g = accountsByBusiness.get(b.id) || { bank: [], cards: [], all: [] };
                const kb = breakdownById.get(b.id) || { revenue: 0, expenses: 0, netProfit: 0, cashOnHand: 0, creditOwed: 0, outstandingInvoices: 0 };
                const tx = txByBusiness.get(b.id) || [];
                const open = expandedBiz.has(b.id);
                return (
                  <div key={b.id} className="card" style={{ marginBottom: 10, padding: 0, overflow: 'hidden' }}>
                    {/* Panel header (click to expand/collapse) */}
                    <div onClick={() => toggleExpandBiz(b.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: 'pointer' }}>
                      <i className={`ti ${open ? 'ti-chevron-down' : 'ti-chevron-right'}`} style={{ color: 'var(--tv-text-muted)' }}></i>
                      <div className="item-icon icon-forest"><i className="ti ti-briefcase"></i></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="item-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.name}</div>
                        <div className="item-sub">
                          {b.entityType || 'Business'}{b.industry ? ` · ${b.industry}` : ''} · {g.all.length} account{g.all.length === 1 ? '' : 's'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div className="item-amount">{currency(kb.cashOnHand)}</div>
                        <div className="item-sub">Net <span style={{ color: kb.netProfit >= 0 ? 'var(--tv-positive)' : 'var(--tv-negative)' }}>{currency(kb.netProfit)}</span> · {dashRange.label}</div>
                      </div>
                    </div>

                    {open && (
                      <div style={{ borderTop: '1px solid var(--tv-border)', padding: '14px 16px' }}>
                        {/* Compact period KPIs */}
                        <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 14 }}>
                          <div className="kpi-card"><div className="kpi-label">Revenue</div><div className="kpi-value" style={{ fontSize: 18 }}>{currency(kb.revenue)}</div></div>
                          <div className="kpi-card"><div className="kpi-label">Expenses</div><div className="kpi-value" style={{ fontSize: 18 }}>{currency(kb.expenses)}</div></div>
                          <div className="kpi-card"><div className="kpi-label">Cash</div><div className="kpi-value" style={{ fontSize: 18 }}>{currency(kb.cashOnHand)}</div></div>
                          <div className="kpi-card"><div className="kpi-label">Outstanding</div><div className="kpi-value" style={{ fontSize: 18 }}>{currency(kb.outstandingInvoices)}</div></div>
                        </div>

                        {/* Accounts — bank */}
                        <div className="item-sub" style={{ fontWeight: 600, margin: '4px 0 6px' }}><i className="ti ti-building-bank" style={{ marginRight: 4 }}></i>Bank accounts</div>
                        {g.bank.length === 0 ? (
                          <div className="item-sub" style={{ marginBottom: 10 }}>No bank accounts linked to this business yet.</div>
                        ) : (
                          <div style={{ marginBottom: 10 }}>
                            {g.bank.map((a) => (
                              <div key={a.key} className="list-item">
                                <div className={`item-icon ${accountVisual(a.type).tone}`}><i className={`ti ${accountVisual(a.type).icon}`}></i></div>
                                <div className="item-main" style={{ minWidth: 0 }}>
                                  <div className="item-name">{a.name}{a.mask ? ` ••${a.mask}` : ''}</div>
                                  <div className="item-sub">{accountTypeLabel(a.type)}{a.institution ? ` · ${a.institution}` : ''} · <span className="badge badge-gray">{a.source}</span></div>
                                </div>
                                <div className="item-right"><span className="item-amount">{currency(a.balance)}</span></div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Accounts — cards */}
                        <div className="item-sub" style={{ fontWeight: 600, margin: '4px 0 6px' }}><i className="ti ti-credit-card" style={{ marginRight: 4 }}></i>Credit cards</div>
                        {g.cards.length === 0 ? (
                          <div className="item-sub" style={{ marginBottom: 10 }}>No credit cards linked to this business yet.</div>
                        ) : (
                          <div style={{ marginBottom: 10 }}>
                            {g.cards.map((a) => (
                              <div key={a.key} className="list-item">
                                <div className={`item-icon ${accountVisual(a.type).tone}`}><i className={`ti ${accountVisual(a.type).icon}`}></i></div>
                                <div className="item-main" style={{ minWidth: 0 }}>
                                  <div className="item-name">{a.name}{a.mask ? ` ••${a.mask}` : ''}</div>
                                  <div className="item-sub">{a.institution ? `${a.institution} · ` : ''}<span className="badge badge-gray">{a.source}</span></div>
                                </div>
                                <div className="item-right"><span className="item-amount amount-neg">{currency(a.balance)} owed</span></div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Recent transactions */}
                        <div className="item-sub" style={{ fontWeight: 600, margin: '4px 0 6px' }}><i className="ti ti-arrows-exchange" style={{ marginRight: 4 }}></i>Recent transactions</div>
                        {tx.length === 0 ? (
                          <div className="item-sub" style={{ marginBottom: 10 }}>No transactions yet.</div>
                        ) : (
                          <div style={{ marginBottom: 10 }}>
                            {tx.slice(0, 5).map((t) => (
                              <div key={t.key} className="list-item">
                                <div className={`item-icon ${txTypeVisual(t.type).tone}`}><i className={`ti ${txTypeVisual(t.type).icon}`}></i></div>
                                <div className="item-main" style={{ minWidth: 0 }}>
                                  <div className="item-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                                  <div className="item-sub">{t.category}{t.date ? ` · ${bizDate(t.date)}` : ''}</div>
                                </div>
                                <div className="item-right"><span className={`item-amount ${t.amount >= 0 ? 'amount-pos' : 'amount-neg'}`}>{currency(t.amount)}</span></div>
                              </div>
                            ))}
                          </div>
                        )}

                        <button className="btn btn-primary btn-sm" onClick={() => { setSelectedId(b.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                          <i className="ti ti-external-link"></i> Open {b.name}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
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
                <PlaidLinkButton onLinkSuccess={handleLinkSuccess}>
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
                        // One-to-one: if this account already belongs to a DIFFERENT
                        // business, ticking it here moves it. Show the current owner.
                        const owner = linkedOwner.get(String(a.rawId));
                        const ownedElsewhere = owner != null && owner !== selectedBusiness?.id;
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
                              <div className="item-sub">
                                {accountTypeLabel(a.type)}{a.institution ? ` · ${a.institution}` : ''} · {currency(a.balance)}
                                {ownedElsewhere && (
                                  <span className="badge badge-amber" style={{ marginLeft: 6 }}>
                                    on {businessNameById.get(owner) || 'another business'} — moves here
                                  </span>
                                )}
                              </div>
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
          {/* TAB — Overview (Command Center + financial intelligence)     */}
          {/* ============================================================ */}
          {activeTab === 'overview' && (
            <>
              {/* Command Center — daily snapshot */}
              <div className="kpi-grid" style={{ marginBottom: 16 }}>
                <div className="kpi-card" style={{ '--kpi-accent': 'var(--tv-forest-light)' }}>
                  <div className="kpi-label"><span className="kpi-icon"><i className="ti ti-wallet"></i></span><span className="kpi-label-text">Available cash</span></div>
                  <div className="kpi-value">{currency(cashTotal)}</div>
                  <div className="kpi-delta flat">
                    <span className="kpi-delta-sub"><i className="ti ti-clock-hour-4"></i>
                      {runwayMonths === Infinity ? 'Not burning cash' : `${runwayMonths.toFixed(1)} mo runway`}</span>
                  </div>
                </div>
                <div className="kpi-card" style={{ '--kpi-accent': 'var(--tv-warning)' }}>
                  <div className="kpi-label"><span className="kpi-icon"><i className="ti ti-file-invoice"></i></span><span className="kpi-label-text">Receivables due</span></div>
                  <div className="kpi-value">{currency(arAging.total)}</div>
                  <div className={`kpi-delta ${arAging.overdue > 0 ? 'neg' : 'pos'}`}>
                    <span className="kpi-delta-badge"><i className={`ti ${arAging.overdue > 0 ? 'ti-alert-triangle' : 'ti-check'}`}></i>
                      {arAging.overdue > 0 ? `${currency(arAging.overdue)} overdue` : 'All current'}</span>
                  </div>
                </div>
                <div className="kpi-card" style={{ '--kpi-accent': 'var(--tv-negative)' }}>
                  <div className="kpi-label"><span className="kpi-icon"><i className="ti ti-credit-card"></i></span><span className="kpi-label-text">Card balances owed</span></div>
                  <div className="kpi-value">{currency(creditOwed)}</div>
                  <div className="kpi-delta flat"><span className="kpi-delta-sub">{creditCards.length} card{creditCards.length === 1 ? '' : 's'}</span></div>
                </div>
                <div className="kpi-card" style={{ '--kpi-accent': 'var(--tv-forest-light)' }}>
                  <div className="kpi-label"><span className="kpi-icon"><i className="ti ti-chart-line"></i></span><span className="kpi-label-text">Net profit</span></div>
                  <div className="kpi-value">{currency(periodFlow.netProfit)}</div>
                  <div className={`kpi-delta ${periodFlow.netProfit >= 0 ? 'pos' : 'neg'}`}>
                    <span className="kpi-delta-sub"><span className="kpi-delta-period">{dashRange.label}</span></span>
                  </div>
                </div>
                <div className="kpi-card" style={{ '--kpi-accent': 'var(--tv-gold)' }}>
                  <div className="kpi-label"><span className="kpi-icon"><i className="ti ti-arrow-up"></i></span><span className="kpi-label-text">Revenue</span></div>
                  <div className="kpi-value">{currency(periodFlow.revenue)}</div>
                  <div className="kpi-delta flat"><span className="kpi-delta-sub"><span className="kpi-delta-period">{dashRange.label}</span></span></div>
                </div>
                <div className="kpi-card kpi-clickable" style={{ '--kpi-accent': health.color }}
                  onClick={() => document.getElementById('mb-health')?.scrollIntoView({ behavior: 'smooth' })}>
                  <div className="kpi-label"><span className="kpi-icon"><i className="ti ti-heart-rate-monitor"></i></span><span className="kpi-label-text">Business health</span><i className="ti ti-chevron-right kpi-chevron"></i></div>
                  <div className="kpi-value" style={{ color: health.color }}>{health.score}<span style={{ fontSize: 14, color: 'var(--tv-text-muted)' }}> / 100</span></div>
                  <div className={`kpi-delta ${health.tone === 'neg' ? 'neg' : health.tone === 'warn' ? 'flat' : 'pos'}`}>
                    <span className="kpi-delta-badge">{health.label}</span>
                  </div>
                </div>
              </div>

              {/* Health score + Runway & burn */}
              <div className="grid-2" style={{ marginBottom: 16 }}>
                <div className="card" id="mb-health">
                  <div className="section-header">
                    <div className="section-title"><i className="ti ti-heart-rate-monitor" style={{ marginRight: 6, color: health.color }}></i>Business Health Score</div>
                    <span className={`badge ${health.tone === 'neg' ? 'badge-red' : health.tone === 'warn' ? 'badge-amber' : 'badge-green'}`}>{health.label}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
                    <HealthGauge score={health.score} color={health.color} />
                    <div style={{ flex: 1, minWidth: 200 }}>
                      {health.parts.map((p) => <ScoreBar key={p.label} part={p} />)}
                    </div>
                  </div>
                  <div className="item-sub" style={{ marginTop: 10 }}>
                    A weighted blend of liquidity, profitability, receivables quality, and cash trend — recomputed live from your ledger.
                  </div>
                </div>

                <div className="card">
                  <div className="section-header">
                    <div className="section-title"><i className="ti ti-gauge" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>Runway &amp; burn</div>
                    <span className="badge badge-gray">Trailing 90 days</span>
                  </div>
                  <div className="kpi-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 0 }}>
                    <div className="kpi-card" style={{ boxShadow: 'none' }}>
                      <div className="kpi-label"><span className="kpi-label-text">Cash runway</span></div>
                      <div className="kpi-value">{runwayMonths === Infinity ? '∞' : `${runwayMonths.toFixed(1)}`}<span style={{ fontSize: 13, color: 'var(--tv-text-muted)' }}> mo</span></div>
                    </div>
                    <div className="kpi-card" style={{ boxShadow: 'none' }}>
                      <div className="kpi-label"><span className="kpi-label-text">Monthly burn</span></div>
                      <div className="kpi-value">{currency(monthlyBurn)}</div>
                    </div>
                    <div className="kpi-card" style={{ boxShadow: 'none' }}>
                      <div className="kpi-label"><span className="kpi-label-text">Avg daily net</span></div>
                      <div className="kpi-value" style={{ color: dailyNet >= 0 ? 'var(--tv-positive)' : 'var(--tv-negative)' }}>{dailyNet >= 0 ? '+' : ''}{currency(dailyNet)}</div>
                    </div>
                    <div className="kpi-card" style={{ boxShadow: 'none' }}>
                      <div className="kpi-label"><span className="kpi-label-text">90-day low point</span></div>
                      <div className="kpi-value" style={{ color: forecast.low.balance < 0 ? 'var(--tv-negative)' : 'var(--tv-text-primary)' }}>{currency(forecast.low.balance)}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 90-day cash-flow forecast */}
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="section-header">
                  <div className="section-title"><i className="ti ti-chart-area-line" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>90-day cash forecast</div>
                  {forecast.shortfallDay != null
                    ? <span className="badge badge-red"><i className="ti ti-alert-triangle"></i> Shortfall in {forecast.shortfallDay}d</span>
                    : <span className="badge badge-green"><i className="ti ti-check"></i> No shortfall projected</span>}
                </div>
                {forecast.hasTrend ? (
                  <>
                    <ForecastChart forecast={forecast} />
                    <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 14, marginBottom: 0 }}>
                      {[['In 30 days', forecast.d30], ['In 60 days', forecast.d60], ['In 90 days', forecast.d90]].map(([lbl, val]) => (
                        <div className="kpi-card" key={lbl} style={{ boxShadow: 'none' }}>
                          <div className="kpi-label"><span className="kpi-label-text">{lbl}</span></div>
                          <div className="kpi-value" style={{ color: val < 0 ? 'var(--tv-negative)' : 'var(--tv-text-primary)' }}>{currency(val)}</div>
                        </div>
                      ))}
                    </div>
                    <div className="item-sub" style={{ marginTop: 10 }}>
                      Projects available cash from your 90-day trend{forecast.overdueAR > 0 ? `, plus expected collection of ${currency(forecast.overdueAR)} in overdue receivables (~2 weeks out)` : ''}. An estimate, not a guarantee.
                    </div>
                  </>
                ) : (
                  <div className="empty-state"><i className="ti ti-chart-area-line"></i><p>Not enough transaction history yet. Link an account or add transactions to project your cash.</p></div>
                )}
              </div>

              {/* AR aging */}
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="section-header">
                  <div className="section-title"><i className="ti ti-clock-dollar" style={{ marginRight: 6, color: 'var(--tv-warning)' }}></i>Receivables aging</div>
                  <span className="badge badge-gray">{currency(arAging.total)} outstanding</span>
                </div>
                {arAging.total > 0 ? (
                  <AgingBars aging={arAging} onEmail={remindAllOverdue} busy={reminding} />
                ) : (
                  <div className="empty-state"><i className="ti ti-checks"></i><p>No outstanding invoices — nothing to age. Create an invoice from Business Tools to start tracking receivables.</p></div>
                )}
              </div>

              {/* Smart insights */}
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="section-header">
                  <div className="section-title"><i className="ti ti-bulb" style={{ marginRight: 6, color: 'var(--tv-gold)' }}></i>Smart insights</div>
                  <span className="badge badge-gray">{insights.length} alert{insights.length === 1 ? '' : 's'}</span>
                </div>
                {insights.length === 0 ? (
                  <div className="empty-state"><i className="ti ti-bulb"></i><p>No alerts right now. As your ledger fills in, we'll surface risks and opportunities here.</p></div>
                ) : (
                  <div>{insights.map((ins, i) => <InsightRow key={i} ins={ins} />)}</div>
                )}
              </div>
            </>
          )}

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
          {/* TAB — Expenses (tracker + spend analytics)                   */}
          {/* ============================================================ */}
          {activeTab === 'expenses' && (
            isAllView || !selectedBusiness ? (
              <div className="card">
                <div className="empty-state">
                  <i className="ti ti-receipt-2"></i>
                  <p>Pick a single business above to track its expenses.</p>
                  <div className="item-sub" style={{ marginTop: 6 }}>
                    You can still export a combined report for every business from any one of them.
                  </div>
                </div>
              </div>
            ) : (
              <ExpensesTab
                businessId={selectedBusiness.id}
                businessName={selectedBusiness.name}
                businesses={businesses}
                transactions={unifiedTx}
                ledgerCategories={categoryOptions.filter((c) => c !== 'ALL')}
                CategoryBars={CategoryBars}
                onDocumentsChanged={() => loadBusinessDetail(selectedBusiness.id)}
              />
            )
          )}

          {/* ============================================================ */}
          {/* TAB — Credit Cards                                           */}
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

                {/* Spend-by-category and Top-vendors moved to the Expenses tab, where the
                    expense tracker lives — they were never card-specific. */}
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

              </div>

              {/* Recurring charges / subscriptions */}
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="section-header">
                  <div className="section-title">
                    <i className="ti ti-refresh" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>
                    Recurring &amp; subscriptions
                    {recurring.length > 0 && <span className="badge badge-forest" style={{ marginLeft: 8 }}>{currency(recurringMonthly)}/mo</span>}
                  </div>
                  {recurring.length > 0 && <span className="badge badge-gray">{currency(recurringMonthly * 12)}/yr committed</span>}
                </div>
                {recurring.length === 0 ? (
                  <div className="empty-state"><i className="ti ti-refresh"></i><p>No recurring charges detected yet. Once a vendor bills you on a regular cadence, it'll show here so you can spot and cut fixed costs.</p></div>
                ) : (
                  <div className="table-scroll">
                    <table className="tv-table">
                      <thead><tr><th>Merchant</th><th>Cadence</th><th>Category</th><th>Next</th><th style={{ textAlign: 'right' }}>Per charge</th><th style={{ textAlign: 'right' }}>Per month</th></tr></thead>
                      <tbody>
                        {recurring.map((r) => (
                          <tr key={r.label + r.cadence}>
                            <td style={{ fontWeight: 500 }}>{r.label}</td>
                            <td><span className="badge badge-gray">{r.cadence}</span></td>
                            <td style={{ color: 'var(--tv-text-muted)' }}>{r.category || '—'}</td>
                            <td style={{ color: 'var(--tv-text-muted)' }}>{bizDate(r.next.toISOString().slice(0, 10))}</td>
                            <td style={{ textAlign: 'right' }}><span className="item-amount amount-neg">{currency(r.amount)}</span></td>
                            <td style={{ textAlign: 'right' }}><span className="item-amount">{currency(r.perMonth)}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="item-sub" style={{ marginTop: 10 }}>
                      <i className="ti ti-bulb" style={{ color: 'var(--tv-gold)' }}></i> {recurring.length} recurring charge{recurring.length === 1 ? '' : 's'} detected — reviewing these is often the fastest way to cut fixed costs.
                    </div>
                  </div>
                )}
              </div>

              {/* Vendor management — computed spend + persisted overlay */}
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="section-header">
                  <div className="section-title">
                    <i className="ti ti-building-store" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>
                    Vendors
                    <span className="badge badge-gray" style={{ marginLeft: 8 }}>{vendorAgg.length}</span>
                    {upcomingRenewals.length > 0 && <span className="badge badge-amber" style={{ marginLeft: 4 }}>{upcomingRenewals.length} renewal{upcomingRenewals.length === 1 ? '' : 's'} soon</span>}
                  </div>
                </div>
                {vendorAgg.length === 0 ? (
                  <div className="empty-state"><i className="ti ti-building-store"></i><p>No vendor spend recorded yet. Vendors appear here as you log or sync expenses.</p></div>
                ) : (
                  <>
                    {upcomingRenewals.length > 0 && (
                      <div style={{ marginBottom: 12, padding: '8px 12px', borderLeft: '3px solid var(--tv-gold)', background: 'var(--tv-gold-pale)', borderRadius: '0 var(--radius-sm) var(--radius-sm) 0', fontSize: 13, color: 'var(--tv-text-secondary)' }}>
                        <i className="ti ti-calendar-due" style={{ marginRight: 6, color: 'var(--tv-gold)' }}></i>
                        Upcoming renewals: {upcomingRenewals.map((v) => `${v.name} (${v.renewalIn <= 0 ? 'due' : `${v.renewalIn}d`})`).join(' · ')}
                      </div>
                    )}
                    {!selectedBusiness && <div className="item-sub" style={{ marginBottom: 8 }}>Select a single business to save vendor status, renewals, and notes.</div>}
                    <div className="table-scroll">
                      <table className="tv-table">
                        <thead><tr><th>Vendor</th><th>Category</th><th style={{ textAlign: 'right' }}>Spend ({dashRange.label})</th><th style={{ textAlign: 'right' }}>Total</th><th>Last paid</th><th>Status</th><th>Renewal</th>{selectedBusiness && <th style={{ width: 40 }}></th>}</tr></thead>
                        <tbody>
                          {vendorAgg.map((v) => {
                            const statusBadgeCls = v.status === 'INACTIVE' ? 'badge-gray' : v.status === 'REVIEW' ? 'badge-amber' : 'badge-green';
                            const statusLabel = v.status === 'INACTIVE' ? 'Inactive' : v.status === 'REVIEW' ? 'Review' : 'Active';
                            const editing = vendorEditKey === v.name;
                            return (
                              <Fragment key={v.name}>
                                <tr>
                                  <td style={{ fontWeight: 500 }}>{v.name} {v.recurring && <span className="badge badge-forest" style={{ marginLeft: 4 }} title="Recurring charge"><i className="ti ti-refresh"></i></span>}</td>
                                  <td style={{ color: 'var(--tv-text-muted)' }}>{v.topCategory}</td>
                                  <td style={{ textAlign: 'right' }}><span className="item-amount">{currency(v.period)}</span></td>
                                  <td style={{ textAlign: 'right', color: 'var(--tv-text-muted)' }}>{currency(v.total)}</td>
                                  <td style={{ color: 'var(--tv-text-muted)' }}>{v.last ? bizDate(v.last.toISOString().slice(0, 10)) : '—'}</td>
                                  <td><span className={`badge ${statusBadgeCls}`}>{statusLabel}</span></td>
                                  <td style={{ color: 'var(--tv-text-muted)', whiteSpace: 'nowrap' }}>{v.renewalDate ? bizDate(v.renewalDate) : '—'}</td>
                                  {selectedBusiness && (
                                    <td style={{ textAlign: 'right' }}>
                                      <button className="icon-btn" title="Edit vendor" onClick={() => (editing ? setVendorEditKey(null) : openVendorEdit(v))}><i className={`ti ${editing ? 'ti-x' : 'ti-pencil'}`}></i></button>
                                    </td>
                                  )}
                                </tr>
                                {editing && (
                                  <tr>
                                    <td colSpan={8} style={{ background: 'var(--tv-bg-subtle, rgba(0,0,0,.02))' }}>
                                      <div className="grid-3" style={{ gap: 10, alignItems: 'end' }}>
                                        <div className="form-group" style={{ marginBottom: 0 }}>
                                          <label className="form-label">Status</label>
                                          <select className="form-select" value={vendorForm.status} onChange={(e) => setVendorForm({ ...vendorForm, status: e.target.value })}>
                                            <option value="ACTIVE">Active</option><option value="REVIEW">Review</option><option value="INACTIVE">Inactive</option>
                                          </select>
                                        </div>
                                        <div className="form-group" style={{ marginBottom: 0 }}>
                                          <label className="form-label">Contract renewal</label>
                                          <input className="form-input" type="date" value={vendorForm.renewalDate} onChange={(e) => setVendorForm({ ...vendorForm, renewalDate: e.target.value })} />
                                        </div>
                                        <div className="form-group" style={{ marginBottom: 0 }}>
                                          <label className="form-label">Notes</label>
                                          <input className="form-input" value={vendorForm.notes} onChange={(e) => setVendorForm({ ...vendorForm, notes: e.target.value })} placeholder="e.g. renegotiate rate" />
                                        </div>
                                      </div>
                                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                        <button className="btn btn-primary btn-sm" onClick={() => saveVendor(v.name)}><i className="ti ti-check"></i> Save</button>
                                        <button className="btn btn-secondary btn-sm" onClick={() => setVendorEditKey(null)}>Cancel</button>
                                        {v.hasMeta && <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => clearVendor(v.name)}><i className="ti ti-trash"></i> Clear</button>}
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
                  </>
                )}
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

              {/* Budgets & variance (per selected business, current month) */}
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="section-header">
                  <div className="section-title">
                    <i className="ti ti-target" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>
                    Budgets &amp; variance
                    <span className="badge badge-gray" style={{ marginLeft: 8 }}>This month</span>
                    {budgetTotals.overCount > 0 && <span className="badge badge-red" style={{ marginLeft: 4 }}>{budgetTotals.overCount} over</span>}
                  </div>
                  {budgetRows.length > 0 && (
                    <span className={`badge ${budgetTotals.over ? 'badge-red' : 'badge-green'}`}>
                      {currency(budgetTotals.spent)} / {currency(budgetTotals.limit)}
                    </span>
                  )}
                </div>

                {!selectedBusiness ? (
                  <div className="empty-state"><i className="ti ti-target"></i><p>{isAllView ? 'Select a single business (top-left) to set and track its budgets.' : 'Add a business first to set category budgets.'}</p></div>
                ) : (
                  <>
                    {budgetRows.length === 0 ? (
                      <div className="empty-state" style={{ paddingBottom: 8 }}><i className="ti ti-target"></i><p>No budgets yet. Set a monthly limit for a category to track spending against plan.</p></div>
                    ) : (
                      <div style={{ marginBottom: 12 }}>
                        {budgetRows.map((r) => {
                          const color = r.over ? 'var(--tv-negative)' : r.pct >= 0.8 ? 'var(--tv-warning)' : 'var(--tv-positive)';
                          return (
                            <div key={r.category} style={{ marginBottom: 12 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, marginBottom: 3, gap: 8 }}>
                                <span style={{ color: 'var(--tv-text-primary)', fontWeight: 500 }}>{r.category}</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span className="item-amount" style={{ color }}>{currency(r.spent)}</span>
                                  <span style={{ color: 'var(--tv-text-muted)' }}>/ {currency(r.limit)}</span>
                                  <input type="number" min="0" step="1" defaultValue={r.limit} title="Monthly limit"
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveBudget(r.category, e.target.value); e.target.blur(); } }}
                                    onBlur={(e) => { if (Number(e.target.value) !== r.limit) saveBudget(r.category, e.target.value); }}
                                    className="form-input" style={{ width: 92, padding: '4px 8px', height: 'auto' }} />
                                  <button className="icon-btn" title="Remove budget" onClick={() => removeBudget(r.category)}><i className="ti ti-trash"></i></button>
                                </span>
                              </div>
                              <div className="progress-bar"><div className="progress-fill" style={{ width: `${Math.min(100, r.pct * 100)}%`, background: color }}></div></div>
                              <div className="item-sub" style={{ marginTop: 2 }}>
                                {r.over
                                  ? <span style={{ color: 'var(--tv-negative)' }}>Over by {currency(r.spent - r.limit)} ({Math.round(r.pct * 100)}%)</span>
                                  : <span>{currency(r.remaining)} left ({Math.round(r.pct * 100)}% used)</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="grid-2" style={{ alignItems: 'end' }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Category</label>
                        <select className="form-select" value={budgetForm.category} onChange={(e) => setBudgetForm({ ...budgetForm, category: e.target.value })}>
                          <option value="">Select a category…</option>
                          {budgetableCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Monthly limit</label>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input className="form-input" type="number" min="0" step="1" value={budgetForm.limit}
                            onChange={(e) => setBudgetForm({ ...budgetForm, limit: e.target.value })} placeholder="e.g. 2000" />
                          <button className="btn btn-primary btn-sm" disabled={!budgetForm.category || !(Number(budgetForm.limit) > 0)}
                            onClick={() => saveBudget(budgetForm.category, budgetForm.limit)}>
                            <i className="ti ti-plus"></i> Set
                          </button>
                        </div>
                      </div>
                    </div>
                    {budgetTotals.overCount > 0 && (
                      <div className="item-sub" style={{ marginTop: 10, color: 'var(--tv-negative)' }}>
                        <i className="ti ti-alert-triangle"></i> {budgetTotals.overCount} categor{budgetTotals.overCount === 1 ? 'y is' : 'ies are'} over budget this month.
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Goals — cash reserve + tax set-aside (per selected business) */}
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="section-header">
                  <div className="section-title">
                    <i className="ti ti-flag" style={{ marginRight: 6, color: 'var(--tv-gold)' }}></i>
                    Goals
                  </div>
                </div>
                {!selectedBusiness ? (
                  <div className="empty-state"><i className="ti ti-flag"></i><p>{isAllView ? 'Select a single business (top-left) to set reserve and tax goals.' : 'Add a business first to set goals.'}</p></div>
                ) : (
                  <div className="grid-2">
                    {/* Cash reserve goal */}
                    <div>
                      <div className="item-name" style={{ marginBottom: 8 }}><i className="ti ti-pig-money" style={{ color: 'var(--tv-forest-light)', marginRight: 6 }}></i>Cash reserve</div>
                      <div className="form-group">
                        <label className="form-label">Target reserve</label>
                        <input className="form-input" type="number" min="0" step="100" value={goals.reserveTarget || ''}
                          placeholder="e.g. 30000"
                          onChange={(e) => setGoals((g) => ({ ...g, reserveTarget: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveGoals({ reserveTarget: Number(e.target.value) || 0 }); e.target.blur(); } }}
                          onBlur={(e) => saveGoals({ reserveTarget: Number(e.target.value) || 0 })} />
                        {monthlyBurn > 0 && (
                          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                            {[1, 3, 6].map((n) => (
                              <button key={n} className="btn btn-secondary btn-sm" title={`${n} month${n === 1 ? '' : 's'} of expenses`}
                                onClick={() => saveGoals({ reserveTarget: Math.round(monthlyBurn * n) })}>{n} mo</button>
                            ))}
                          </div>
                        )}
                      </div>
                      {reservePlan.target > 0 && (
                        <>
                          <div className="progress-bar" style={{ marginTop: 4 }}>
                            <div className="progress-fill" style={{ width: `${reservePlan.pct * 100}%`, background: reservePlan.fullyFunded ? 'var(--tv-positive)' : 'var(--tv-forest-light)' }}></div>
                          </div>
                          <div className="item-sub" style={{ marginTop: 4 }}>
                            {currency(reservePlan.funded)} of {currency(reservePlan.target)} · {Math.round(reservePlan.pct * 100)}%
                            {reservePlan.monthsCovered !== Infinity ? ` · ≈ ${reservePlan.monthsCovered.toFixed(1)} mo of expenses` : ''}
                          </div>
                          <div className="item-sub" style={{ marginTop: 2, color: reservePlan.fullyFunded ? 'var(--tv-positive)' : 'var(--tv-text-muted)' }}>
                            {reservePlan.fullyFunded ? <><i className="ti ti-circle-check"></i> Fully funded</> : `${currency(reservePlan.remaining)} to go`}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Tax set-aside */}
                    <div>
                      <div className="item-name" style={{ marginBottom: 8 }}><i className="ti ti-report-money" style={{ color: 'var(--tv-warning)', marginRight: 6 }}></i>Tax set-aside</div>
                      <div className="grid-2" style={{ gap: 10 }}>
                        <div className="form-group" style={{ marginBottom: 8 }}>
                          <label className="form-label">Tax rate (%)</label>
                          <input className="form-input" type="number" min="0" max="100" step="1" value={goals.taxRate || ''}
                            placeholder="25"
                            onChange={(e) => setGoals((g) => ({ ...g, taxRate: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveGoals({ taxRate: Number(e.target.value) || 0 }); e.target.blur(); } }}
                            onBlur={(e) => saveGoals({ taxRate: Number(e.target.value) || 0 })} />
                        </div>
                        <div className="form-group" style={{ marginBottom: 8 }}>
                          <label className="form-label">Set aside so far</label>
                          <input className="form-input" type="number" min="0" step="100" value={goals.taxSetAside || ''}
                            placeholder="0"
                            onChange={(e) => setGoals((g) => ({ ...g, taxSetAside: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveGoals({ taxSetAside: Number(e.target.value) || 0 }); e.target.blur(); } }}
                            onBlur={(e) => saveGoals({ taxSetAside: Number(e.target.value) || 0 })} />
                        </div>
                      </div>
                      {taxPlan.rate > 0 ? (
                        <>
                          <div className="progress-bar" style={{ marginTop: 4 }}>
                            <div className="progress-fill" style={{ width: `${taxPlan.pct * 100}%`, background: taxPlan.remaining <= 0 ? 'var(--tv-positive)' : 'var(--tv-warning)' }}></div>
                          </div>
                          <div className="item-sub" style={{ marginTop: 4 }}>
                            Recommended {currency(taxPlan.recommended)} ({taxPlan.rate}% of {currency(taxPlan.netProfit)} net · {taxPlan.periodLabel})
                          </div>
                          <div className="item-sub" style={{ marginTop: 2, color: taxPlan.remaining <= 0 ? 'var(--tv-positive)' : 'var(--tv-text-muted)' }}>
                            {taxPlan.remaining <= 0 ? <><i className="ti ti-circle-check"></i> Fully reserved</> : `${currency(taxPlan.remaining)} still to set aside`}
                          </div>
                        </>
                      ) : (
                        <div className="item-sub" style={{ marginTop: 4 }}>Set a tax rate to see how much to reserve from profit. Tip: set the period above to <strong>This year</strong> for annual planning.</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="card" style={{ marginBottom: 16 }}>
                <div className="section-header">
                  <div className="section-title">
                    <i className="ti ti-clock-dollar" style={{ marginRight: 6, color: 'var(--tv-warning)' }}></i>
                    Pending payments
                    <span className="badge badge-amber" style={{ marginLeft: 8 }}>{currency(pendingTotal)} due</span>
                  </div>
                  {arAging.overdue > 0 && (
                    <button className="btn btn-secondary btn-sm" onClick={remindAllOverdue} disabled={reminding} title="Email/text every overdue customer with a contact on file">
                      <i className={`ti ${reminding ? 'ti-loader-2' : 'ti-send'}`}></i> {reminding ? 'Sending…' : 'Remind all overdue'}
                    </button>
                  )}
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
                            {isAllView && businessNameById.get(i.businessId) ? <span className="badge badge-forest" style={{ marginLeft: 4 }}>{businessNameById.get(i.businessId)}</span> : null}
                            {i.dueDate ? ` · Due ${bizDate(i.dueDate)}` : ''}{!i.manual ? ' · QuickBooks' : ''}
                          </div>
                        </div>
                        <div className="item-right" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div className="item-amount">{currency(i.amount)}</div>
                          {i.manual && (() => {
                            const raw = manualInvoices.find((x) => x.id === i.id) || i;
                            return (<>
                              <button className="btn btn-secondary btn-sm" title="Send to customer" onClick={() => setSendInv(raw)}><i className="ti ti-send"></i> Send</button>
                              <button className="btn btn-secondary btn-sm" onClick={() => setPayInv(raw)}><i className="ti ti-cash"></i> Record payment</button>
                            </>);
                          })()}
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
                    <div className="grid-2">
                      <div className="form-group">
                        <label className="form-label">Customer email</label>
                        <input className="form-input" type="email" value={invForm.customerEmail} onChange={(e) => setInvForm({ ...invForm, customerEmail: e.target.value })} placeholder="billing@acme.com" />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Customer phone (for SMS)</label>
                        <input className="form-input" value={invForm.customerPhone} onChange={(e) => setInvForm({ ...invForm, customerPhone: e.target.value })} placeholder="+1 555 123 4567" />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">How to pay (shown to the customer)</label>
                      <input className="form-input" value={invForm.payInstructions} onChange={(e) => setInvForm({ ...invForm, payInstructions: e.target.value })} placeholder="e.g. Zelle to pay@acme.com, or check to Acme LLC" />
                    </div>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={!invForm.customer.trim() || !(Number(invForm.amount) > 0) || !selectedBusiness}>
                      <i className="ti ti-plus"></i> Create invoice
                    </button>
                    {!selectedBusiness && <div className="item-sub" style={{ marginTop: 6 }}>Add a business first to create invoices.</div>}
                  </form>
                )}

                {allInvoices.length === 0 ? (
                  <div className="empty-state"><i className="ti ti-file-invoice"></i><p>No invoices yet. Create one to bill a customer and track payment.</p></div>
                ) : (
                  <div className="table-scroll">
                    <table className="tv-table">
                      <thead><tr><th>Customer</th>{isAllView && <th>Business</th>}<th style={{ textAlign: 'right' }}>Amount</th><th>Status</th><th>Due date</th><th>Source</th><th>Documents</th><th style={{ width: 40 }}></th></tr></thead>
                      <tbody>
                        {allInvoices.map((inv) => {
                          const docCount = inv.manual ? (docCountByInvoice.get(inv.id) || 0) : 0;
                          return (
                          <tr key={inv.key}>
                            <td style={{ fontWeight: 500 }}>{inv.customer || '—'}</td>
                            {isAllView && <td>{businessNameById.get(inv.businessId) || <span style={{ color: 'var(--tv-text-muted)' }}>—</span>}</td>}
                            <td style={{ textAlign: 'right' }}><span className="item-amount">{currency(inv.amount)}</span></td>
                            <td><span className={`badge ${statusBadge(inv.status)}`}>{inv.status}</span></td>
                            <td style={{ color: 'var(--tv-text-muted)' }}>{bizDate(inv.dueDate)}</td>
                            <td><span className={`badge ${inv.manual ? 'badge-forest' : 'badge-green'}`}>{inv.manual ? 'Manual' : 'QuickBooks'}</span></td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {inv.manual ? (
                                <button className="btn btn-secondary btn-sm" onClick={() => openAttachDoc(inv)} title="Attach a document to this invoice">
                                  <i className="ti ti-paperclip"></i>{docCount > 0 ? ` ${docCount}` : ' Attach'}
                                </button>
                              ) : <span style={{ color: 'var(--tv-text-muted)' }}>—</span>}
                            </td>
                            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                              {inv.manual && (() => {
                                const raw = manualInvoices.find((x) => x.id === inv.id) || inv;
                                return (<>
                                  <button className="btn btn-secondary btn-sm" title="Send to customer" onClick={() => setSendInv(raw)}><i className="ti ti-send"></i></button>
                                  {inv.status !== 'PAID' && (
                                    <button className="btn btn-secondary btn-sm" style={{ marginLeft: 4 }} title="Record payment" onClick={() => setPayInv(raw)}><i className="ti ti-cash"></i></button>
                                  )}
                                  <button className="icon-btn" style={{ marginLeft: 4 }} title="Delete invoice" onClick={() => handleDeleteInvoice(inv.id)}><i className="ti ti-trash"></i></button>
                                </>);
                              })()}
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Customer payment insights — who pays, who's late */}
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="section-header">
                  <div className="section-title"><i className="ti ti-users" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>Customers</div>
                  <span className="badge badge-gray">{customerInsights.length}</span>
                </div>
                {customerInsights.length === 0 ? (
                  <div className="empty-state"><i className="ti ti-users"></i><p>No customers yet. Create an invoice to start tracking who pays on time.</p></div>
                ) : (
                  <div className="table-scroll">
                    <table className="tv-table">
                      <thead><tr><th>Customer</th><th style={{ textAlign: 'right' }}>Billed</th><th style={{ textAlign: 'right' }}>Outstanding</th><th style={{ textAlign: 'right' }}>Overdue</th><th>Standing</th></tr></thead>
                      <tbody>
                        {customerInsights.map((c) => {
                          const label = c.overdue > 0
                            ? (c.riskPct >= 0.5 ? { cls: 'badge-red', txt: 'High risk' } : { cls: 'badge-amber', txt: 'Late' })
                            : c.outstanding > 0
                              ? { cls: 'badge-gray', txt: 'Current' }
                              : { cls: 'badge-green', txt: 'Paid up' };
                          return (
                            <tr key={c.name}>
                              <td style={{ fontWeight: 500 }}>{c.name} <span style={{ color: 'var(--tv-text-muted)', fontWeight: 400, fontSize: 12 }}>· {c.count} inv</span></td>
                              <td style={{ textAlign: 'right' }}><span className="item-amount">{currency(c.billed)}</span></td>
                              <td style={{ textAlign: 'right' }}><span className="item-amount">{c.outstanding > 0 ? currency(c.outstanding) : '—'}</span></td>
                              <td style={{ textAlign: 'right' }}><span className={`item-amount ${c.overdue > 0 ? 'amount-neg' : ''}`}>{c.overdue > 0 ? currency(c.overdue) : '—'}</span></td>
                              <td><span className={`badge ${label.cls}`}>{label.txt}</span></td>
                            </tr>
                          );
                        })}
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

          {/* ============================================================ */}
          {/* TAB — Reports (financial statements + CSV/PDF export)        */}
          {/* ============================================================ */}
          {activeTab === 'reports' && (
            <>
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="section-header">
                  <div className="section-title">
                    <i className="ti ti-report-analytics" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>
                    Financial statements
                    <span className="badge badge-gray" style={{ marginLeft: 8 }}>{dashRange.label}</span>
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={exportAllPdf}>
                    <i className="ti ti-file-type-pdf"></i> Download all (PDF)
                  </button>
                </div>
                <div className="item-sub">
                  Cash-basis P&amp;L, Balance Sheet, and Cash Flow — computed live from your ledger. Flows follow the period selected above; the balance sheet is as of today. Export each as CSV (opens in Excel) or PDF.
                </div>
              </div>

              <StatementCard stmt={plStatement} onCsv={exportStatementCsv} onPdf={exportStatementPdf} />
              <StatementCard stmt={balanceSheet} onCsv={exportStatementCsv} onPdf={exportStatementPdf} />
              <StatementCard stmt={cashFlowStatement} onCsv={exportStatementCsv} onPdf={exportStatementPdf} />
            </>
          )}

          {/* ============================================================ */}
          {/* TAB — Documents (per-business document center)               */}
          {/* ============================================================ */}
          {activeTab === 'docs' && (
            <>
              <div className="card" id="mb-docs" style={{ marginBottom: 16 }}>
                <div className="section-header">
                  <div className="section-title">
                    <i className="ti ti-folder" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>
                    Document center
                    <span className="badge badge-gray" style={{ marginLeft: 8 }}>{bizDocuments.length}</span>
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={() => { setShowAddDoc((v) => !v); if (!showAddDoc) { setDocForm({ label: '', url: '', docType: 'INVOICE', note: '', invoiceId: '', periodYear: String(new Date().getFullYear()), periodMonth: '' }); setDocFile(null); setDocMode('file'); setDocBusinessId(''); } }}>
                    <i className={`ti ${showAddDoc ? 'ti-x' : 'ti-plus'}`}></i>{showAddDoc ? ' Cancel' : ' Add document'}
                  </button>
                </div>

                <p className="item-sub" style={{ marginTop: -4, marginBottom: 12 }}>
                  {uploadEnabled ? 'Upload files and images, or paste a share link' : 'Paste a share link from Drive, Dropbox, a data room or an e-invoice'} — invoices, receipts, contracts and tax records stay organized under {isAllView ? 'their business' : 'this business'}, filed by year.
                </p>

                {showAddDoc && (
                  <form onSubmit={handleAddDoc} style={{ marginBottom: 14 }}>
                    {/* Business picker — required in the All-businesses view */}
                    {isAllView && (
                      <div className="form-group">
                        <label className="form-label">Business *</label>
                        <select className="form-select" value={docBusinessId} onChange={(e) => setDocBusinessId(e.target.value)}>
                          <option value="">— Choose a business —</option>
                          {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                      </div>
                    )}

                    {/* Mode: upload a file vs. paste a link — always available. */}
                    <div className="seg-control" style={{ marginBottom: docMode === 'file' && !uploadEnabled ? 6 : 12 }}>
                      <button type="button" className={`seg-btn ${docMode === 'file' ? 'active' : ''}`} onClick={() => setDocMode('file')}><i className="ti ti-upload"></i> Upload file</button>
                      <button type="button" className={`seg-btn ${docMode === 'link' ? 'active' : ''}`} onClick={() => setDocMode('link')}><i className="ti ti-link"></i> Add link</button>
                    </div>
                    {docMode === 'file' && !uploadEnabled && (
                      <div className="item-sub" style={{ marginBottom: 12, color: 'var(--tv-warning, #b7791f)' }}>
                        <i className="ti ti-alert-triangle" style={{ marginRight: 4 }}></i>
                        File storage isn't enabled on the server yet (set <code>STORAGE_PROVIDER=gcs</code> + <code>GCS_BUCKET</code> and redeploy). You can add a link for now.
                      </div>
                    )}

                    <div className="grid-2">
                      <div className="form-group">
                        <label className="form-label">Label {docMode === 'link' ? '*' : '(optional)'}</label>
                        <input className="form-input" value={docForm.label} onChange={(e) => setDocForm({ ...docForm, label: e.target.value })} placeholder={docMode === 'file' ? 'Defaults to the file name' : 'e.g. Invoice #1042 — Acme Corp'} autoFocus />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Type</label>
                        <select className="form-select" value={docForm.docType} onChange={(e) => setDocForm({ ...docForm, docType: e.target.value })}>
                          {DOC_TYPES.map((t) => <option key={t} value={t}>{docTypeVisual(t).label}</option>)}
                        </select>
                      </div>
                    </div>

                    {docMode === 'file' ? (
                      <div className="form-group">
                        <label className="form-label">File or image *</label>
                        {!docFile ? (
                          <input key={docFileKey} className="form-input" type="file"
                            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                            onChange={(e) => setDocFile(e.target.files?.[0] || null)} />
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--tv-border)', borderRadius: 8 }}>
                            <i className="ti ti-file-check" style={{ color: 'var(--tv-forest-light)', fontSize: 18 }}></i>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className="item-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{docFile.name}</div>
                              <div className="item-sub">{(docFile.size / 1024).toFixed(0)} KB</div>
                            </div>
                            <button type="button" className="btn btn-secondary btn-sm"
                              onClick={() => { setDocFile(null); setDocFileKey((k) => k + 1); }}
                              title="Remove this file and choose another">
                              <i className="ti ti-x"></i> Remove
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="form-group">
                        <label className="form-label">Link (URL) *</label>
                        <input className="form-input" value={docForm.url} onChange={(e) => setDocForm({ ...docForm, url: e.target.value })} placeholder="https://drive.google.com/… or a data-room link" />
                      </div>
                    )}

                    <div className="grid-2">
                      <div className="form-group">
                        <label className="form-label">Attach to invoice</label>
                        <select className="form-select" value={docForm.invoiceId} onChange={(e) => setDocForm({ ...docForm, invoiceId: e.target.value })}>
                          <option value="">— None —</option>
                          {manualInvoices
                            .filter((i) => !isAllView || !docBusinessId || String(i.businessId) === String(docBusinessId))
                            .map((i) => (
                              <option key={i.id} value={i.id}>{i.customer} · {currency(Number(i.amount) || 0)}</option>
                            ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Note</label>
                        <input className="form-input" value={docForm.note} onChange={(e) => setDocForm({ ...docForm, note: e.target.value })} placeholder="Optional" />
                      </div>
                    </div>
                    <div className="grid-2">
                      <div className="form-group">
                        <label className="form-label">Tax / filing year</label>
                        <input className="form-input" type="number" min="1900" max="2200" value={docForm.periodYear}
                          onChange={(e) => setDocForm({ ...docForm, periodYear: e.target.value })} placeholder="e.g. 2026" />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Month (optional)</label>
                        <select className="form-select" value={docForm.periodMonth} onChange={(e) => setDocForm({ ...docForm, periodMonth: e.target.value })}>
                          <option value="">— Whole year —</option>
                          {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
                            <option key={m} value={i + 1}>{m}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <button type="submit" className="btn btn-primary btn-sm"
                      disabled={savingDoc || (isAllView && !docBusinessId) || (docMode === 'file' ? (!docFile || !uploadEnabled) : (!docForm.label.trim() || !docForm.url.trim()))}>
                      <i className={`ti ${savingDoc ? 'ti-loader spin' : (docMode === 'file' ? 'ti-upload' : 'ti-plus')}`}></i>
                      {savingDoc ? ' Saving…' : (docMode === 'file' ? ' Upload document' : ' Add document')}
                    </button>
                  </form>
                )}

                {/* Business folder chips (All view) — one "folder" per business */}
                {isAllView && businesses.length > 0 && sortedDocs.length > 0 && (
                  <div className="seg-control" style={{ marginBottom: 8, flexWrap: 'wrap' }}>
                    <button className={`seg-btn ${fDocBusiness === 'ALL' ? 'active' : ''}`} onClick={() => setFDocBusiness('ALL')}><i className="ti ti-folders"></i> All businesses</button>
                    {businesses.map((b) => (
                      <button key={b.id} className={`seg-btn ${String(fDocBusiness) === String(b.id) ? 'active' : ''}`} onClick={() => setFDocBusiness(String(b.id))}>
                        <i className="ti ti-folder"></i> {b.name}
                      </button>
                    ))}
                  </div>
                )}

                {/* Type filter chips */}
                {sortedDocs.length > 0 && (
                  <div className="seg-control" style={{ marginBottom: 8, flexWrap: 'wrap' }}>
                    {['ALL', ...DOC_TYPES.filter((t) => sortedDocs.some((d) => (d.docType || 'OTHER').toUpperCase() === t))].map((t) => (
                      <button key={t} className={`seg-btn ${fDocType === t ? 'active' : ''}`} onClick={() => setFDocType(t)}>
                        {t === 'ALL' ? 'All' : docTypeVisual(t).label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Year filter chips — documents filed by tax/reporting year */}
                {docYears.length > 0 && (
                  <div className="seg-control" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
                    <button className={`seg-btn ${fDocYear === 'ALL' ? 'active' : ''}`} onClick={() => setFDocYear('ALL')}>All years</button>
                    {docYears.map((y) => (
                      <button key={y} className={`seg-btn ${String(fDocYear) === String(y) ? 'active' : ''}`} onClick={() => setFDocYear(String(y))}>{y}</button>
                    ))}
                    {hasUndatedDocs && (
                      <button className={`seg-btn ${fDocYear === 'NONE' ? 'active' : ''}`} onClick={() => setFDocYear('NONE')}>Undated</button>
                    )}
                  </div>
                )}

                {filteredDocs.length === 0 ? (
                  <div className="empty-state">
                    <i className="ti ti-folder-open"></i>
                    <p>{sortedDocs.length === 0 ? 'No documents yet. Add a link to an invoice, receipt or contract to keep this business organized.' : 'No documents match this filter.'}</p>
                  </div>
                ) : isAllView ? (
                  /* All businesses → a folder per business, newest documents first inside each. */
                  <div>
                    {docsByBusiness.map((folder) => (
                      <div key={folder.id} style={{ marginBottom: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 8px' }}>
                          <i className="ti ti-folder" style={{ color: 'var(--tv-forest-light)', fontSize: 16 }}></i>
                          <span style={{ fontWeight: 600, fontSize: 14 }}>{folder.name}</span>
                          <span className="badge badge-gray">{folder.docs.length}</span>
                        </div>
                        {folder.docs.map((d) => docRow(d, false))}
                      </div>
                    ))}
                  </div>
                ) : (
                  /* Single business → its documents only, newest first. */
                  <div>
                    {filteredDocs.map((d) => docRow(d, false))}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {sendInv && (
        <SendInvoiceModal invoice={sendInv} currency={currency}
          onClose={() => setSendInv(null)}
          onSent={(updated) => { if (updated) setManualInvoices((prev) => prev.map((i) => (i.id === updated.id ? updated : i))); }} />
      )}
      {payInv && (
        <RecordPaymentModal invoice={payInv} currency={currency} transactions={bizTransactions}
          onClose={() => setPayInv(null)}
          onSaved={(updated) => { setManualInvoices((prev) => prev.map((i) => (i.id === updated.id ? updated : i))); setPayInv(null); flash('Payment recorded — invoice marked paid.'); }} />
      )}
      {shareBizDoc && (
        <BizDocShareModal doc={shareBizDoc}
          onClose={() => setShareBizDoc(null)}
          onFlash={flash} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Invoice + business-doc modals (send / record payment / secure share) */
/* ------------------------------------------------------------------ */
function MbOverlay({ title, subtitle, onClose, children }) {
  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div className="card" style={{ width: '100%', maxWidth: 480, maxHeight: '88vh', overflowY: 'auto', padding: 22 }} role="dialog" aria-modal="true">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0 }}>{title}</h3>
            {subtitle && <div className="item-sub">{subtitle}</div>}
          </div>
          <button className="icon-btn" onClick={onClose}><i className="ti ti-x"></i></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SendInvoiceModal({ invoice, currency, onClose, onSent }) {
  const [channel, setChannel] = useState(invoice.customerEmail ? 'EMAIL' : (invoice.customerPhone ? 'SMS' : 'EMAIL'));
  const [recipient, setRecipient] = useState(invoice.customerEmail || '');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => { setRecipient(channel === 'SMS' ? (invoice.customerPhone || '') : (invoice.customerEmail || '')); }, [channel, invoice]);

  const submit = async () => {
    if (!recipient.trim()) { setErr(`Enter the customer's ${channel === 'SMS' ? 'phone number' : 'email'}.`); return; }
    setBusy(true); setErr('');
    try {
      const r = await api.sendManualInvoice(invoice.id, { channel, recipient: recipient.trim() });
      setResult(r);
      onSent?.(r.invoice);
    } catch (e) { setErr(e?.message || 'Could not send the invoice.'); }
    finally { setBusy(false); }
  };

  const copy = async (text) => { try { await navigator.clipboard.writeText(text); } catch { /* ignore */ } };

  if (result) {
    const ok = result.deliveryStatus === 'SENT';
    return (
      <MbOverlay title={ok ? 'Invoice sent' : 'Ready to send'} onClose={onClose}>
        {ok ? (
          <p style={{ color: 'var(--tv-forest)' }}><i className="ti ti-circle-check"></i> Sent to <strong>{result.recipient}</strong> by {result.channel === 'SMS' ? 'text' : 'email'}.</p>
        ) : (
          <>
            <p className="item-sub">{result.channel === 'SMS' ? 'SMS' : 'Email'} delivery isn’t configured here — copy this and send it yourself:</p>
            <textarea className="form-input" readOnly rows={4} value={result.message} style={{ width: '100%', fontSize: 13 }} />
            <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => copy(result.message)}><i className="ti ti-copy"></i> Copy message</button>
          </>
        )}
        <div className="card" style={{ padding: 10, marginTop: 12, wordBreak: 'break-all', fontSize: 13, background: 'var(--tv-forest-tint, rgba(45,90,61,.06))' }}>{result.publicUrl}</div>
        <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => copy(result.publicUrl)}><i className="ti ti-link"></i> Copy invoice link</button>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}><button className="btn btn-primary" onClick={onClose}>Done</button></div>
      </MbOverlay>
    );
  }

  return (
    <MbOverlay title={`Send invoice — ${currency(Number(invoice.amount) || 0)}`} subtitle={`To ${invoice.customer}`} onClose={onClose}>
      <div className="seg-control" style={{ marginBottom: 12 }}>
        <button type="button" className={`seg-btn ${channel === 'EMAIL' ? 'active' : ''}`} onClick={() => setChannel('EMAIL')}><i className="ti ti-mail"></i> Email</button>
        <button type="button" className={`seg-btn ${channel === 'SMS' ? 'active' : ''}`} onClick={() => setChannel('SMS')}><i className="ti ti-message"></i> SMS</button>
      </div>
      <div className="form-group">
        <label className="form-label">{channel === 'SMS' ? 'Customer phone' : 'Customer email'}</label>
        <input className="form-input" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder={channel === 'SMS' ? '+1 555 123 4567' : 'billing@acme.com'} autoFocus />
      </div>
      <p className="item-sub"><i className="ti ti-info-circle"></i> They’ll get a link to a page showing the amount, due date and how to pay.</p>
      {err && <div style={{ color: 'var(--tv-negative)', fontSize: 13, marginTop: 6 }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'Sending…' : (<><i className="ti ti-send"></i> Send</>)}</button>
      </div>
    </MbOverlay>
  );
}

function RecordPaymentModal({ invoice, currency, transactions = [], onClose, onSaved }) {
  const [paidAmount, setPaidAmount] = useState(String(invoice.amount ?? ''));
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState('BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const [linkedTransactionId, setLinkedTransactionId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Only deposits (positive amounts) for this invoice's business are worth linking.
  const linkable = (transactions || [])
    .filter((t) => (invoice.businessId == null || t.businessId === invoice.businessId) && Number(t.amount) > 0)
    .slice(0, 100);

  const submit = async () => {
    setBusy(true); setErr('');
    try {
      const updated = await api.recordInvoicePayment(invoice.id, {
        paidAmount: Number(paidAmount) || invoice.amount, paidAt,
        paymentMethod: method, paymentReference: reference || null,
        linkedTransactionId: linkedTransactionId || null,
      });
      onSaved?.(updated);
    } catch (e) { setErr(e?.message || 'Could not record the payment.'); setBusy(false); }
  };

  return (
    <MbOverlay title="Record payment" subtitle={`${invoice.customer} · ${currency(Number(invoice.amount) || 0)}`} onClose={onClose}>
      <div className="grid-2">
        <div className="form-group">
          <label className="form-label">Amount received</label>
          <input className="form-input" type="number" step="0.01" min="0" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Date received</label>
          <input className="form-input" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
        </div>
      </div>
      <div className="grid-2">
        <div className="form-group">
          <label className="form-label">Method</label>
          <select className="form-select" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="BANK_TRANSFER">Bank transfer</option>
            <option value="ZELLE">Zelle</option>
            <option value="CHECK">Check</option>
            <option value="CASH">Cash</option>
            <option value="CARD">Card</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Reference (optional)</label>
          <input className="form-input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. check #1042" />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Link to a bank transaction (optional)</label>
        <select className="form-select" value={linkedTransactionId} onChange={(e) => setLinkedTransactionId(e.target.value)}>
          <option value="">— None —</option>
          {linkable.map((t) => (
            <option key={t.id} value={t.id}>{(t.postedAt || '').slice(0, 10)} · {currency(Number(t.amount) || 0)} · {t.description || t.merchant || 'Deposit'}</option>
          ))}
        </select>
      </div>
      {err && <div style={{ color: 'var(--tv-negative)', fontSize: 13, marginTop: 6 }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'Saving…' : (<><i className="ti ti-check"></i> Mark paid</>)}</button>
      </div>
    </MbOverlay>
  );
}

function BizDocShareModal({ doc, onClose, onFlash }) {
  const [granteeRef, setGranteeRef] = useState('');
  const [scope, setScope] = useState('VIEW');
  const [passcode, setPasscode] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('14');
  const [sendEmail, setSendEmail] = useState(false);
  const [created, setCreated] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!passcode.trim()) { setErr('A passcode is required to share.'); return; }
    setBusy(true); setErr('');
    try {
      const s = await api.createDocShare({
        documentId: doc.centralDocumentId, scope, passcode: passcode.trim(),
        expiresInDays: expiresInDays ? Number(expiresInDays) : undefined,
        granteeKind: 'CPA', granteeRef, sendEmail: sendEmail && !!granteeRef.trim(), includePasscode: true,
      });
      setCreated(s);
      onFlash?.('Secure share link created.');
    } catch (e) { setErr(e?.message || 'Could not create the share.'); }
    finally { setBusy(false); }
  };
  const copy = async (t) => { try { await navigator.clipboard.writeText(t); } catch { /* ignore */ } };

  if (created) {
    return (
      <MbOverlay title="Share link ready" subtitle="Send this to your CPA or client" onClose={onClose}>
        <div className="card" style={{ padding: 10, wordBreak: 'break-all', fontSize: 13, background: 'var(--tv-forest-tint, rgba(45,90,61,.06))' }}>{created.link}</div>
        <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} onClick={() => copy(created.link)}><i className="ti ti-copy"></i> Copy link</button>
        <ul className="item-sub" style={{ marginTop: 12, paddingLeft: 18, lineHeight: 1.7 }}>
          <li>Passcode required — {created.emailStatus === 'SENT' ? 'included in the email' : 'share it separately'}.</li>
          {created.emailStatus === 'SENT' && <li style={{ color: 'var(--tv-forest)' }}>Emailed to {created.emailedTo}</li>}
          <li>View-only, expiring, revocable — every open is logged.</li>
        </ul>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}><button className="btn btn-primary" onClick={onClose}>Done</button></div>
      </MbOverlay>
    );
  }

  return (
    <MbOverlay title="Securely share document" subtitle={doc.label} onClose={onClose}>
      <div className="form-group">
        <label className="form-label">CPA / recipient email</label>
        <input className="form-input" value={granteeRef} onChange={(e) => setGranteeRef(e.target.value)} placeholder="cpa@firm.com" />
      </div>
      <div className="seg-control" style={{ marginBottom: 12 }}>
        <button type="button" className={`seg-btn ${scope === 'VIEW' ? 'active' : ''}`} onClick={() => setScope('VIEW')}>View only</button>
        <button type="button" className={`seg-btn ${scope === 'DOWNLOAD' ? 'active' : ''}`} onClick={() => setScope('DOWNLOAD')}>Allow download</button>
      </div>
      <div className="grid-2">
        <div className="form-group">
          <label className="form-label">Expires in</label>
          <select className="form-select" value={expiresInDays} onChange={(e) => setExpiresInDays(e.target.value)}>
            <option value="1">1 day</option><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option><option value="">No expiry</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Passcode *</label>
          <input className="form-input" value={passcode} onChange={(e) => setPasscode(e.target.value)} placeholder="required" />
        </div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
        <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--tv-forest)' }} />
        <span><i className="ti ti-mail"></i> Email the link + passcode to the recipient</span>
      </label>
      {err && <div style={{ color: 'var(--tv-negative)', fontSize: 13, marginTop: 6 }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy || !passcode.trim()}>{busy ? 'Creating…' : (<><i className="ti ti-share"></i> Create link</>)}</button>
      </div>
    </MbOverlay>
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
  const neg = v < 0;
  const a = Math.abs(v);
  if (a >= 1000) return `${neg ? '-' : ''}$${(a / 1000).toFixed(a >= 10000 ? 0 : 1)}k`;
  return `${neg ? '-' : ''}$${Math.round(a)}`;
}

/* ------------------------------------------------------------------ */
/* Financial-statement export helpers (CSV + print-to-PDF).            */
/* One statement data model → screen, CSV, and a branded print doc.    */
/* ------------------------------------------------------------------ */
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
function stmtMoney(n) {
  const v = Number(n) || 0;
  return `${v < 0 ? '-$' : '$'}${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function downloadCsv(filename, rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = rows.map((r) => r.map(esc).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function statementToCsvRows(stmt, bizName) {
  const rows = [[stmt.title], [`${bizName} · ${stmt.period}`], []];
  stmt.sections.forEach((sec) => {
    rows.push([sec.heading, '']);
    (sec.rows.length ? sec.rows : [{ label: 'No activity', amount: 0 }]).forEach((r) => rows.push([r.label, r.amount]));
    rows.push([sec.total.label, sec.total.amount]);
    rows.push([]);
  });
  rows.push([stmt.grandTotal.label, stmt.grandTotal.amount]);
  rows.push([]);
  rows.push([`Cash-basis · generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`]);
  return rows;
}
function statementToHtml(stmt, bizName) {
  const secs = stmt.sections.map((sec) => {
    const body = (sec.rows.length ? sec.rows : [{ label: 'No activity', amount: 0, muted: true }])
      .map((r) => `<tr><td class="lbl${r.muted ? ' muted' : ''}">${escapeHtml(r.label)}</td><td class="amt">${stmtMoney(r.amount)}</td></tr>`)
      .join('');
    return `<tr class="sec"><td colspan="2">${escapeHtml(sec.heading)}</td></tr>${body}<tr class="tot"><td>${escapeHtml(sec.total.label)}</td><td class="amt">${stmtMoney(sec.total.amount)}</td></tr>`;
  }).join('');
  return `<section class="stmt"><h1>${escapeHtml(stmt.title)}</h1>`
    + `<div class="meta">${escapeHtml(bizName)} · ${escapeHtml(stmt.period)}</div>`
    + `<table>${secs}<tr class="grand"><td>${escapeHtml(stmt.grandTotal.label)}</td><td class="amt">${stmtMoney(stmt.grandTotal.amount)}</td></tr></table>`
    + `<div class="foot">Cash-basis statement · generated ${escapeHtml(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }))}</div></section>`;
}
function printHtmlDocument(title, bodyHtml) {
  const w = window.open('', '_blank', 'width=820,height=1000');
  if (!w) { window.alert('Please allow pop-ups for this site to download the PDF.'); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    *{box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a2a22;margin:40px;font-size:13px}
    .stmt{margin-bottom:36px}
    h1{font-size:20px;margin:0 0 2px}
    .meta{color:#667;margin-bottom:16px;font-size:12px}
    table{width:100%;border-collapse:collapse}
    td{padding:6px 4px;border-bottom:1px solid #eee}
    .amt{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
    tr.sec td{font-weight:700;border-bottom:2px solid #1A4D3B;color:#1A4D3B;padding-top:16px;text-transform:uppercase;letter-spacing:.03em;font-size:12px}
    tr.tot td{font-weight:600;border-top:1px solid #ccc}
    td.muted{color:#999}
    tr.grand td{font-weight:700;font-size:15px;border-top:2px solid #1A4D3B;border-bottom:none;padding-top:10px}
    .foot{margin-top:12px;color:#999;font-size:11px}
    @media print{body{margin:22px}.stmt{page-break-inside:avoid}}
  </style></head><body onload="window.focus();window.print()">${bodyHtml}</body></html>`);
  w.document.close();
}

/* ------------------------------------------------------------------ */
/* Financial-statement card — renders one statement + export buttons.  */
/* ------------------------------------------------------------------ */
function StatementCard({ stmt, onCsv, onPdf }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="section-header">
        <div className="section-title">
          <i className="ti ti-report" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>{stmt.title}
          <span className="badge badge-gray" style={{ marginLeft: 8 }}>{stmt.period}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => onCsv(stmt)} title="Download as CSV (Excel)"><i className="ti ti-file-spreadsheet"></i> CSV</button>
          <button className="btn btn-secondary btn-sm" onClick={() => onPdf(stmt)} title="Download as PDF"><i className="ti ti-file-type-pdf"></i> PDF</button>
        </div>
      </div>
      <div className="table-scroll">
        <table className="tv-table">
          <tbody>
            {stmt.sections.map((sec, si) => (
              <Fragment key={si}>
                <tr><td colSpan={2} style={{ fontWeight: 700, color: 'var(--tv-forest)', paddingTop: 14, textTransform: 'uppercase', fontSize: 12, letterSpacing: '.03em' }}>{sec.heading}</td></tr>
                {sec.rows.length ? sec.rows.map((r, ri) => (
                  <tr key={ri}><td>{r.label}</td><td style={{ textAlign: 'right' }}><span className="item-amount">{currency(r.amount)}</span></td></tr>
                )) : (
                  <tr><td style={{ color: 'var(--tv-text-muted)' }}>No activity</td><td style={{ textAlign: 'right', color: 'var(--tv-text-muted)' }}>{currency(0)}</td></tr>
                )}
                <tr><td style={{ fontWeight: 600 }}>{sec.total.label}</td><td style={{ textAlign: 'right', fontWeight: 600 }}><span className="item-amount">{currency(sec.total.amount)}</span></td></tr>
              </Fragment>
            ))}
            <tr>
              <td style={{ fontWeight: 700, fontSize: 15, borderTop: '2px solid var(--tv-forest)' }}>{stmt.grandTotal.label}</td>
              <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 15, borderTop: '2px solid var(--tv-forest)' }}>
                <span className={`item-amount ${stmt.grandTotal.amount >= 0 ? 'amount-pos' : 'amount-neg'}`}>{currency(stmt.grandTotal.amount)}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Business Health Score — semicircle gauge.                           */
/* ------------------------------------------------------------------ */
function HealthGauge({ score, color }) {
  const s = clamp(Number(score) || 0, 0, 100);
  const w = 150, h = 88, cx = w / 2, cy = h - 6, r = 62;
  // Semicircle from 180° (left) to 0° (right).
  const pt = (deg) => {
    const rad = (Math.PI * deg) / 180;
    return [cx + r * Math.cos(rad), cy - r * Math.sin(rad)];
  };
  const arc = (fromDeg, toDeg) => {
    const [x1, y1] = pt(fromDeg), [x2, y2] = pt(toDeg);
    const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };
  const valDeg = 180 - (s / 100) * 180;
  return (
    <div style={{ textAlign: 'center', flexShrink: 0 }}>
      <svg viewBox={`0 0 ${w} ${h}`} width="150" height="88" role="img" aria-label={`Business health score ${s} out of 100`}>
        <path d={arc(180, 0)} fill="none" stroke="var(--tv-border)" strokeWidth="11" strokeLinecap="round" />
        <path d={arc(180, valDeg)} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round" />
        <text x={cx} y={cy - 12} textAnchor="middle" fontFamily="var(--font-display)" fontSize="30" fontWeight="600" fill={color}>{s}</text>
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize="10" fill="var(--tv-text-muted)">out of 100</text>
      </svg>
    </div>
  );
}

/* Sub-score row for the health card. */
function ScoreBar({ part }) {
  const color = part.value >= 70 ? 'var(--tv-positive)' : part.value >= 45 ? 'var(--tv-warning)' : 'var(--tv-negative)';
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
        <span style={{ color: 'var(--tv-text-primary)', fontWeight: 500 }}>{part.label} <span style={{ color: 'var(--tv-text-muted)', fontWeight: 400, fontSize: 11 }}>· {part.weight}</span></span>
        <span style={{ color: 'var(--tv-text-muted)', fontSize: 12 }}>{part.hint}</span>
      </div>
      <div className="progress-bar"><div className="progress-fill" style={{ width: `${part.value}%`, background: color }}></div></div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 90-day cash forecast — area/line with a zero baseline + shortfall.  */
/* ------------------------------------------------------------------ */
function ForecastChart({ forecast }) {
  const width = 640, height = 200, padL = 8, padR = 8, padTop = 14, padBottom = 26;
  const usableW = width - padL - padR;
  const usableH = height - padTop - padBottom;
  const pts = forecast.series;
  const maxDay = pts[pts.length - 1]?.day || 90;
  const vals = pts.map((p) => p.balance);
  const hi = Math.max(1, ...vals);
  const lo = Math.min(0, ...vals);
  const span = hi - lo || 1;
  const x = (day) => padL + (day / maxDay) * usableW;
  const y = (bal) => padTop + (1 - (bal - lo) / span) * usableH;
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.day).toFixed(1)} ${y(p.balance).toFixed(1)}`).join(' ');
  const area = `${line} L ${x(maxDay).toFixed(1)} ${y(lo).toFixed(1)} L ${x(0).toFixed(1)} ${y(lo).toFixed(1)} Z`;
  const zeroY = y(0);
  const showZero = lo < 0;
  const negative = forecast.shortfallDay != null;
  const stroke = negative ? 'var(--tv-negative)' : 'var(--tv-forest)';
  const fill = negative ? 'var(--tv-negative)' : 'var(--tv-forest-light)';
  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="xMidYMid meet"
        role="img" aria-label="Projected available cash over the next 90 days">
        <defs>
          <linearGradient id="fcFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={fill} stopOpacity="0.28" />
            <stop offset="100%" stopColor={fill} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {/* month gridlines at 30 / 60 / 90 */}
        {[30, 60, 90].map((d) => (
          <g key={d}>
            <line x1={x(d)} y1={padTop} x2={x(d)} y2={padTop + usableH} stroke="var(--tv-border)" strokeWidth="1" strokeDasharray="3 4" />
            <text x={x(d)} y={height - 8} textAnchor="middle" fontSize="11" fill="var(--tv-text-muted)">{d}d</text>
          </g>
        ))}
        {showZero && (
          <>
            <line x1={padL} y1={zeroY} x2={width - padR} y2={zeroY} stroke="var(--tv-negative)" strokeWidth="1" strokeDasharray="4 3" opacity="0.6" />
            <text x={padL + 2} y={zeroY - 4} fontSize="10" fill="var(--tv-negative)">$0</text>
          </>
        )}
        <path d={area} fill="url(#fcFill)" />
        <path d={line} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {/* start point */}
        <circle cx={x(0)} cy={y(forecast.start)} r="3.5" fill={stroke} />
        {/* shortfall marker */}
        {negative && (
          <g>
            <circle cx={x(forecast.shortfallDay)} cy={zeroY} r="4.5" fill="var(--tv-negative)" stroke="#fff" strokeWidth="1.5" />
            <text x={clamp(x(forecast.shortfallDay), 30, width - 60)} y={padTop + 10} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--tv-negative)">Runs out ~{forecast.shortfallDay}d</text>
          </g>
        )}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* AR aging — segmented bar + per-bucket rows.                         */
/* ------------------------------------------------------------------ */
function AgingBars({ aging, onEmail, busy }) {
  const defs = [
    { key: 'current', label: 'Current', color: 'var(--tv-positive)' },
    { key: 'd1_30', label: '1–30 days', color: 'var(--tv-gold)' },
    { key: 'd31_60', label: '31–60 days', color: 'var(--tv-warning)' },
    { key: 'd61_90', label: '61–90 days', color: '#D97706' },
    { key: 'd90', label: '90+ days', color: 'var(--tv-negative)' },
  ];
  const total = aging.total || 1;
  const shown = defs.filter((d) => aging.buckets[d.key] > 0);
  return (
    <div>
      {/* Stacked segment bar */}
      <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', marginBottom: 14, background: 'var(--tv-border)' }}>
        {shown.map((d) => (
          <div key={d.key} title={`${d.label}: ${currency(aging.buckets[d.key])}`}
            style={{ width: `${(aging.buckets[d.key] / total) * 100}%`, background: d.color }} />
        ))}
      </div>
      {defs.map((d) => {
        const amt = aging.buckets[d.key];
        const cnt = aging.counts[d.key];
        return (
          <div key={d.key} className="list-item" style={{ padding: '8px 0' }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: d.color, marginRight: 10, flexShrink: 0 }} />
            <div className="item-main">
              <div className="item-name">{d.label}</div>
              <div className="item-sub">{cnt} invoice{cnt === 1 ? '' : 's'}</div>
            </div>
            <div className="item-right">
              <div className={`item-amount ${d.key !== 'current' && amt > 0 ? 'amount-neg' : ''}`}>{currency(amt)}</div>
            </div>
          </div>
        );
      })}
      <div className="divider" style={{ margin: '10px 0' }}></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div className="item-sub">
          {aging.overdue > 0
            ? <><strong style={{ color: 'var(--tv-negative)' }}>{currency(aging.overdue)}</strong> overdue ({Math.round(aging.overduePct * 100)}% of receivables){aging.worstCustomer ? ` · largest: ${aging.worstCustomer.name}` : ''}</>
            : 'All receivables are current.'}
        </div>
        {aging.overdue > 0 && (
          <button className="btn btn-secondary btn-sm" onClick={onEmail} disabled={busy}>
            <i className={`ti ${busy ? 'ti-loader-2' : 'ti-send'}`}></i> {busy ? 'Sending…' : 'Send reminders'}
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Smart-insight row.                                                  */
/* ------------------------------------------------------------------ */
function InsightRow({ ins }) {
  const tone = ins.tone === 'neg' ? 'icon-red' : ins.tone === 'warn' ? 'icon-amber' : 'icon-green';
  return (
    <div className="list-item" style={{ alignItems: 'flex-start', padding: '12px 0' }}>
      <div className={`item-icon ${tone}`}><i className={`ti ${ins.icon}`}></i></div>
      <div className="item-main">
        <div className="item-name">{ins.title}</div>
        <div className="item-sub" style={{ whiteSpace: 'normal', lineHeight: 1.45 }}>{ins.detail}</div>
        {ins.action ? (
          <div className="item-sub" style={{ marginTop: 4, color: 'var(--tv-forest-light)', fontWeight: 500 }}>
            <i className="ti ti-arrow-right" style={{ fontSize: 12 }}></i> {ins.action}
          </div>
        ) : null}
      </div>
    </div>
  );
}
