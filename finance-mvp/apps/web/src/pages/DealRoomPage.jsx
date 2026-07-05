import React, { useState, useEffect, useCallback } from 'react';
import { currency } from '../utils/format';
import { api, getStoredName, getStoredEmail } from '../api';

const CATEGORIES = [
  { value: 'REAL_ESTATE', label: 'Real Estate' },
  { value: 'BUSINESS', label: 'Business' },
  { value: 'PRIVATE_EQUITY', label: 'Private Equity' },
  { value: 'STARTUP', label: 'Startup' },
  { value: 'OTHER', label: 'Other' },
];

const STATUSES = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'OPEN', label: 'Open' },
  { value: 'CLOSED', label: 'Closed' },
  { value: 'FUNDED', label: 'Funded' },
];

const STATUS_BADGE = { DRAFT: 'badge-gray', OPEN: 'badge-green', CLOSED: 'badge-gray', FUNDED: 'badge-forest' };

// Taxonomy — mirrors the backend DealTaxonomy (single source of truth on the server validates).
const SUBCATEGORIES = {
  REAL_ESTATE: ['MULTIFAMILY', 'SINGLE_FAMILY', 'TOWNHOMES', 'CONSTRUCTION', 'LAND', 'COMMERCIAL', 'MIXED_USE'],
  BUSINESS: ['ACQUISITION', 'FRANCHISE', 'EXPANSION', 'GENERAL'],
  PRIVATE_EQUITY: ['BUYOUT', 'GROWTH', 'VENTURE', 'GENERAL'],
  STARTUP: ['PRE_SEED', 'SEED', 'SERIES_A', 'SERIES_B_PLUS', 'GENERAL'],
  OTHER: ['GENERAL'],
};
const RETURN_TYPES = ['FIXED', 'EQUITY', 'HYBRID'];
const DIST_FREQ = ['MONTHLY', 'QUARTERLY', 'ANNUAL', 'AT_EXIT'];
const LEAD_STATUSES = ['NEW', 'CONTACTED', 'COMMITTED', 'PASSED'];
const LEAD_BADGE = { NEW: 'badge-gray', CONTACTED: 'badge-gold', COMMITTED: 'badge-green', PASSED: 'badge-gray' };

