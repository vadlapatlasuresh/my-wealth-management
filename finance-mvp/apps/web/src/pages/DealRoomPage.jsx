import React, { useState, useEffect, useCallback } from 'react';
import { api, getStoredName, getStoredEmail } from '../api';

/**
 * Deal Room — a passive bulletin-board directory of physical properties.
 *
 * The rules this screen has to hold to, and why the code looks the way it does:
 *   - Listings are descriptive only. There is no field, badge, sort or summary anywhere
 *     on this page that expresses a return, yield, cap rate, entry price or raise progress.
 *   - Every listing offers exactly two actions: open the poster's own external page in a
 *     new tab, or reveal the poster's own email as a mailto: link. Nothing resolves here.
 *   - The compliance banner is rendered once, above the view switch, so it is present on
 *     the index and on a listing's detail view alike, and it cannot be dismissed.
 */

const CATEGORIES = [
  { value: 'REAL_ESTATE', label: 'Real Estate' },
  { value: 'BUSINESS', label: 'Business Property' },
  { value: 'OTHER', label: 'Other' },
];

const STATUSES = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'OPEN', label: 'Open' },
  { value: 'CLOSED', label: 'Closed' },
];

const STATUS_BADGE = { DRAFT: 'badge-gray', OPEN: 'badge-green', CLOSED: 'badge-gray' };

// Descriptive property types — mirrors the backend DealTaxonomy, which validates.
const PROPERTY_TYPES = {
  REAL_ESTATE: ['MULTIFAMILY', 'SINGLE_FAMILY', 'TOWNHOMES', 'CONSTRUCTION', 'LAND', 'COMMERCIAL', 'MIXED_USE'],
  BUSINESS: ['RETAIL', 'INDUSTRIAL', 'OFFICE', 'HOSPITALITY', 'GENERAL'],
  OTHER: ['GENERAL'],
};