// "SERIES_B_PLUS" -> "Series B Plus", "AT_EXIT" -> "At Exit".
const humanize = (v) => (v ? v.split('_').map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ') : '');

const fmtPct = (n) => `${Number(n)}%`;

// Representative annual return % for a deal, used to compare against a bank rate.
// Fixed/hybrid: midpoint of the annual range (or whichever bound is set).
// Equity: target IRR. Returns null when the deal quotes no usable return.
function dealAnnualRate(deal) {
  const lo = deal.annualReturnMin != null ? Number(deal.annualReturnMin) : null;
  const hi = deal.annualReturnMax != null ? Number(deal.annualReturnMax) : null;
  const irr = deal.targetIrr != null ? Number(deal.targetIrr) : null;
  let fixed = null;
  if (lo != null && hi != null) fixed = (lo + hi) / 2;
  else if (lo != null) fixed = lo;
  else if (hi != null) fixed = hi;
  if (deal.returnType === 'EQUITY') return Number.isFinite(irr) ? irr : null;
  // FIXED, HYBRID, or unspecified — prefer the quoted annual return, fall back to IRR.
  if (fixed != null) return fixed;
  return Number.isFinite(irr) ? irr : null;
}

// Grow a principal at an annual rate (%) for a number of months, compounded annually.
const grow = (principal, annualPct, months) =>
  principal * Math.pow(1 + annualPct / 100, months / 12);

// Short return summary for cards (e.g. "12–24% / yr" or "18% IRR").
function returnSummary(deal) {
  const parts = [];
  const { returnType, annualReturnMin: lo, annualReturnMax: hi, targetIrr } = deal;
  if ((returnType === 'FIXED' || returnType === 'HYBRID' || (!returnType && (lo != null || hi != null)))) {
    if (lo != null && hi != null && Number(lo) !== Number(hi)) parts.push(`${fmtPct(lo)}–${fmtPct(hi)} / yr`);
    else if (lo != null || hi != null) parts.push(`${fmtPct(lo != null ? lo : hi)} / yr`);
  }
  if ((returnType === 'EQUITY' || returnType === 'HYBRID' || !returnType) && targetIrr != null) {
    parts.push(`${fmtPct(targetIrr)} IRR`);
  }
  return parts.join(' · ');
}

const EMPTY_FORM = {
  title: '', category: 'REAL_ESTATE', subcategory: '', status: 'DRAFT', location: '', websiteUrl: '', description: '',
  returnType: '', annualReturnMin: '', annualReturnMax: '', targetIrr: '', distributionFrequency: '',
  targetRaise: '', minInvestment: '', holdPeriodMonths: '',
};

const labelFor = (list, value) => (list.find((o) => o.value === value) || {}).label || value;

const inputStyle = {
  width: '100%', padding: '9px 11px', border: '1px solid var(--tv-border)',
  borderRadius: 'var(--radius-md)', fontSize: '13.5px', background: 'white',
};
const fieldLabel = { fontSize: '11.5px', color: 'var(--tv-text-muted)', fontWeight: 600, marginBottom: '4px', display: 'block' };

export default function DealRoomPage() {
  // view: 'mine' | 'market' | 'detail' | 'leads'
  const [view, setView] = useState('mine');
  const [deals, setDeals] = useState([]);
  const [market, setMarket] = useState([]);
  const [selected, setSelected] = useState(null);
  const [leads, setLeads] = useState([]);
  const [projects, setProjects] = useState([]);
  const [interests, setInterests] = useState([]);
  const [saved, setSaved] = useState([]);
  const [docs, setDocs] = useState([]);
  const [filters, setFilters] = useState({ category: '', subcategory: '', returnType: '', sort: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // create/edit form
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const loadMine = useCallback(async () => {
    setLoading(true); setError('');
    try { setDeals(await api.getDeals() || []); }
    catch (err) { setError(err?.message || 'Could not load your deals.'); }
    finally { setLoading(false); }
  }, []);

  const loadMarket = useCallback(async (f = {}) => {
    setLoading(true); setError('');
    try { setMarket(await api.getMarketplace(f) || []); }
    catch (err) { setError(err?.message || 'Could not load the marketplace.'); }
    finally { setLoading(false); }
  }, []);

  const loadProjects = useCallback(async () => {
    setLoading(true); setError('');
    try { setProjects(await api.getMySponsorProjects() || []); }
    catch (err) { setError(err?.message || 'Could not load your track record.'); }
    finally { setLoading(false); }
  }, []);

  const loadInterests = useCallback(async () => {
    setLoading(true); setError('');
    try { setInterests(await api.getMyInterests() || []); }
    catch (err) { setError(err?.message || 'Could not load your interests.'); }
    finally { setLoading(false); }
  }, []);

  const loadSaved = useCallback(async () => {
    setLoading(true); setError('');
    try { setSaved(await api.getWatchlist() || []); }
    catch (err) { setError(err?.message || 'Could not load your saved deals.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadMine(); }, [loadMine]);

  const switchTab = (tab) => {
    setError(''); setNotice(''); setSelected(null); setShowForm(false);
    setView(tab);
    if (tab === 'market') loadMarket(filters);
    if (tab === 'mine') loadMine();
    if (tab === 'track') loadProjects();
    if (tab === 'interests') loadInterests();
    if (tab === 'saved') loadSaved();
  };

  const openDocs = async (deal) => {
    setError(''); setNotice(''); setLoading(true);
    try { setSelected(deal); setDocs(await api.getDealDocuments(deal.id) || []); setView('docs'); }
    catch (err) { setError(err?.message || 'Could not load documents.'); }
    finally { setLoading(false); }
  };

  const applyFilter = (key, value) => {
    const next = { ...filters, [key]: value, ...(key === 'category' ? { subcategory: '' } : {}) };
    setFilters(next);
    loadMarket(next);
  };

  const isListTab = view === 'mine' || view === 'market' || view === 'track' || view === 'interests' || view === 'saved';

  // ---- create / edit ----
  const openCreate = () => { setEditingId(null); setForm(EMPTY_FORM); setNotice(''); setShowForm(true); };
  const openEdit = (deal) => {
    setEditingId(deal.id);
    setForm({
      title: deal.title || '', category: deal.category || 'OTHER', subcategory: deal.subcategory || '',
      status: deal.status || 'DRAFT', location: deal.location || '', websiteUrl: deal.websiteUrl || '',
      description: deal.description || '',
      returnType: deal.returnType || '', annualReturnMin: deal.annualReturnMin ?? '',
      annualReturnMax: deal.annualReturnMax ?? '', targetIrr: deal.targetIrr ?? '',
      distributionFrequency: deal.distributionFrequency || '',
      targetRaise: deal.targetRaise ?? '', minInvestment: deal.minInvestment ?? '',
      holdPeriodMonths: deal.holdPeriodMonths ?? '',
    });
    setNotice(''); setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); };
  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const num = (v) => { if (v === '' || v == null) return undefined; const n = Number(v); return Number.isFinite(n) ? n : undefined; };

  const submitDeal = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setError('Please give your deal a title.'); return; }
    setSaving(true); setError('');
    const payload = {
      title: form.title.trim(), category: form.category,
      subcategory: form.subcategory || undefined, status: form.status,
      location: form.location.trim() || undefined, websiteUrl: form.websiteUrl.trim() || undefined,
      description: form.description.trim() || undefined,
      returnType: form.returnType || undefined,
      annualReturnMin: num(form.annualReturnMin), annualReturnMax: num(form.annualReturnMax),
      targetIrr: num(form.targetIrr), distributionFrequency: form.distributionFrequency || undefined,
      targetRaise: num(form.targetRaise), minInvestment: num(form.minInvestment),
      holdPeriodMonths: num(form.holdPeriodMonths),
    };
    try {
      if (editingId) { await api.updateDeal(editingId, payload); setNotice('Deal updated.'); }
      else { await api.createDeal(payload); setNotice('Deal registered.'); }
      closeForm(); await loadMine();
    } catch (err) { setError(err?.message || 'Could not save the deal.'); }
    finally { setSaving(false); }
  };

  const removeDeal = async (deal) => {
    if (!window.confirm(`Delete "${deal.title}"? This cannot be undone.`)) return;
    setError('');
    try { await api.deleteDeal(deal.id); setNotice('Deal deleted.'); await loadMine(); }
    catch (err) { setError(err?.message || 'Could not delete the deal.'); }
  };

  // ---- detail + interest ----
  const openDetail = async (deal) => {
    setError(''); setNotice('');
    try {
      const full = await api.getDeal(deal.id);
      setSelected(full); setView('detail');
    } catch (err) { setError(err?.message || 'Could not open the deal.'); }
  };

  // ---- owner leads ----
  const openLeads = async (deal) => {
    setError(''); setNotice('');
    setLoading(true);
    try {
      setSelected(deal);
      setLeads(await api.getDealInterests(deal.id) || []);
      setView('leads');
    } catch (err) { setError(err?.message || 'Could not load interested investors.'); }
    finally { setLoading(false); }
  };

  return (
    <div id="page-dealroom" className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">Deal Room</div>
          <div className="page-subtitle">Register deals, browse the marketplace, and connect with interested investors</div>
        </div>
        {(view === 'mine' || view === 'market') && (
          <div className="page-actions">
            <button className="btn btn-primary btn-sm" onClick={openCreate}>
              <i className="ti ti-plus"></i> Register a deal
            </button>
          </div>
        )}
      </div>

      {/* Tabs (hidden in sub-views) */}
      {isListTab && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <button className={`btn btn-sm ${view === 'mine' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => switchTab('mine')}>My Deals</button>
          <button className={`btn btn-sm ${view === 'market' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => switchTab('market')}>Marketplace</button>
          <button className={`btn btn-sm ${view === 'saved' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => switchTab('saved')}>Saved</button>
          <button className={`btn btn-sm ${view === 'interests' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => switchTab('interests')}>My Interests</button>
          <button className={`btn btn-sm ${view === 'track' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => switchTab('track')}>Track Record</button>
        </div>
      )}

      {error && <Banner color="negative">{error}</Banner>}
      {notice && !showForm && <Banner color="positive">{notice}</Banner>}

      {/* Create/edit form */}
      {showForm && (view === 'mine' || view === 'market') && (
        <DealForm form={form} setField={setField} editingId={editingId} saving={saving} onSubmit={submitDeal} onCancel={closeForm} />
      )}

      {/* MY DEALS */}
      {view === 'mine' && (
        loading ? <Loading text="Loading your deals…" />
        : deals.length === 0 && !showForm ? (
          <EmptyState icon="🤝" title="No deals yet"
            body="Register a real estate or investment deal to track its terms and collect investor interest."
            cta="Register your first deal" onCta={openCreate} />
        ) : (
          <div className="grid-3" style={{ gap: '16px' }}>
            {deals.map((deal) => (
              <div key={deal.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <CardHeader deal={deal} />
                <CardTags deal={deal} />
                <DealMetrics deal={deal} />
                <button className="btn btn-secondary btn-sm" style={{ justifyContent: 'center' }} onClick={() => openLeads(deal)}>
                  <i className="ti ti-users"></i> Interested investors{typeof deal.interestCount === 'number' ? ` (${deal.interestCount})` : ''}
                </button>
                <button className="btn btn-secondary btn-sm" style={{ justifyContent: 'center' }} onClick={() => openDocs(deal)}>
                  <i className="ti ti-files"></i> Documents
                </button>
                <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                  <button className="btn btn-secondary btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={() => openEdit(deal)}><i className="ti ti-edit"></i> Edit</button>
                  <button className="btn btn-secondary btn-sm" style={{ color: 'var(--tv-negative)' }} onClick={() => removeDeal(deal)} title="Delete deal"><i className="ti ti-trash"></i></button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* MARKETPLACE */}
      {view === 'market' && (
        <>
          <MarketFilters filters={filters} onChange={applyFilter} />
          {loading ? <Loading text="Loading marketplace…" />
            : market.length === 0 ? (
              <EmptyState icon="🏢" title="No matching deals"
                body="No open deals match your filters yet. Try clearing them, or check back soon." />
            ) : (
              <div className="grid-3" style={{ gap: '16px' }}>
                {market.map((deal) => (
                  <div key={deal.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px', cursor: 'pointer' }} onClick={() => openDetail(deal)}>
                    <CardHeader deal={deal} />
                    <CardTags deal={deal} />
                    <DealMetrics deal={deal} />
                    <button className="btn btn-primary btn-sm" style={{ justifyContent: 'center', marginTop: 'auto' }}>
                      View details <i className="ti ti-arrow-right"></i>
                    </button>
                  </div>
                ))}
              </div>
            )}
        </>
      )}

      {/* MY INTERESTS (investor) */}
      {view === 'interests' && (
        loading ? <Loading text="Loading your interests…" />
        : interests.length === 0 ? (
          <EmptyState icon="📨" title="No interests yet"
            body="Deals you express interest in from the marketplace will appear here, with the sponsor's progress on your lead." />
        ) : (
          <div className="card">
            <div className="section-title">Deals you're interested in</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {interests.map((it) => (
                <div key={it.id} style={{ border: '1px solid var(--tv-border)', borderRadius: 'var(--radius-md)', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{it.dealTitle}</div>
                    <div style={{ fontSize: '12px', color: 'var(--tv-text-muted)' }}>
                      Submitted {it.createdAt ? new Date(it.createdAt).toLocaleDateString() : ''}
                      {it.dealStatus ? ` · Deal ${labelFor(STATUSES, it.dealStatus)}` : ''}
                    </div>
                    {it.message && <div style={{ fontSize: '12.5px', color: 'var(--tv-text-secondary)', marginTop: '4px' }}>{it.message}</div>}
                  </div>
                  <span className={`badge ${LEAD_BADGE[it.status] || 'badge-gray'}`} style={{ fontSize: '10.5px' }} title="The sponsor's status on your interest">{humanize(it.status)}</span>
                </div>
              ))}
            </div>
          </div>
        )
      )}

      {/* SAVED (investor watchlist) */}
      {view === 'saved' && (
        loading ? <Loading text="Loading your saved deals…" />
        : saved.length === 0 ? (
          <EmptyState icon="🔖" title="No saved deals"
            body="Save deals from the marketplace to keep an eye on them here." />
        ) : (
          <div className="grid-3" style={{ gap: '16px' }}>
            {saved.map((deal) => (
              <div key={deal.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px', cursor: 'pointer' }} onClick={() => openDetail(deal)}>
                <CardHeader deal={deal} />
                <CardTags deal={deal} />
                <DealMetrics deal={deal} />
                <button className="btn btn-primary btn-sm" style={{ justifyContent: 'center', marginTop: 'auto' }}>View details <i className="ti ti-arrow-right"></i></button>
              </div>
            ))}
          </div>
        )
      )}

      {/* OWNER DOCUMENTS MANAGER */}
      {view === 'docs' && selected && (
        <DocsManager deal={selected} initialDocs={docs} onBack={() => switchTab('mine')} setError={setError} setNotice={setNotice} />
      )}

      {/* TRACK RECORD (sponsor's previous projects) */}
      {view === 'track' && (
        <TrackRecordView projects={projects} loading={loading} onChanged={loadProjects} setError={setError} setNotice={setNotice} />
      )}

      {/* DEAL DETAIL + INTEREST */}
      {view === 'detail' && selected && (
        <DealDetail deal={selected} onBack={() => switchTab('market')} onNotice={(m) => { setNotice(m); }} />
      )}

      {/* OWNER LEADS */}
      {view === 'leads' && selected && (
        <LeadsView deal={selected} initialLeads={leads} loading={loading} onBack={() => switchTab('mine')} setError={setError} setNotice={setNotice} />
      )}
    </div>
  );
}

/* ---------- sub-components ---------- */

function Banner({ color, children }) {
  return (
    <div className="card" style={{ borderLeft: `4px solid var(--tv-${color})`, marginBottom: '16px', color: `var(--tv-${color})`, fontSize: '13px' }}>
      {children}
    </div>
  );
}

function Loading({ text }) {
  return <div className="card" style={{ textAlign: 'center', color: 'var(--tv-text-muted)', fontSize: '13px' }}>{text}</div>;
}

function EmptyState({ icon, title, body, cta, onCta }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
      <div style={{ fontSize: '34px', marginBottom: '10px' }}>{icon}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '18px', marginBottom: '6px' }}>{title}</div>
      <div style={{ fontSize: '13px', color: 'var(--tv-text-muted)', marginBottom: cta ? '16px' : 0, maxWidth: 420, marginInline: 'auto' }}>{body}</div>
      {cta && <button className="btn btn-primary btn-sm" onClick={onCta}><i className="ti ti-plus"></i> {cta}</button>}
    </div>
  );
}

function CardHeader({ deal }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '16px', lineHeight: 1.3 }}>{deal.title}</div>
      <span className={`badge ${STATUS_BADGE[deal.status] || 'badge-gray'}`} style={{ fontSize: '10.5px', flexShrink: 0 }}>{labelFor(STATUSES, deal.status)}</span>
    </div>
  );
}

function CardTags({ deal }) {
  const ret = returnSummary(deal);
  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
      <span className="badge badge-gray" style={{ fontSize: '10.5px' }}>{labelFor(CATEGORIES, deal.category)}</span>
      {deal.subcategory && <span className="badge badge-forest" style={{ fontSize: '10.5px' }}>{humanize(deal.subcategory)}</span>}
      {ret && <span className="badge badge-green" style={{ fontSize: '10.5px' }}>{ret}</span>}
      {deal.location && <span style={{ fontSize: '12px', color: 'var(--tv-text-muted)' }}><i className="ti ti-map-pin"></i> {deal.location}</span>}
    </div>
  );
}

function DealMetrics({ deal }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
      {deal.targetRaise != null && <Metric label="Target raise" value={currency(deal.targetRaise)} />}
      {deal.minInvestment != null && <Metric label="Min investment" value={currency(deal.minInvestment)} />}
      {deal.targetIrr != null && <Metric label="Target IRR" value={`${deal.targetIrr}%`} accent />}
      {deal.holdPeriodMonths != null && <Metric label="Hold period" value={`${deal.holdPeriodMonths} mo`} />}
    </div>
  );
}

function Metric({ label, value, accent }) {
  return (
    <div>
      <div style={{ fontSize: '11px', color: 'var(--tv-text-muted)', fontWeight: 500 }}>{label}</div>
      <div style={{ fontWeight: 600, fontSize: '13.5px', color: accent ? 'var(--tv-positive)' : 'inherit' }}>{value}</div>
    </div>
  );
}

function MarketFilters({ filters, onChange }) {
  const subOptions = SUBCATEGORIES[filters.category] || [];
  const sel = { padding: '7px 10px', border: '1px solid var(--tv-border)', borderRadius: 'var(--radius-md)', fontSize: '13px', background: 'white' };
  const hasAny = filters.category || filters.subcategory || filters.returnType;
  return (
    <div className="card" style={{ marginBottom: '16px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
      <span style={{ fontSize: '12px', color: 'var(--tv-text-muted)', fontWeight: 600 }}>Filter</span>
      <select style={sel} value={filters.category} onChange={(e) => onChange('category', e.target.value)}>
        <option value="">All categories</option>
        {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>
      <select style={sel} value={filters.subcategory} onChange={(e) => onChange('subcategory', e.target.value)} disabled={!filters.category}>
        <option value="">All subcategories</option>
        {subOptions.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
      </select>
      <select style={sel} value={filters.returnType} onChange={(e) => onChange('returnType', e.target.value)}>
        <option value="">All return types</option>
        {RETURN_TYPES.map((r) => <option key={r} value={r}>{humanize(r)}</option>)}
      </select>
      <span style={{ flex: 1 }} />
      <select style={sel} value={filters.sort} onChange={(e) => onChange('sort', e.target.value)} title="Sort">
        <option value="">Newest</option>
        <option value="RETURN_DESC">Highest return</option>
        <option value="MIN_INVESTMENT_ASC">Lowest minimum</option>
        <option value="TARGET_RAISE_DESC">Largest raise</option>
      </select>
      {hasAny && (
        <button className="btn btn-secondary btn-sm" onClick={() => { onChange('returnType', ''); onChange('category', ''); }}>Clear</button>
      )}
    </div>
  );
}

function DealForm({ form, setField, editingId, saving, onSubmit, onCancel }) {
  const subOptions = SUBCATEGORIES[form.category] || [];
  const showFixed = !form.returnType || form.returnType === 'FIXED' || form.returnType === 'HYBRID';
  const showEquity = !form.returnType || form.returnType === 'EQUITY' || form.returnType === 'HYBRID';
  // Changing category invalidates the subcategory — clear it.
  const onCategory = (e) => { setField('category')(e); setField('subcategory')({ target: { value: '' } }); };

  return (
    <div className="card" style={{ marginBottom: '16px' }}>
      <div className="section-title">{editingId ? 'Edit deal' : 'Register a new deal'}</div>
      <form onSubmit={onSubmit}>
        <div className="grid-2" style={{ gap: '14px' }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={fieldLabel}>Title *</label>
            <input style={inputStyle} value={form.title} onChange={setField('title')} placeholder="e.g. Cedar Ridge Farmland LLC" />
          </div>
          <div><label style={fieldLabel}>Category</label>
            <select style={inputStyle} value={form.category} onChange={onCategory}>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select></div>
          <div><label style={fieldLabel}>Subcategory</label>
            <select style={inputStyle} value={form.subcategory} onChange={setField('subcategory')}>
              <option value="">— Select —</option>
              {subOptions.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
            </select></div>
          <div><label style={fieldLabel}>Status</label>
            <select style={inputStyle} value={form.status} onChange={setField('status')}>
              {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <div style={{ fontSize: '11px', color: 'var(--tv-text-muted)', marginTop: '4px' }}>Set to <strong>Open</strong> to list it in the marketplace.</div>
          </div>
          <div><label style={fieldLabel}>Location</label><input style={inputStyle} value={form.location} onChange={setField('location')} placeholder="e.g. Bozeman, MT" /></div>
          <div style={{ gridColumn: '1 / -1' }}><label style={fieldLabel}>Website / project link</label><input style={inputStyle} type="url" value={form.websiteUrl} onChange={setField('websiteUrl')} placeholder="https://yourproject.com" /></div>

          {/* Returns */}
          <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--tv-border)', paddingTop: '10px', fontSize: '12px', fontWeight: 600, color: 'var(--tv-text-secondary)' }}>Returns</div>
          <div><label style={fieldLabel}>Return type</label>
            <select style={inputStyle} value={form.returnType} onChange={setField('returnType')}>
              <option value="">— Select —</option>
              {RETURN_TYPES.map((r) => <option key={r} value={r}>{humanize(r)}{r === 'FIXED' ? ' (annual %)' : r === 'EQUITY' ? ' (IRR)' : ''}</option>)}
            </select></div>
          <div><label style={fieldLabel}>Distribution frequency</label>
            <select style={inputStyle} value={form.distributionFrequency} onChange={setField('distributionFrequency')}>
              <option value="">— Select —</option>
              {DIST_FREQ.map((d) => <option key={d} value={d}>{humanize(d)}</option>)}
            </select></div>
          {showFixed && <div><label style={fieldLabel}>Annual return min (%)</label><input style={inputStyle} type="number" step="0.1" min="0" value={form.annualReturnMin} onChange={setField('annualReturnMin')} placeholder="12" /></div>}
          {showFixed && <div><label style={fieldLabel}>Annual return max (%)</label><input style={inputStyle} type="number" step="0.1" min="0" value={form.annualReturnMax} onChange={setField('annualReturnMax')} placeholder="24" /></div>}
          {showEquity && <div><label style={fieldLabel}>Target IRR (%)</label><input style={inputStyle} type="number" step="0.1" min="0" value={form.targetIrr} onChange={setField('targetIrr')} placeholder="18.5" /></div>}

          {/* Deal economics */}
          <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--tv-border)', paddingTop: '10px', fontSize: '12px', fontWeight: 600, color: 'var(--tv-text-secondary)' }}>Deal economics</div>
          <div><label style={fieldLabel}>Target raise ($)</label><input style={inputStyle} type="number" min="0" value={form.targetRaise} onChange={setField('targetRaise')} placeholder="250000" /></div>
          <div><label style={fieldLabel}>Minimum investment ($)</label><input style={inputStyle} type="number" min="0" value={form.minInvestment} onChange={setField('minInvestment')} placeholder="25000" /></div>
          <div><label style={fieldLabel}>Hold period (months)</label><input style={inputStyle} type="number" min="0" value={form.holdPeriodMonths} onChange={setField('holdPeriodMonths')} placeholder="48" /></div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={fieldLabel}>Description</label>
            <textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} value={form.description} onChange={setField('description')} placeholder="What is this opportunity? Strategy, location drivers, structure…" />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Register deal'}</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel} disabled={saving}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

function DealDetail({ deal, onBack, onNotice }) {
  const [showInterest, setShowInterest] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [sponsorProjects, setSponsorProjects] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [watched, setWatched] = useState(false);
  const [lead, setLead] = useState({
    name: getStoredName() || '', email: getStoredEmail() || '', phone: '', message: '',
    commitmentAmount: '', accredited: false,
  });
  const set = (k) => (e) => setLead((l) => ({ ...l, [k]: e.target.value }));

  useEffect(() => {
    let active = true;
    api.getDealSponsorProjects(deal.id)
      .then((list) => { if (active) setSponsorProjects(Array.isArray(list) ? list : []); })
      .catch(() => { if (active) setSponsorProjects([]); });
    api.getDealDocuments(deal.id)
      .then((list) => { if (active) setDocuments(Array.isArray(list) ? list : []); })
      .catch(() => { if (active) setDocuments([]); });
    return () => { active = false; };
  }, [deal.id]);

  const toggleWatch = async () => {
    try {
      if (watched) { await api.unwatchDeal(deal.id); setWatched(false); }
      else { await api.watchDeal(deal.id); setWatched(true); }
    } catch (e) { setErr(e?.message || 'Could not update your saved deals.'); }
  };

  const targetRaise = deal.targetRaise != null ? Number(deal.targetRaise) : 0;
  const committed = deal.committedAmount != null ? Number(deal.committedAmount) : 0;
  const progressPct = targetRaise > 0 ? Math.min(100, Math.round((committed / targetRaise) * 100)) : 0;

  const submit = async (e) => {
    e.preventDefault();
    if (!lead.name.trim()) { setErr('Please enter your name.'); return; }
    if (!lead.email.includes('@')) { setErr('Please enter a valid email.'); return; }
    if (!lead.accredited) { setErr('Please confirm you are an accredited investor to continue.'); return; }
    setSaving(true); setErr('');
    try {
      await api.expressDealInterest(deal.id, {
        name: lead.name.trim(), email: lead.email.trim(),
        phone: lead.phone.trim() || undefined, message: lead.message.trim() || undefined,
        commitmentAmount: lead.commitmentAmount === '' ? undefined : Number(lead.commitmentAmount),
        accredited: lead.accredited,
      });
      setSubmitted(true);
      onNotice && onNotice('Your interest was sent to the deal sponsor.');
    } catch (e2) { setErr(e2?.message || 'Could not submit your interest.'); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', gap: '8px' }}>
        <button className="btn btn-secondary btn-sm" onClick={onBack}><i className="ti ti-arrow-left"></i> Back to marketplace</button>
        <button className={`btn btn-sm ${watched ? 'btn-gold' : 'btn-secondary'}`} onClick={toggleWatch}>
          <i className={watched ? 'ti ti-bookmark-filled' : 'ti ti-bookmark'}></i> {watched ? 'Saved' : 'Save deal'}
        </button>
      </div>
      <div className="grid-2" style={{ gap: '16px', alignItems: 'start' }}>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '22px' }}>{deal.title}</div>
            <span className={`badge ${STATUS_BADGE[deal.status] || 'badge-gray'}`}>{labelFor(STATUSES, deal.status)}</span>
            <span className="badge badge-gray">{labelFor(CATEGORIES, deal.category)}</span>
            {deal.subcategory && <span className="badge badge-forest">{humanize(deal.subcategory)}</span>}
          </div>
          {deal.location && <div style={{ fontSize: '13px', color: 'var(--tv-text-muted)', marginBottom: '8px' }}><i className="ti ti-map-pin"></i> {deal.location}</div>}
          {deal.websiteUrl && (
            <div style={{ marginBottom: '14px' }}>
              <a href={deal.websiteUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                <i className="ti ti-external-link"></i> Visit project website
              </a>
            </div>
          )}
          {deal.description && (
            <>
              <div className="section-title">Overview</div>
              <p style={{ fontSize: '13.5px', color: 'var(--tv-text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{deal.description}</p>
            </>
          )}
          <hr className="divider" />
          <div className="section-title">Key terms</div>
          <div className="grid-2" style={{ gap: '14px' }}>
            <Metric label="Asset type" value={deal.subcategory ? humanize(deal.subcategory) : labelFor(CATEGORIES, deal.category)} />
            <Metric label="Returns" value={returnSummary(deal) || '—'} accent />
            <Metric label="Distributions" value={deal.distributionFrequency ? humanize(deal.distributionFrequency) : '—'} />
            <Metric label="Hold period" value={deal.holdPeriodMonths != null ? `${deal.holdPeriodMonths} months` : '—'} />
            <Metric label="Target raise" value={deal.targetRaise != null ? currency(deal.targetRaise) : '—'} />
            <Metric label="Minimum investment" value={deal.minInvestment != null ? currency(deal.minInvestment) : '—'} />
          </div>

          {targetRaise > 0 && (
            <div style={{ marginTop: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '5px' }}>
                <span style={{ color: 'var(--tv-text-muted)' }}>Interest committed</span>
                <span style={{ fontWeight: 600 }}>{currency(committed)} of {currency(targetRaise)} · {progressPct}%</span>
              </div>
              <div style={{ height: '8px', background: 'var(--tv-border)', borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{ width: `${progressPct}%`, height: '100%', background: 'var(--tv-forest)' }}></div>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--tv-text-muted)', marginTop: '4px' }}>Indicative interest, not binding commitments.</div>
            </div>
          )}

          <DealVsBank deal={deal} />

          {documents.length > 0 && (
            <>
              <hr className="divider" />
              <div className="section-title">Documents</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {documents.map((d) => (
                  <a key={d.id} href={d.url} target="_blank" rel="noopener noreferrer"
                     style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--tv-forest)', border: '1px solid var(--tv-border)', borderRadius: 'var(--radius-md)', padding: '10px' }}>
                    <i className="ti ti-file-text"></i>
                    <span style={{ flex: 1 }}>{d.label}</span>
                    {d.docType && <span className="badge badge-gray" style={{ fontSize: '10px' }}>{humanize(d.docType)}</span>}
                    <i className="ti ti-external-link"></i>
                  </a>
                ))}
              </div>
            </>
          )}

          {sponsorProjects.length > 0 && (
            <>
              <hr className="divider" />
              <div className="section-title">Sponsor track record</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {sponsorProjects.map((p) => (
                  <div key={p.id} style={{ border: '1px solid var(--tv-border)', borderRadius: 'var(--radius-md)', padding: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 600 }}>{p.name}{p.year ? <span style={{ color: 'var(--tv-text-muted)', fontWeight: 400 }}> · {p.year}</span> : null}</div>
                      {p.outcome && <span className="badge badge-green" style={{ fontSize: '10.5px' }}>{p.outcome}</span>}
                    </div>
                    {p.location && <div style={{ fontSize: '12px', color: 'var(--tv-text-muted)', marginTop: '2px' }}><i className="ti ti-map-pin"></i> {p.location}</div>}
                    {p.description && <div style={{ fontSize: '12.5px', color: 'var(--tv-text-secondary)', marginTop: '6px', lineHeight: 1.6 }}>{p.description}</div>}
                    {p.url && <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12.5px', color: 'var(--tv-forest)', marginTop: '6px', display: 'inline-block' }}><i className="ti ti-external-link"></i> View project</a>}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Interest panel */}
        <div className="card" style={{ position: 'sticky', top: 0 }}>
          {submitted ? (
            <div style={{ textAlign: 'center', padding: '12px 4px' }}>
              <div style={{ fontSize: '30px', marginBottom: '8px' }}>✅</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '17px', marginBottom: '6px' }}>Interest sent</div>
              <div style={{ fontSize: '13px', color: 'var(--tv-text-muted)' }}>The sponsor of <strong>{deal.title}</strong> will reach out using the contact details you shared.</div>
            </div>
          ) : !showInterest ? (
            <>
              <div className="section-title">Interested in this deal?</div>
              <p style={{ fontSize: '13px', color: 'var(--tv-text-secondary)', lineHeight: 1.6 }}>
                Share your contact details with the sponsor and they’ll follow up with full documents and next steps.
              </p>
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '6px' }} onClick={() => setShowInterest(true)}>
                <i className="ti ti-hand-click"></i> I’m interested
              </button>
            </>
          ) : (
            <form onSubmit={submit}>
              <div className="section-title">Express interest</div>
              {err && <div style={{ color: 'var(--tv-negative)', fontSize: '12.5px', marginBottom: '10px' }}>{err}</div>}
              <div style={{ display: 'grid', gap: '12px' }}>
                <div><label style={fieldLabel}>Full name *</label><input style={inputStyle} value={lead.name} onChange={set('name')} placeholder="Your name" /></div>
                <div><label style={fieldLabel}>Email *</label><input style={inputStyle} type="email" value={lead.email} onChange={set('email')} placeholder="you@example.com" /></div>
                <div><label style={fieldLabel}>Phone</label><input style={inputStyle} value={lead.phone} onChange={set('phone')} placeholder="+1 555 0100" /></div>
                <div><label style={fieldLabel}>Amount you'd consider ($, optional)</label><input style={inputStyle} type="number" min="0" value={lead.commitmentAmount} onChange={set('commitmentAmount')} placeholder="50000" /></div>
                <div><label style={fieldLabel}>Message (optional)</label><textarea style={{ ...inputStyle, minHeight: '70px', resize: 'vertical' }} value={lead.message} onChange={set('message')} placeholder="Tell the sponsor what you’d like to know." /></div>
              </div>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12px', color: 'var(--tv-text-secondary)', margin: '12px 0', lineHeight: 1.5, cursor: 'pointer' }}>
                <input type="checkbox" checked={lead.accredited} onChange={(e) => setLead((l) => ({ ...l, accredited: e.target.checked }))} style={{ marginTop: '2px' }} />
                <span>I confirm I am an <strong>accredited investor</strong>, and I agree to share my name, email{lead.phone ? ', and phone' : ''} with the deal sponsor so they can contact me.</span>
              </label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="submit" className="btn btn-primary btn-sm" style={{ flex: 1, justifyContent: 'center' }} disabled={saving}>{saving ? 'Sending…' : 'Send interest'}</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowInterest(false)} disabled={saving}>Cancel</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// Signed money delta, e.g. "+$4,200" / "−$150".
function signedCurrency(n) {
  const v = Number(n) || 0;
  const s = currency(Math.abs(v));
  return v < 0 ? `−${s}` : `+${s}`;
}

const BANK_RATE_DEFAULT = 4; // typical high-yield savings, editable by the user.

// "Put your idle cash to work" — compares investing a chosen amount in THIS deal
// against leaving it in a bank savings account, over 1 year and the deal's hold period.
// Pulls the user's liquid (cash/savings) balances so they can fund the comparison in one tap.
function DealVsBank({ deal }) {
  const rate = dealAnnualRate(deal);
  const [accounts, setAccounts] = useState([]);
  const [srcId, setSrcId] = useState(''); // '' = custom amount
  const min = deal.minInvestment != null ? Number(deal.minInvestment) : null;
  const [amount, setAmount] = useState(min != null && min > 0 ? min : 10000);
  const [bankRate, setBankRate] = useState(BANK_RATE_DEFAULT);
  const [dealRate, setDealRate] = useState(rate != null ? rate : 8);

  useEffect(() => {
    let active = true;
    api.getAccounts()
      .then((res) => {
        const list = (Array.isArray(res) ? res : res?.items || [])
          .filter((a) => (a.type || '').toLowerCase() === 'depository')
          .map((a) => ({
            id: a.accountId || a.id,
            name: a.officialName || a.name || 'Account',
            subtype: a.subtype,
            balance: Number(a.availableBalance ?? a.currentBalance ?? 0),
          }))
          .filter((a) => a.id && a.balance > 0)
          .sort((x, y) => y.balance - x.balance);
        if (active) setAccounts(list);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // Deal quotes no usable return — nothing to compare against.
  if (rate == null) return null;

  const totalLiquid = accounts.reduce((s, a) => s + a.balance, 0);
  const amt = Number(amount) || 0;
  const months = deal.holdPeriodMonths != null && Number(deal.holdPeriodMonths) > 0 ? Number(deal.holdPeriodMonths) : null;
  const showHold = months != null && months !== 12;

  const dealYr = grow(amt, dealRate, 12);
  const bankYr = grow(amt, bankRate, 12);
  const dealGainYr = dealYr - amt;
  const bankGainYr = bankYr - amt;
  const edgeYr = dealGainYr - bankGainYr;

  const dealHold = showHold ? grow(amt, dealRate, months) : null;
  const bankHold = showHold ? grow(amt, bankRate, months) : null;

  const pickSource = (id) => {
    setSrcId(id);
    if (id) {
      const a = accounts.find((x) => x.id === id);
      if (a) setAmount(Math.round(a.balance));
    }
  };

  const useAllLiquid = () => { setSrcId(''); setAmount(Math.round(totalLiquid)); };

  const belowMin = min != null && min > 0 && amt < min;
  const overBalance = srcId && amt > (accounts.find((a) => a.id === srcId)?.balance ?? Infinity);

  const sel = { padding: '8px 10px', border: '1px solid var(--tv-border)', borderRadius: 'var(--radius-md)', fontSize: '13px', background: 'white', width: '100%' };

  return (
    <>
      <hr className="divider" />
      <div className="section-title">Put your cash to work</div>
      <p style={{ fontSize: '12.5px', color: 'var(--tv-text-muted)', lineHeight: 1.6, marginTop: '-4px', marginBottom: '12px' }}>
        See what an investment here could earn versus leaving the same cash in a savings account.
      </p>

      {/* Fund-from picker (only if the user has linked liquid accounts) */}
      {accounts.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <label style={fieldLabel}>Fund from a linked account</label>
          <select style={sel} value={srcId} onChange={(e) => pickSource(e.target.value)}>
            <option value="">Custom amount</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}{a.subtype ? ` · ${a.subtype}` : ''} — {currency(a.balance)}
              </option>
            ))}
          </select>
          <button type="button" onClick={useAllLiquid}
            style={{ marginTop: '6px', background: 'none', border: 'none', padding: 0, color: 'var(--tv-forest)', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>
            Use all my liquid cash ({currency(totalLiquid)})
          </button>
        </div>
      )}

      {/* Amount + the two rates */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: '10px', alignItems: 'end' }}>
        <div>
          <label style={fieldLabel}>Amount to invest</label>
          <input style={inputStyle} type="number" min="0" step="1000" value={amount}
            onChange={(e) => { setSrcId(''); setAmount(e.target.value); }} />
        </div>
        <div>
          <label style={fieldLabel}>This deal (%/yr)</label>
          <input style={inputStyle} type="number" min="0" step="0.5" value={dealRate} onChange={(e) => setDealRate(e.target.value)} />
        </div>
        <div>
          <label style={fieldLabel}>Bank (%/yr)</label>
          <input style={inputStyle} type="number" min="0" step="0.5" value={bankRate} onChange={(e) => setBankRate(e.target.value)} />
        </div>
      </div>

      {belowMin && (
        <div style={{ fontSize: '11.5px', color: 'var(--tv-gold)', marginTop: '8px' }}>
          <i className="ti ti-alert-triangle"></i> Below this deal’s {currency(min)} minimum investment.
        </div>
      )}
      {overBalance && (
        <div style={{ fontSize: '11.5px', color: 'var(--tv-text-muted)', marginTop: '8px' }}>
          <i className="ti ti-info-circle"></i> More than the selected account’s balance.
        </div>
      )}

      {/* Side-by-side projection */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '14px' }}>
        <CompareCard label="This deal" accent months={showHold ? months : null}
          rate={dealRate} yrValue={dealYr} yrGain={dealGainYr} holdValue={dealHold} holdGain={showHold ? dealHold - amt : null} />
        <CompareCard label="Bank savings" months={showHold ? months : null}
          rate={bankRate} yrValue={bankYr} yrGain={bankGainYr} holdValue={bankHold} holdGain={showHold ? bankHold - amt : null} />
      </div>

      {/* The punchline */}
      <div style={{ marginTop: '12px', padding: '12px 14px', borderRadius: 'var(--radius-md)',
        background: edgeYr >= 0 ? 'var(--tv-positive-bg)' : 'var(--tv-negative-bg)',
        color: edgeYr >= 0 ? 'var(--tv-positive)' : 'var(--tv-negative)', fontSize: '13px', lineHeight: 1.5 }}>
        {edgeYr >= 0 ? (
          <><i className="ti ti-trending-up"></i> That’s <strong>{signedCurrency(edgeYr)}</strong> more in the first year than a {Number(bankRate)}% savings account — {currency(amt)} → <strong>{currency(dealYr)}</strong> vs {currency(bankYr)}.</>
        ) : (
          <><i className="ti ti-trending-down"></i> At these rates the savings account earns <strong>{signedCurrency(-edgeYr)}</strong> more over the first year.</>
        )}
      </div>

      <div style={{ fontSize: '11px', color: 'var(--tv-text-muted)', marginTop: '8px', lineHeight: 1.5 }}>
        Illustrative only — projections compound the rates you enter and are not a guarantee. Private deals carry risk of loss; savings rates vary.
      </div>
    </>
  );
}

// One column of the deal-vs-bank projection.
function CompareCard({ label, accent, rate, yrValue, yrGain, months, holdValue, holdGain }) {
  const gainColor = (g) => (g >= 0 ? 'var(--tv-positive)' : 'var(--tv-negative)');
  return (
    <div style={{ border: `1px solid ${accent ? 'var(--tv-forest)' : 'var(--tv-border)'}`,
      borderRadius: 'var(--radius-md)', padding: '12px', background: accent ? 'var(--tv-forest)' : 'transparent', color: accent ? 'white' : 'inherit' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
        <span style={{ fontWeight: 600, fontSize: '13px' }}>{label}</span>
        <span style={{ fontSize: '11px', opacity: accent ? 0.85 : 0.7 }}>{Number(rate)}%/yr</span>
      </div>
      <div style={{ fontSize: '11px', opacity: accent ? 0.8 : 0.6 }}>In 1 year</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '19px', lineHeight: 1.2 }}>{currency(yrValue)}</div>
      <div style={{ fontSize: '12px', fontWeight: 600, color: accent ? 'var(--tv-gold-light)' : gainColor(yrGain) }}>{signedCurrency(yrGain)}</div>
      {months != null && holdValue != null && (
        <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: `1px solid ${accent ? 'rgba(255,255,255,0.2)' : 'var(--tv-border)'}` }}>
          <div style={{ fontSize: '11px', opacity: accent ? 0.8 : 0.6 }}>Over {months} months</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '16px', lineHeight: 1.2 }}>{currency(holdValue)}</div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: accent ? 'var(--tv-gold-light)' : gainColor(holdGain) }}>{signedCurrency(holdGain)}</div>
        </div>
      )}
    </div>
  );
}

function LeadsView({ deal, initialLeads, loading, onBack, setError, setNotice }) {
  const [rows, setRows] = useState(initialLeads);
  useEffect(() => { setRows(initialLeads); }, [initialLeads]);

  const changeStatus = async (lead, status) => {
    try {
      const updated = await api.updateLeadStatus(deal.id, lead.id, status);
      setRows((rs) => rs.map((r) => (r.id === lead.id ? { ...r, status: updated.status } : r)));
      setNotice && setNotice(`Marked ${lead.name} as ${humanize(status)}.`);
    } catch (err) { setError && setError(err?.message || 'Could not update lead status.'); }
  };

  const selStyle = { padding: '5px 8px', border: '1px solid var(--tv-border)', borderRadius: 'var(--radius-md)', fontSize: '12px', background: 'white' };

  return (
    <div>
      <button className="btn btn-secondary btn-sm" style={{ marginBottom: '16px' }} onClick={onBack}><i className="ti ti-arrow-left"></i> Back to my deals</button>
      <div className="card">
        <div className="section-title">Interested investors — {deal.title}</div>
        {loading ? (
          <div style={{ color: 'var(--tv-text-muted)', fontSize: '13px' }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px', color: 'var(--tv-text-muted)', fontSize: '13px' }}>
            No one has expressed interest yet. Set the deal to <strong>Open</strong> so it appears in the marketplace.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {rows.map((l) => (
              <div key={l.id} style={{ border: '1px solid var(--tv-border)', borderRadius: 'var(--radius-md)', padding: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                  <div style={{ fontWeight: 600 }}>{l.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className={`badge ${LEAD_BADGE[l.status] || 'badge-gray'}`} style={{ fontSize: '10.5px' }}>{humanize(l.status)}</span>
                    <select style={selStyle} value={l.status} onChange={(e) => changeStatus(l, e.target.value)} title="Update lead status">
                      {LEAD_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '4px', fontSize: '13px', alignItems: 'center' }}>
                  <a href={`mailto:${l.email}`} style={{ color: 'var(--tv-forest)' }}><i className="ti ti-mail"></i> {l.email}</a>
                  {l.phone && <a href={`tel:${l.phone}`} style={{ color: 'var(--tv-forest)' }}><i className="ti ti-phone"></i> {l.phone}</a>}
                  {l.commitmentAmount != null && <span style={{ fontWeight: 600 }}><i className="ti ti-coin"></i> {currency(l.commitmentAmount)}</span>}
                  {l.accredited && <span className="badge badge-green" style={{ fontSize: '10px' }}>Accredited</span>}
                  <span style={{ color: 'var(--tv-text-muted)' }}>{l.createdAt ? new Date(l.createdAt).toLocaleDateString() : ''}</span>
                </div>
                {l.message && <div style={{ fontSize: '13px', color: 'var(--tv-text-secondary)', marginTop: '8px', lineHeight: 1.6 }}>{l.message}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const DOC_TYPES = ['PPM', 'FINANCIALS', 'OPERATING_AGREEMENT', 'SUBSCRIPTION', 'OTHER'];

function DocsManager({ deal, initialDocs, onBack, setError, setNotice }) {
  const [rows, setRows] = useState(initialDocs || []);
  const [form, setForm] = useState({ label: '', url: '', docType: '' });
  const [saving, setSaving] = useState(false);
  useEffect(() => { setRows(initialDocs || []); }, [initialDocs]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const add = async (e) => {
    e.preventDefault();
    if (!form.label.trim()) { setError('Add a label for the document.'); return; }
    if (!form.url.trim()) { setError('Add the document URL.'); return; }
    setSaving(true); setError('');
    try {
      const doc = await api.addDealDocument(deal.id, { label: form.label.trim(), url: form.url.trim(), docType: form.docType || undefined });
      setRows((r) => [doc, ...r]);
      setForm({ label: '', url: '', docType: '' });
      setNotice && setNotice('Document added.');
    } catch (err) { setError(err?.message || 'Could not add the document.'); }
    finally { setSaving(false); }
  };

  const remove = async (doc) => {
    if (!window.confirm(`Remove "${doc.label}"?`)) return;
    try { await api.deleteDealDocument(deal.id, doc.id); setRows((r) => r.filter((x) => x.id !== doc.id)); }
    catch (err) { setError(err?.message || 'Could not remove the document.'); }
  };

  return (
    <div>
      <button className="btn btn-secondary btn-sm" style={{ marginBottom: '16px' }} onClick={onBack}><i className="ti ti-arrow-left"></i> Back to my deals</button>
      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="section-title">Documents — {deal.title}</div>
        <div style={{ fontSize: '12px', color: 'var(--tv-text-muted)', marginBottom: '12px' }}>Link documents hosted in your data room (PPM, financials, agreements). Investors see these on the deal page.</div>
        <form onSubmit={add} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: '10px', alignItems: 'end' }}>
          <div><label style={fieldLabel}>Label *</label><input style={inputStyle} value={form.label} onChange={set('label')} placeholder="Private Placement Memo" /></div>
          <div><label style={fieldLabel}>URL *</label><input style={inputStyle} type="url" value={form.url} onChange={set('url')} placeholder="https://dataroom.example.com/ppm.pdf" /></div>
          <div><label style={fieldLabel}>Type</label>
            <select style={inputStyle} value={form.docType} onChange={set('docType')}>
              <option value="">—</option>
              {DOC_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
            </select></div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Adding…' : 'Add'}</button>
        </form>
      </div>
      <div className="card">
        {rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px', color: 'var(--tv-text-muted)', fontSize: '13px' }}>No documents yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {rows.map((d) => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid var(--tv-border)', borderRadius: 'var(--radius-md)', padding: '10px' }}>
                <i className="ti ti-file-text" style={{ color: 'var(--tv-text-muted)' }}></i>
                <a href={d.url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, color: 'var(--tv-forest)', fontSize: '13px' }}>{d.label}</a>
                {d.docType && <span className="badge badge-gray" style={{ fontSize: '10px' }}>{humanize(d.docType)}</span>}
                <button className="btn btn-secondary btn-sm" style={{ color: 'var(--tv-negative)' }} onClick={() => remove(d)} title="Remove"><i className="ti ti-trash"></i></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const EMPTY_PROJECT = { name: '', description: '', url: '', location: '', year: '', outcome: '' };

function TrackRecordView({ projects, loading, onChanged, setError, setNotice }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_PROJECT);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const openCreate = () => { setEditingId(null); setForm(EMPTY_PROJECT); setShowForm(true); };
  const openEdit = (p) => {
    setEditingId(p.id);
    setForm({ name: p.name || '', description: p.description || '', url: p.url || '', location: p.location || '', year: p.year ?? '', outcome: p.outcome || '' });
    setShowForm(true);
  };
  const cancel = () => { setShowForm(false); setEditingId(null); setForm(EMPTY_PROJECT); };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Please enter the project name.'); return; }
    setSaving(true); setError('');
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      url: form.url.trim() || undefined,
      location: form.location.trim() || undefined,
      year: form.year === '' ? undefined : Number(form.year),
      outcome: form.outcome.trim() || undefined,
    };
    try {
      if (editingId) { await api.updateSponsorProject(editingId, payload); setNotice('Project updated.'); }
      else { await api.createSponsorProject(payload); setNotice('Project added to your track record.'); }
      cancel(); await onChanged();
    } catch (err) { setError(err?.message || 'Could not save the project.'); }
    finally { setSaving(false); }
  };

  const remove = async (p) => {
    if (!window.confirm(`Remove "${p.name}" from your track record?`)) return;
    setError('');
    try { await api.deleteSponsorProject(p.id); setNotice('Project removed.'); await onChanged(); }
    catch (err) { setError(err?.message || 'Could not remove the project.'); }
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ fontSize: '13px', color: 'var(--tv-text-secondary)', maxWidth: 560 }}>
          Your track record of past projects builds investor trust — it appears on every deal you publish so investors can vet you.
        </div>
        <button className="btn btn-primary btn-sm" onClick={openCreate}><i className="ti ti-plus"></i> Add a project</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: '16px' }}>
          <div className="section-title">{editingId ? 'Edit project' : 'Add a past project'}</div>
          <form onSubmit={submit}>
            <div className="grid-2" style={{ gap: '14px' }}>
              <div style={{ gridColumn: '1 / -1' }}><label style={fieldLabel}>Project name *</label><input style={inputStyle} value={form.name} onChange={set('name')} placeholder="e.g. Harborview Apartments" /></div>
              <div><label style={fieldLabel}>Location</label><input style={inputStyle} value={form.location} onChange={set('location')} placeholder="e.g. Tampa, FL" /></div>
              <div><label style={fieldLabel}>Year</label><input style={inputStyle} type="number" value={form.year} onChange={set('year')} placeholder="2023" /></div>
              <div><label style={fieldLabel}>Outcome</label><input style={inputStyle} value={form.outcome} onChange={set('outcome')} placeholder="e.g. Sold 2023 · 21% IRR" /></div>
              <div><label style={fieldLabel}>Project link</label><input style={inputStyle} type="url" value={form.url} onChange={set('url')} placeholder="https://…" /></div>
              <div style={{ gridColumn: '1 / -1' }}><label style={fieldLabel}>Description</label><textarea style={{ ...inputStyle, minHeight: '70px', resize: 'vertical' }} value={form.description} onChange={set('description')} placeholder="What was the project and your role?" /></div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Add project'}</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={cancel} disabled={saving}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {loading ? <Loading text="Loading your track record…" />
        : projects.length === 0 && !showForm ? (
          <EmptyState icon="🏆" title="No track record yet"
            body="Add your past projects so investors can see your experience on every deal you publish."
            cta="Add your first project" onCta={openCreate} />
        ) : (
          <div className="grid-3" style={{ gap: '16px' }}>
            {projects.map((p) => (
              <div key={p.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '15px' }}>{p.name}{p.year ? <span style={{ color: 'var(--tv-text-muted)', fontFamily: 'inherit' }}> · {p.year}</span> : null}</div>
                  {p.outcome && <span className="badge badge-green" style={{ fontSize: '10.5px' }}>{p.outcome}</span>}
                </div>
                {p.location && <div style={{ fontSize: '12px', color: 'var(--tv-text-muted)' }}><i className="ti ti-map-pin"></i> {p.location}</div>}
                {p.description && <div style={{ fontSize: '12.5px', color: 'var(--tv-text-secondary)', lineHeight: 1.6 }}>{p.description}</div>}
                {p.url && <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12.5px', color: 'var(--tv-forest)' }}><i className="ti ti-external-link"></i> View project</a>}
                <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '6px' }}>
                  <button className="btn btn-secondary btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={() => openEdit(p)}><i className="ti ti-edit"></i> Edit</button>
                  <button className="btn btn-secondary btn-sm" style={{ color: 'var(--tv-negative)' }} onClick={() => remove(p)} title="Remove"><i className="ti ti-trash"></i></button>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