// "MIXED_USE" -> "Mixed Use", "SINGLE_FAMILY" -> "Single Family".
const humanize = (v) => (v ? v.split('_').map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ') : '');

const EMPTY_FORM = {
  title: '', category: 'REAL_ESTATE', subcategory: '', status: 'DRAFT', location: '',
  websiteUrl: '', description: '', imageUrls: '', contactEmail: '', contactPhone: '',
};

const labelFor = (list, value) => (list.find((o) => o.value === value) || {}).label || value;

const inputStyle = {
  width: '100%', padding: '9px 11px', border: '1px solid var(--tv-border)',
  borderRadius: 'var(--radius-md)', fontSize: '13.5px', background: 'white',
};
const fieldLabel = { fontSize: '11.5px', color: 'var(--tv-text-muted)', fontWeight: 600, marginBottom: '4px', display: 'block' };

/** Split the textarea of image URLs into a clean array (and back again). */
const parseImageUrls = (text) => (text || '').split('\n').map((s) => s.trim()).filter(Boolean);

export default function DealRoomPage() {
  // view: 'mine' | 'market' | 'detail' | 'saved' | 'interests' | 'history'
  const [view, setView] = useState('mine');
  const [deals, setDeals] = useState([]);
  const [market, setMarket] = useState([]);
  const [selected, setSelected] = useState(null);
  const [projects, setProjects] = useState([]);
  const [interests, setInterests] = useState([]);
  const [saved, setSaved] = useState([]);
  const [filters, setFilters] = useState({ category: '', subcategory: '' });
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
    catch (err) { setError(err?.message || 'Could not load your listings.'); }
    finally { setLoading(false); }
  }, []);

  const loadMarket = useCallback(async (f = {}) => {
    setLoading(true); setError('');
    try { setMarket(await api.getMarketplace(f) || []); }
    catch (err) { setError(err?.message || 'Could not load the directory.'); }
    finally { setLoading(false); }
  }, []);

  const loadProjects = useCallback(async () => {
    setLoading(true); setError('');
    try { setProjects(await api.getMySponsorProjects() || []); }
    catch (err) { setError(err?.message || 'Could not load your directory history.'); }
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
    catch (err) { setError(err?.message || 'Could not load your saved listings.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadMine(); }, [loadMine]);

  const switchTab = (tab) => {
    setError(''); setNotice(''); setSelected(null); setShowForm(false);
    setView(tab);
    if (tab === 'market') loadMarket(filters);
    if (tab === 'mine') loadMine();
    if (tab === 'history') loadProjects();
    if (tab === 'interests') loadInterests();
    if (tab === 'saved') loadSaved();
  };

  const applyFilter = (key, value) => {
    const next = { ...filters, [key]: value, ...(key === 'category' ? { subcategory: '' } : {}) };
    setFilters(next);
    loadMarket(next);
  };

  const isListTab = view === 'mine' || view === 'market' || view === 'history' || view === 'interests' || view === 'saved';

  // ---- create / edit ----
  const openCreate = () => { setEditingId(null); setForm(EMPTY_FORM); setNotice(''); setShowForm(true); };
  const openEdit = (deal) => {
    setEditingId(deal.id);
    setForm({
      title: deal.title || '', category: deal.category || 'OTHER', subcategory: deal.subcategory || '',
      status: deal.status || 'DRAFT', location: deal.location || '', websiteUrl: deal.websiteUrl || '',
      description: deal.description || '', imageUrls: (deal.imageUrls || []).join('\n'),
      contactEmail: deal.contactEmail || '', contactPhone: deal.contactPhone || '',
    });
    setNotice(''); setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); };
  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submitDeal = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setError('Please give your listing a project name.'); return; }
    if (!form.websiteUrl.trim()) { setError('An external listing link is required.'); return; }
    if (!form.contactEmail.trim() && !form.contactPhone.trim()) {
      setError('Add a contact email or phone number so people can reach you.'); return;
    }
    setSaving(true); setError('');
    const payload = {
      title: form.title.trim(), category: form.category,
      subcategory: form.subcategory || undefined, status: form.status,
      location: form.location.trim() || undefined,
      websiteUrl: form.websiteUrl.trim(),
      description: form.description.trim() || undefined,
      imageUrls: parseImageUrls(form.imageUrls),
      contactEmail: form.contactEmail.trim() || undefined,
      contactPhone: form.contactPhone.trim() || undefined,
    };
    try {
      if (editingId) { await api.updateDeal(editingId, payload); setNotice('Listing updated.'); }
      else { await api.createDeal(payload); setNotice('Listing posted.'); }
      closeForm(); await loadMine();
    } catch (err) { setError(err?.message || 'Could not save the listing.'); }
    finally { setSaving(false); }
  };

  const removeDeal = async (deal) => {
    if (!window.confirm(`Delete "${deal.title}"? This cannot be undone.`)) return;
    setError('');
    try { await api.deleteDeal(deal.id); setNotice('Listing deleted.'); await loadMine(); }
    catch (err) { setError(err?.message || 'Could not delete the listing.'); }
  };

  // ---- detail ----
  const openDetail = async (deal) => {
    setError(''); setNotice('');
    try {
      const full = await api.getDeal(deal.id);
      setSelected(full); setView('detail');
    } catch (err) { setError(err?.message || 'Could not open the listing.'); }
  };

  return (
    <div id="page-dealroom" className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">Deal Room</div>
          <div className="page-subtitle">
            A simple bulletin board directory for posting and browsing real estate projects.
            This platform is purely for information and does not facilitate any investments
            or offer financial advice.
          </div>
        </div>
        {(view === 'mine' || view === 'market') && (
          <div className="page-actions">
            <button className="btn btn-primary btn-sm" onClick={openCreate}>
              <i className="ti ti-plus"></i> Post a listing
            </button>
          </div>
        )}
      </div>

      {/* Non-dismissible, and outside the view switch so it shows on the index and on
          every listing detail view. Do not add a close control to this. */}
      <ComplianceBanner />

      {/* Tabs (hidden in sub-views) */}
      {isListTab && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <button className={`btn btn-sm ${view === 'mine' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => switchTab('mine')}>My Listings</button>
          <button className={`btn btn-sm ${view === 'market' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => switchTab('market')}>Marketplace</button>
          <button className={`btn btn-sm ${view === 'saved' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => switchTab('saved')}>Saved</button>
          <button className={`btn btn-sm ${view === 'interests' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => switchTab('interests')}>My Interests</button>
          <button className={`btn btn-sm ${view === 'history' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => switchTab('history')}>Directory History</button>
        </div>
      )}

      {error && <Banner color="negative">{error}</Banner>}
      {notice && !showForm && <Banner color="positive">{notice}</Banner>}

      {/* Create/edit form */}
      {showForm && (view === 'mine' || view === 'market') && (
        <ListingForm form={form} setField={setField} editingId={editingId} saving={saving} onSubmit={submitDeal} onCancel={closeForm} />
      )}

      {/* MY LISTINGS */}
      {view === 'mine' && (
        loading ? <Loading text="Loading your listings…" />
        : deals.length === 0 && !showForm ? (
          <EmptyState icon="🏢" title="No listings yet"
            body="Post a property to the directory so others can find it and contact you directly."
            cta="Post your first listing" onCta={openCreate} />
        ) : (
          <div className="grid-3" style={{ gap: '16px' }}>
            {deals.map((deal) => (
              <ListingCard key={deal.id} deal={deal} owner
                onEdit={() => openEdit(deal)} onDelete={() => removeDeal(deal)} />
            ))}
          </div>
        )
      )}

      {/* MARKETPLACE (the public directory) */}
      {view === 'market' && (
        <>
          <DirectoryFilters filters={filters} onChange={applyFilter} />
          {loading ? <Loading text="Loading the directory…" />
            : market.length === 0 ? (
              <EmptyState icon="🏢" title="No matching listings"
                body="No listings match your filters yet. Try clearing them, or check back soon." />
            ) : (
              <div className="grid-3" style={{ gap: '16px' }}>
                {market.map((deal) => (
                  <ListingCard key={deal.id} deal={deal} onOpen={() => openDetail(deal)} />
                ))}
              </div>
            )}
        </>
      )}

      {/* SAVED */}
      {view === 'saved' && (
        loading ? <Loading text="Loading your saved listings…" />
        : saved.length === 0 ? (
          <EmptyState icon="🔖" title="No saved listings"
            body="Save listings from the directory to keep an eye on them here." />
        ) : (
          <div className="grid-3" style={{ gap: '16px' }}>
            {saved.map((deal) => <ListingCard key={deal.id} deal={deal} onOpen={() => openDetail(deal)} />)}
          </div>
        )
      )}

      {/* MY INTERESTS — listings this user asked for contact details on */}
      {view === 'interests' && (
        loading ? <Loading text="Loading your interests…" />
        : interests.length === 0 ? (
          <EmptyState icon="📨" title="No interests yet"
            body="Listings you request contact details for will appear here so you can find them again." />
        ) : (
          <div className="card">
            <div className="section-title">Listings you've requested contact details for</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {interests.map((it) => (
                <div key={it.id} style={{ border: '1px solid var(--tv-border)', borderRadius: 'var(--radius-md)', padding: '12px' }}>
                  <div style={{ fontWeight: 600 }}>{it.dealTitle}</div>
                  <div style={{ fontSize: '12px', color: 'var(--tv-text-muted)' }}>
                    Requested {it.createdAt ? new Date(it.createdAt).toLocaleDateString() : ''}
                    {it.dealStatus ? ` · Listing ${labelFor(STATUSES, it.dealStatus)}` : ''}
                  </div>
                  {it.message && <div style={{ fontSize: '12.5px', color: 'var(--tv-text-secondary)', marginTop: '4px' }}>{it.message}</div>}
                </div>
              ))}
            </div>
          </div>
        )
      )}

      {/* DIRECTORY HISTORY (the user's previously listed projects) */}
      {view === 'history' && (
        <DirectoryHistoryView projects={projects} loading={loading} onChanged={loadProjects} setError={setError} setNotice={setNotice} />
      )}

      {/* LISTING DETAIL */}
      {view === 'detail' && selected && (
        <ListingDetail deal={selected} onBack={() => switchTab('market')} onNotice={setNotice} />
      )}
    </div>
  );
}

/* ---------- sub-components ---------- */

/**
 * The mandatory global disclaimer. Deliberately has no dismiss control and no collapsed
 * state — it must be visible on every view of the directory, every time.
 */
function ComplianceBanner() {
  return (
    <div role="alert" style={{
      border: '1px solid var(--tv-negative)', borderLeft: '4px solid var(--tv-negative)',
      background: 'var(--tv-negative-bg)', color: 'var(--tv-negative)',
      borderRadius: 'var(--radius-md)', padding: '12px 14px', marginBottom: '16px',
      fontSize: '12.5px', lineHeight: 1.6,
    }}>
      <strong>MANDATORY DISCLAIMER:</strong> This platform is an informational directory only.
      TerraVest is <strong>not a registered broker-dealer or investment advisor</strong>, does
      not facilitate securities transactions, and provides no investment advice or
      recommendations. We do <strong>not verify, vet, screen, endorse or manage</strong> any
      property listed here. All discussions and transactions occur offline, directly with the
      listing party, at your own risk.
    </div>
  );
}

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

/** The property photo, or a neutral placeholder. Photos lead the card, never numbers. */
function ListingPhoto({ deal, height = 150 }) {
  const first = (deal.imageUrls || [])[0];
  if (!first) {
    return (
      <div style={{
        height, borderRadius: 'var(--radius-md)', background: 'var(--tv-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--tv-text-muted)', fontSize: '24px',
      }}>
        <i className="ti ti-building-community"></i>
      </div>
    );
  }
  return (
    <img src={first} alt={deal.title}
      style={{ width: '100%', height, objectFit: 'cover', borderRadius: 'var(--radius-md)', display: 'block' }} />
  );
}

/**
 * Reveal the poster's own contact details. This opens the viewer's own mail client — the
 * platform never sends the message and never sits in the middle of the conversation.
 */
function ContactButton({ deal, onRequested, style }) {
  const [revealed, setRevealed] = useState(false);

  const mailto = deal.contactEmail
    ? `mailto:${deal.contactEmail}?subject=${encodeURIComponent(`Inquiry about ${deal.title}`)}`
    : null;

  const reveal = (e) => {
    e.stopPropagation();
    setRevealed(true);
    // Best-effort log so the listing shows up under "My Interests". Never block the mailto.
    api.requestDealContactInfo(deal.id, {
      name: getStoredName() || 'Directory user',
      email: getStoredEmail() || '',
    }).then(() => onRequested && onRequested()).catch(() => {});
  };

  if (!revealed) {
    return (
      <button className="btn btn-secondary btn-sm" style={{ justifyContent: 'center', ...style }} onClick={reveal}>
        <i className="ti ti-mail"></i> Request Contact Information
      </button>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', ...style }}>
      {mailto && (
        <a className="btn btn-secondary btn-sm" style={{ justifyContent: 'center' }} href={mailto} onClick={(e) => e.stopPropagation()}>
          <i className="ti ti-mail"></i> {deal.contactEmail}
        </a>
      )}
      {deal.contactPhone && (
        <a className="btn btn-secondary btn-sm" style={{ justifyContent: 'center' }} href={`tel:${deal.contactPhone}`} onClick={(e) => e.stopPropagation()}>
          <i className="ti ti-phone"></i> {deal.contactPhone}
        </a>
      )}
      {!mailto && !deal.contactPhone && (
        <span style={{ color: 'var(--tv-text-muted)' }}>This listing has no contact details.</span>
      )}
    </div>
  );
}

/** The hard hand-off to the poster's own site. Always a real link, always a new tab. */
function ExternalLinkButton({ deal, primary = true, children }) {
  if (!deal.websiteUrl) return null;
  return (
    <a className={`btn ${primary ? 'btn-primary' : 'btn-secondary'} btn-sm`}
      style={{ justifyContent: 'center' }}
      href={deal.websiteUrl} target="_blank" rel="noopener noreferrer external"
      onClick={(e) => e.stopPropagation()}>
      {children || <>View Listing Details (External Link) <i className="ti ti-external-link"></i></>}
    </a>
  );
}

function ListingCard({ deal, owner, onOpen, onEdit, onDelete }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px', cursor: onOpen ? 'pointer' : 'default' }}
      onClick={onOpen}>
      <ListingPhoto deal={deal} />
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '16px', lineHeight: 1.3 }}>{deal.title}</div>
        <span className={`badge ${STATUS_BADGE[deal.status] || 'badge-gray'}`} style={{ fontSize: '10.5px', flexShrink: 0 }}>
          {labelFor(STATUSES, deal.status)}
        </span>
      </div>

      {/* Descriptive tags only — category and property type, never a performance claim. */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="badge badge-gray" style={{ fontSize: '10.5px' }}>
          {labelFor(CATEGORIES, deal.category)}{deal.subcategory ? ` • ${humanize(deal.subcategory)}` : ''}
        </span>
      </div>
      {deal.location && (
        <div style={{ fontSize: '12px', color: 'var(--tv-text-muted)' }}>
          <i className="ti ti-map-pin"></i> {deal.location}
        </div>
      )}

      {deal.description && (
        <div style={{ fontSize: '12.5px', color: 'var(--tv-text-secondary)', lineHeight: 1.6 }}>
          {deal.description}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto', paddingTop: '6px' }}>
        <ExternalLinkButton deal={deal} />
        <ContactButton deal={deal} />
        {owner && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-secondary btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={(e) => { e.stopPropagation(); onEdit(); }}>
              <i className="ti ti-edit"></i> Edit
            </button>
            <button className="btn btn-secondary btn-sm" style={{ color: 'var(--tv-negative)' }} onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Delete listing">
              <i className="ti ti-trash"></i>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function DirectoryFilters({ filters, onChange }) {
  const typeOptions = PROPERTY_TYPES[filters.category] || [];
  const sel = { padding: '7px 10px', border: '1px solid var(--tv-border)', borderRadius: 'var(--radius-md)', fontSize: '13px', background: 'white' };
  const hasAny = filters.category || filters.subcategory;
  return (
    <div className="card" style={{ marginBottom: '16px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
      <span style={{ fontSize: '12px', color: 'var(--tv-text-muted)', fontWeight: 600 }}>Filter</span>
      <select style={sel} value={filters.category} onChange={(e) => onChange('category', e.target.value)}>
        <option value="">All categories</option>
        {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>
      <select style={sel} value={filters.subcategory} onChange={(e) => onChange('subcategory', e.target.value)} disabled={!filters.category}>
        <option value="">All property types</option>
        {typeOptions.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
      </select>
      <span style={{ flex: 1 }} />
      {/* Listings are ordered newest-first only. Ranking them by financial attractiveness
          is exactly the editorial judgement a passive directory must not make. */}
      <span style={{ fontSize: '11.5px', color: 'var(--tv-text-muted)' }}>Newest first</span>
      {hasAny && <button className="btn btn-secondary btn-sm" onClick={() => onChange('category', '')}>Clear</button>}
    </div>
  );
}

function ListingForm({ form, setField, editingId, saving, onSubmit, onCancel }) {
  const typeOptions = PROPERTY_TYPES[form.category] || [];
  // Changing category invalidates the property type — clear it.
  const onCategory = (e) => { setField('category')(e); setField('subcategory')({ target: { value: '' } }); };

  return (
    <div className="card" style={{ marginBottom: '16px' }}>
      <div className="section-title">{editingId ? 'Edit listing' : 'Post a listing'}</div>
      <form onSubmit={onSubmit}>
        <div className="grid-2" style={{ gap: '14px' }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={fieldLabel}>Project Name *</label>
            <input style={inputStyle} value={form.title} onChange={setField('title')} placeholder="e.g. The Melissa Property" />
          </div>

          <div><label style={fieldLabel}>Category</label>
            <select style={inputStyle} value={form.category} onChange={onCategory}>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select></div>
          <div><label style={fieldLabel}>Property Type</label>
            <select style={inputStyle} value={form.subcategory} onChange={setField('subcategory')}>
              <option value="">— Select —</option>
              {typeOptions.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
            </select></div>

          <div><label style={fieldLabel}>Location (City, State)</label>
            <input style={inputStyle} value={form.location} onChange={setField('location')} placeholder="e.g. Melissa, Texas" /></div>
          <div><label style={fieldLabel}>Status</label>
            <select style={inputStyle} value={form.status} onChange={setField('status')}>
              {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <div style={{ fontSize: '11px', color: 'var(--tv-text-muted)', marginTop: '4px' }}>Set to <strong>Open</strong> to list it in the directory.</div>
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={fieldLabel}>Description</label>
            <textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} value={form.description} onChange={setField('description')}
              placeholder="Describe the physical property — size, zoning, access, condition, surroundings." />
            <div style={{ fontSize: '11px', color: 'var(--tv-text-muted)', marginTop: '4px' }}>
              Describe the property itself. Do not include projected returns, yields, cap rates or entry prices.
            </div>
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={fieldLabel}>Property Images</label>
            <textarea style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }} value={form.imageUrls} onChange={setField('imageUrls')}
              placeholder={'https://your-site.com/photo-1.jpg\nhttps://your-site.com/photo-2.jpg'} />
            <div style={{ fontSize: '11px', color: 'var(--tv-text-muted)', marginTop: '4px' }}>One hosted image URL per line.</div>
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={fieldLabel}>External Link (URL) *</label>
            <input style={inputStyle} type="url" value={form.websiteUrl} onChange={setField('websiteUrl')} placeholder="https://yourproject.com/listing" />
            <div style={{ fontSize: '11px', color: 'var(--tv-text-muted)', marginTop: '4px' }}>
              Required. Links to your own site or your own legal offering portal — viewers leave this directory entirely.
            </div>
          </div>

          <div><label style={fieldLabel}>Contact Email</label>
            <input style={inputStyle} type="email" value={form.contactEmail} onChange={setField('contactEmail')} placeholder="you@example.com" /></div>
          <div><label style={fieldLabel}>Contact Phone</label>
            <input style={inputStyle} value={form.contactPhone} onChange={setField('contactPhone')} placeholder="+1 555 0100" /></div>
          <div style={{ gridColumn: '1 / -1', fontSize: '11px', color: 'var(--tv-text-muted)', marginTop: '-6px' }}>
            At least one is required. Inquiries go directly to you — this platform does not relay messages.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Post listing'}</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel} disabled={saving}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

function ListingDetail({ deal, onBack, onNotice }) {
  const [posterHistory, setPosterHistory] = useState([]);
  const [watched, setWatched] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let active = true;
    api.getDealSponsorProjects(deal.id)
      .then((list) => { if (active) setPosterHistory(Array.isArray(list) ? list : []); })
      .catch(() => { if (active) setPosterHistory([]); });
    return () => { active = false; };
  }, [deal.id]);

  const toggleWatch = async () => {
    try {
      if (watched) { await api.unwatchDeal(deal.id); setWatched(false); }
      else { await api.watchDeal(deal.id); setWatched(true); }
    } catch (e) { setErr(e?.message || 'Could not update your saved listings.'); }
  };

  const images = deal.imageUrls || [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', gap: '8px' }}>
        <button className="btn btn-secondary btn-sm" onClick={onBack}><i className="ti ti-arrow-left"></i> Back to the directory</button>
        <button className={`btn btn-sm ${watched ? 'btn-gold' : 'btn-secondary'}`} onClick={toggleWatch}>
          <i className={watched ? 'ti ti-bookmark-filled' : 'ti ti-bookmark'}></i> {watched ? 'Saved' : 'Save listing'}
        </button>
      </div>
      {err && <Banner color="negative">{err}</Banner>}

      <div className="grid-2" style={{ gap: '16px', alignItems: 'start' }}>
        <div className="card">
          {/* Photos and location lead the page. */}
          <ListingPhoto deal={deal} height={260} />
          {images.length > 1 && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
              {images.slice(1).map((src) => (
                <img key={src} src={src} alt={deal.title}
                  style={{ width: '84px', height: '64px', objectFit: 'cover', borderRadius: 'var(--radius-md)' }} />
              ))}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', margin: '14px 0 8px' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '22px' }}>{deal.title}</div>
            <span className={`badge ${STATUS_BADGE[deal.status] || 'badge-gray'}`}>{labelFor(STATUSES, deal.status)}</span>
            <span className="badge badge-gray">
              {labelFor(CATEGORIES, deal.category)}{deal.subcategory ? ` • ${humanize(deal.subcategory)}` : ''}
            </span>
          </div>
          {deal.location && (
            <div style={{ fontSize: '13px', color: 'var(--tv-text-muted)', marginBottom: '10px' }}>
              <i className="ti ti-map-pin"></i> {deal.location}
            </div>
          )}

          {deal.description && (
            <>
              <div className="section-title">Property description</div>
              <p style={{ fontSize: '13.5px', color: 'var(--tv-text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{deal.description}</p>
            </>
          )}

          {posterHistory.length > 0 && (
            <>
              <hr className="divider" />
              <div className="section-title">Directory history</div>
              <div style={{ fontSize: '11.5px', color: 'var(--tv-text-muted)', marginTop: '-4px', marginBottom: '10px' }}>
                Other projects this party has listed. Self-reported and not verified by TerraVest.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {posterHistory.map((p) => (
                  <div key={p.id} style={{ border: '1px solid var(--tv-border)', borderRadius: 'var(--radius-md)', padding: '12px' }}>
                    <div style={{ fontWeight: 600 }}>
                      {p.name}{p.year ? <span style={{ color: 'var(--tv-text-muted)', fontWeight: 400 }}> · {p.year}</span> : null}
                    </div>
                    {p.location && <div style={{ fontSize: '12px', color: 'var(--tv-text-muted)', marginTop: '2px' }}><i className="ti ti-map-pin"></i> {p.location}</div>}
                    {p.description && <div style={{ fontSize: '12.5px', color: 'var(--tv-text-secondary)', marginTop: '6px', lineHeight: 1.6 }}>{p.description}</div>}
                    {p.url && <a href={p.url} target="_blank" rel="noopener noreferrer external" style={{ fontSize: '12.5px', color: 'var(--tv-forest)', marginTop: '6px', display: 'inline-block' }}><i className="ti ti-external-link"></i> View project</a>}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* The only two things a viewer can do. */}
        <div className="card" style={{ position: 'sticky', top: 0 }}>
          <div className="section-title">Contact the listing party</div>
          <p style={{ fontSize: '13px', color: 'var(--tv-text-secondary)', lineHeight: 1.6 }}>
            All details, documents and discussions are handled directly by the party who posted
            this listing. TerraVest does not vet this listing and is not involved in any
            transaction that follows.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
            <ExternalLinkButton deal={deal} />
            <ContactButton deal={deal} onRequested={() => onNotice && onNotice('This listing was added to your interests.')} />
          </div>
        </div>
      </div>
    </div>
  );
}

const EMPTY_PROJECT = { name: '', description: '', url: '', location: '', year: '' };

/**
 * The user's own directory history: properties they have listed before. Descriptive only —
 * there is deliberately no "outcome" field, since a past outcome is a performance claim.
 */
function DirectoryHistoryView({ projects, loading, onChanged, setError, setNotice }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_PROJECT);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const openCreate = () => { setEditingId(null); setForm(EMPTY_PROJECT); setShowForm(true); };
  const openEdit = (p) => {
    setEditingId(p.id);
    setForm({ name: p.name || '', description: p.description || '', url: p.url || '', location: p.location || '', year: p.year ?? '' });
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
    };
    try {
      if (editingId) { await api.updateSponsorProject(editingId, payload); setNotice('Project updated.'); }
      else { await api.createSponsorProject(payload); setNotice('Project added to your directory history.'); }
      cancel(); await onChanged();
    } catch (err) { setError(err?.message || 'Could not save the project.'); }
    finally { setSaving(false); }
  };

  const remove = async (p) => {
    if (!window.confirm(`Remove "${p.name}" from your directory history?`)) return;
    setError('');
    try { await api.deleteSponsorProject(p.id); setNotice('Project removed.'); await onChanged(); }
    catch (err) { setError(err?.message || 'Could not remove the project.'); }
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ fontSize: '13px', color: 'var(--tv-text-secondary)', maxWidth: 560 }}>
          A descriptive record of properties you have listed before. It appears on your listings
          as context. Entries are self-reported and are not verified or endorsed by TerraVest.
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
              <div style={{ gridColumn: '1 / -1' }}><label style={fieldLabel}>Project link</label><input style={inputStyle} type="url" value={form.url} onChange={set('url')} placeholder="https://…" /></div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={fieldLabel}>Description</label>
                <textarea style={{ ...inputStyle, minHeight: '70px', resize: 'vertical' }} value={form.description} onChange={set('description')} placeholder="What was the property and your role?" />
                <div style={{ fontSize: '11px', color: 'var(--tv-text-muted)', marginTop: '4px' }}>Describe the property. Do not include returns, IRR or other performance figures.</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Add project'}</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={cancel} disabled={saving}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {loading ? <Loading text="Loading your directory history…" />
        : projects.length === 0 && !showForm ? (
          <EmptyState icon="🗂️" title="No directory history yet"
            body="Add properties you have listed before so viewers have context on your listings."
            cta="Add your first project" onCta={openCreate} />
        ) : (
          <div className="grid-3" style={{ gap: '16px' }}>
            {projects.map((p) => (
              <div key={p.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '15px' }}>
                  {p.name}{p.year ? <span style={{ color: 'var(--tv-text-muted)' }}> · {p.year}</span> : null}
                </div>
                {p.location && <div style={{ fontSize: '12px', color: 'var(--tv-text-muted)' }}><i className="ti ti-map-pin"></i> {p.location}</div>}
                {p.description && <div style={{ fontSize: '12.5px', color: 'var(--tv-text-secondary)', lineHeight: 1.6 }}>{p.description}</div>}
                {p.url && <a href={p.url} target="_blank" rel="noopener noreferrer external" style={{ fontSize: '12.5px', color: 'var(--tv-forest)' }}><i className="ti ti-external-link"></i> View project</a>}
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
