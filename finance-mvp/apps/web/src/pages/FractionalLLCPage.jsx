import React, { useState, useEffect, useCallback } from 'react';
import { currency } from '../utils/format';
import { api } from '../api';

/**
 * Fractional LLC — the user's ledger of private co-ownership positions.
 *
 * This page records interests the user *already owns*, bought directly from a sponsor off
 * this platform. It is bookkeeping, in the same family as the property and business
 * trackers, and it is deliberately not a marketplace:
 *   - nothing here is offered for sale, priced, or transferred;
 *   - every figure is derived from money the user says actually moved — there is no
 *     projected return, target IRR or valuation anywhere on the page;
 *   - positions arrive either by hand, or from a Deal Room listing the user tells us they
 *     invested in, which records a decision already made elsewhere.
 * See DealRoomPage.jsx for the directory's matching compliance posture.
 */

const ENTITY_TYPES = ['LLC', 'LP', 'JV', 'SYNDICATION', 'FUND', 'OTHER'];

const ASSET_TYPES = [
  'MULTIFAMILY', 'SINGLE_FAMILY', 'TOWNHOMES', 'CONSTRUCTION', 'LAND',
  'COMMERCIAL', 'MIXED_USE', 'RETAIL', 'INDUSTRIAL', 'OFFICE', 'HOSPITALITY', 'OTHER',
];

const STATUSES = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'EXITED', label: 'Exited' },
];

// Categories per ledger direction, mirroring the backend HoldingTaxonomy.
const CATEGORIES = {
  CONTRIBUTION: ['INITIAL', 'CAPITAL_CALL'],
  DISTRIBUTION: ['RENTAL_INCOME', 'RETURN_OF_CAPITAL', 'CAPITAL_GAIN', 'REFINANCE', 'SALE_PROCEEDS'],
};

// Distributions that hand back basis rather than pay a profit — shown as such in the ledger.
const CAPITAL_RETURNING = new Set(['RETURN_OF_CAPITAL', 'REFINANCE', 'SALE_PROCEEDS']);

const humanize = (v) => (v ? v.split('_').map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ') : '');

/**
 * Concentration labels mix taxonomy codes (RETURN_OF_CAPITAL) with free text the user typed
 * (sponsor names, locations). Only prettify the codes — running humanize over "Ridge Capital"
 * or "Bozeman, MT" would lower-case the proper nouns.
 */
const isEnumCode = (v) => !!v && /^[A-Z][A-Z0-9_]*$/.test(v);
const labelOf = (v) => (isEnumCode(v) ? humanize(v) : v);

const EMPTY_HOLDING = {
  name: '', entityType: 'LLC', assetType: '', location: '', sponsorName: '', sponsorContact: '',
  externalUrl: '', unitsHeld: '', totalUnits: '', committedAmount: '', acquiredOn: '',
  status: 'ACTIVE', notes: '',
};

const EMPTY_ENTRY = { direction: 'CONTRIBUTION', category: 'INITIAL', amount: '', occurredOn: '', note: '' };

const inputStyle = {
  width: '100%', padding: '9px 11px', border: '1px solid var(--tv-border)',
  borderRadius: 'var(--radius-md)', fontSize: '13.5px', background: 'white',
};
const fieldLabel = { fontSize: '11.5px', color: 'var(--tv-text-muted)', fontWeight: 600, marginBottom: '4px', display: 'block' };

const num = (v) => { if (v === '' || v == null) return undefined; const n = Number(v); return Number.isFinite(n) ? n : undefined; };
const pct = (v) => (v == null ? '—' : `${Number(v).toFixed(1)}%`);

export default function FractionalLLCPage() {
  const [holdings, setHoldings] = useState([]);
  const [summary, setSummary] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_HOLDING);
  const [showHow, setShowHow] = useState(false);
  const [tab, setTab] = useState('holdings'); // 'holdings' | 'k1'

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [list, sum] = await Promise.all([
        api.getPrivateHoldings(),
        api.getPrivateHoldingsSummary().catch(() => null),
      ]);
      setHoldings(list || []);
      setSummary(sum);
    } catch (err) { setError(err?.message || 'Could not load your holdings.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditingId(null); setForm(EMPTY_HOLDING); setNotice(''); setShowForm(true); };
  const openEdit = (h) => {
    setEditingId(h.id);
    setForm({
      name: h.name || '', entityType: h.entityType || 'LLC', assetType: h.assetType || '',
      location: h.location || '', sponsorName: h.sponsorName || '', sponsorContact: h.sponsorContact || '',
      externalUrl: h.externalUrl || '', unitsHeld: h.unitsHeld ?? '', totalUnits: h.totalUnits ?? '',
      committedAmount: h.committedAmount ?? '', acquiredOn: h.acquiredOn || '',
      status: h.status || 'ACTIVE', notes: h.notes || '',
    });
    setNotice(''); setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditingId(null); setForm(EMPTY_HOLDING); };
  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Give the entity a name.'); return; }
    setSaving(true); setError('');
    const payload = {
      name: form.name.trim(), entityType: form.entityType,
      assetType: form.assetType || undefined, location: form.location.trim() || undefined,
      sponsorName: form.sponsorName.trim() || undefined,
      sponsorContact: form.sponsorContact.trim() || undefined,
      externalUrl: form.externalUrl.trim() || undefined,
      unitsHeld: num(form.unitsHeld), totalUnits: num(form.totalUnits),
      committedAmount: num(form.committedAmount),
      acquiredOn: form.acquiredOn || undefined,
      status: form.status, notes: form.notes.trim() || undefined,
    };
    try {
      if (editingId) { await api.updatePrivateHolding(editingId, payload); setNotice('Holding updated.'); }
      else { await api.createPrivateHolding(payload); setNotice('Holding added.'); }
      closeForm(); await load();
    } catch (err) { setError(err?.message || 'Could not save the holding.'); }
    finally { setSaving(false); }
  };

  const remove = async (h) => {
    if (!window.confirm(`Remove "${h.name}" and its whole ledger? This cannot be undone.`)) return;
    setError('');
    try { await api.deletePrivateHolding(h.id); setNotice('Holding removed.'); await load(); }
    catch (err) { setError(err?.message || 'Could not remove the holding.'); }
  };

  const openDetail = async (h) => {
    setError('');
    try { setSelected(await api.getPrivateHolding(h.id)); }
    catch (err) { setError(err?.message || 'Could not open the holding.'); }
  };

  if (selected) {
    return (
      <HoldingDetail
        holding={selected}
        onBack={() => { setSelected(null); load(); }}
        onChanged={async () => {
          const fresh = await api.getPrivateHolding(selected.id).catch(() => null);
          if (fresh) setSelected(fresh);
        }}
      />
    );
  }

  return (
    <div id="page-fractional" className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">Fractional LLC</div>
          <div className="page-subtitle">
            Track the property LLCs and syndications you co-own — capital in, distributions
            out, and where your money is concentrated.
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => setShowHow((v) => !v)}>
            <i className="ti ti-help-circle"></i> How this works
          </button>
          <button className="btn btn-primary btn-sm" onClick={openCreate}>
            <i className="ti ti-plus"></i> Add a holding
          </button>
        </div>
      </div>

      {showHow && <HowThisWorks />}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button className={`btn btn-sm ${tab === 'holdings' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('holdings')}>Holdings</button>
        <button className={`btn btn-sm ${tab === 'k1' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('k1')}>Schedule K-1s</button>
      </div>

      {error && <Banner color="negative">{error}</Banner>}
      {notice && !showForm && <Banner color="positive">{notice}</Banner>}

      {tab === 'k1' ? <K1View /> : (
      <>
      {showForm && (
        <HoldingForm form={form} setField={setField} editingId={editingId} saving={saving}
          onSubmit={submit} onCancel={closeForm} />
      )}

      {loading ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--tv-text-muted)', fontSize: '13px' }}>
          Loading your holdings…
        </div>
      ) : holdings.length === 0 && !showForm ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: '34px', marginBottom: '10px' }}>🏛️</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '18px', marginBottom: '6px' }}>
            No holdings tracked yet
          </div>
          <div style={{ fontSize: '13px', color: 'var(--tv-text-muted)', maxWidth: 460, marginInline: 'auto', marginBottom: '16px' }}>
            Add an LLC or syndication you already co-own to track your capital account,
            distributions and sponsor concentration. You can also start one from a listing
            in the Deal Room.
          </div>
          <button className="btn btn-primary btn-sm" onClick={openCreate}>
            <i className="ti ti-plus"></i> Add your first holding
          </button>
        </div>
      ) : (
        <>
          {summary && <PortfolioSummary summary={summary} />}
          <div className="grid-3" style={{ gap: '16px' }}>
            {holdings.map((h) => (
              <HoldingCard key={h.id} holding={h}
                onOpen={() => openDetail(h)} onEdit={() => openEdit(h)} onDelete={() => remove(h)} />
            ))}
          </div>
        </>
      )}
      </>
      )}
    </div>
  );
}

/* ---------- Schedule K-1 tracking ---------- */

const K1_STATUS_LABEL = { EXPECTED: 'Waiting', RECEIVED: 'Received', NOT_APPLICABLE: 'Not issued' };

/**
 * K-1 tracking for one tax year.
 *
 * The organising idea is filing readiness: a single outstanding K-1 blocks the whole return,
 * so the headline is "how many are you still waiting on", and the primary action on an
 * outstanding one is to chase the sponsor by email.
 */
function K1View() {
  const [years, setYears] = useState([]);
  const [year, setYear] = useState(null);
  const [data, setData] = useState(null);
  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // the K-1 record being updated

  const load = useCallback(async (y) => {
    setLoading(true); setError('');
    try {
      const [summary, everything] = await Promise.all([
        api.getK1Year(y),
        api.getAllK1s().catch(() => []),
      ]);
      setData(summary);
      setAll(everything || []);
      setYear(summary.taxYear);
    } catch (err) { setError(err?.message || 'Could not load your K-1s.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    api.getK1Years().then((ys) => setYears(ys || [])).catch(() => setYears([]));
    load();
  }, [load]);

  if (loading && !data) {
    return <div className="card" style={{ textAlign: 'center', color: 'var(--tv-text-muted)', fontSize: '13px' }}>Loading K-1s…</div>;
  }
  if (!data) {
    return error ? <Banner color="negative">{error}</Banner> : null;
  }

  const forYear = all.filter((k) => k.taxYear === year);
  const tracked = forYear.length > 0 ? forYear : (data.outstanding || []);

  return (
    <div>
      {error && <Banner color="negative">{error}</Banner>}

      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div className="section-title" style={{ marginBottom: 0 }}>Filing readiness</div>
          <select
            style={{ padding: '7px 10px', border: '1px solid var(--tv-border)', borderRadius: 'var(--radius-md)', fontSize: '13px', background: 'white' }}
            value={year || ''} onChange={(e) => load(Number(e.target.value))}>
            {(years.length ? years : [data.taxYear]).map((y) => (
              <option key={y} value={y}>Tax year {y}</option>
            ))}
          </select>
        </div>

        <div style={{
          marginTop: '12px', padding: '12px 14px', borderRadius: 'var(--radius-md)', lineHeight: 1.6, fontSize: '13px',
          background: data.readyToFile ? 'var(--tv-positive-bg)' : 'var(--tv-negative-bg)',
          color: data.readyToFile ? 'var(--tv-positive)' : 'var(--tv-negative)',
        }}>
          {data.readyToFile ? (
            <>
              <i className="ti ti-circle-check"></i> <strong>Nothing outstanding for {data.taxYear}.</strong>{' '}
              Every K-1 you're owed has arrived{data.notApplicable > 0 ? ` (${data.notApplicable} not issued)` : ''}.
            </>
          ) : (
            <>
              <i className="ti ti-alert-triangle"></i> <strong>Waiting on {data.expected} K-1{data.expected === 1 ? '' : 's'} for {data.taxYear}.</strong>{' '}
              You can't file until they arrive
              {data.overdue > 0 && <> — <strong>{data.overdue}</strong> {data.overdue === 1 ? 'is' : 'are'} already past the 15 April deadline, so an extension may be needed</>}.
            </>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '14px', marginTop: '14px' }}>
          <Metric label="Received" value={String(data.received)} />
          <Metric label="Still waiting" value={String(data.expected)} accent={data.expected > 0} />
          <Metric label="Not issued" value={String(data.notApplicable)} />
          <Metric label="Rental income (box 2)" value={currency(data.rentalIncome || 0)} />
          <Metric label="Ordinary income (box 1)" value={currency(data.ordinaryIncome || 0)} />
          <Metric label="Distributions (box 19)" value={currency(data.distributions || 0)} />
        </div>
        <div style={{ fontSize: '11px', color: 'var(--tv-text-muted)', marginTop: '10px' }}>
          Totals cover the K-1s you've marked received and transcribed. They're your own
          records for tax prep — TerraVest does not verify them or file on your behalf.
        </div>
      </div>

      {tracked.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--tv-text-muted)', fontSize: '13px' }}>
          No K-1s tracked for {data.taxYear}. Add a holding and one will be expected for each
          tax year you held it.
        </div>
      ) : (
        <div className="card">
          <div className="section-title">K-1s for {data.taxYear}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {tracked.map((k) => (
              <K1Row key={k.id} k1={k} onEdit={() => setEditing(k)} />
            ))}
          </div>
        </div>
      )}

      {editing && (
        <K1EditModal
          k1={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load(year); }}
          onError={setError}
        />
      )}
    </div>
  );
}

function K1Row({ k1: k, onEdit }) {
  const outstanding = k.status === 'EXPECTED';
  const badge = k.overdue ? 'badge-red' : outstanding ? 'badge-gold' : k.status === 'RECEIVED' ? 'badge-green' : 'badge-gray';

  // Chasing is the whole point of an outstanding K-1 — pre-write the email.
  const chase = k.sponsorContact
    ? `mailto:${k.sponsorContact}?subject=${encodeURIComponent(`Schedule K-1 for ${k.taxYear} — ${k.holdingName || ''}`)}` +
      `&body=${encodeURIComponent(
        `Hello,\n\nCould you let me know when the ${k.taxYear} Schedule K-1 for ${k.holdingName || 'the partnership'} will be issued?\n\nI need it to complete my return.\n\nThank you.`)}`
    : null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
      border: '1px solid var(--tv-border)', borderRadius: 'var(--radius-md)', padding: '10px 12px',
    }}>
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ fontWeight: 600, fontSize: '13px' }}>{k.holdingName || `Holding #${k.holdingId}`}</div>
        <div style={{ fontSize: '11.5px', color: 'var(--tv-text-muted)' }}>
          {k.sponsorName || 'No sponsor recorded'}
          {k.receivedOn ? ` · received ${k.receivedOn}` : ''}
        </div>
      </div>

      <span className={`badge ${badge}`} style={{ fontSize: '10.5px' }}>
        {k.overdue ? 'Overdue' : K1_STATUS_LABEL[k.status] || k.status}
      </span>

      {k.rentalIncome != null && (
        <span style={{ fontSize: '12.5px', color: 'var(--tv-text-muted)' }}>
          Box 2 <strong style={{ color: 'var(--tv-text-primary, inherit)' }}>{currency(k.rentalIncome)}</strong>
        </span>
      )}

      {k.documentUrl && (
        <a href={k.documentUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--tv-forest)', fontSize: '12.5px' }}>
          <i className="ti ti-file-text"></i> Document
        </a>
      )}

      {outstanding && chase && (
        <a className="btn btn-secondary btn-sm" href={chase}>
          <i className="ti ti-mail"></i> Chase sponsor
        </a>
      )}
      <button className="btn btn-secondary btn-sm" onClick={onEdit}>
        <i className="ti ti-edit"></i> Update
      </button>
    </div>
  );
}

/** Mark a K-1 received and transcribe the boxes that matter for a return. */
function K1EditModal({ k1, onClose, onSaved, onError }) {
  const [form, setForm] = useState({
    status: k1.status || 'EXPECTED',
    receivedOn: k1.receivedOn || '',
    documentUrl: k1.documentUrl || '',
    ordinaryIncome: k1.ordinaryIncome ?? '',
    rentalIncome: k1.rentalIncome ?? '',
    distributions: k1.distributions ?? '',
    notes: k1.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateK1(k1.id, {
        status: form.status,
        receivedOn: form.receivedOn || undefined,
        documentUrl: form.documentUrl.trim() || undefined,
        ordinaryIncome: num(form.ordinaryIncome),
        rentalIncome: num(form.rentalIncome),
        distributions: num(form.distributions),
        notes: form.notes.trim() || undefined,
      });
      await onSaved();
    } catch (err) { onError(err?.message || 'Could not update the K-1.'); setSaving(false); }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }} onClick={onClose}>
      <div className="card" style={{ maxWidth: 560, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="section-title">
          {k1.taxYear} K-1 — {k1.holdingName || `Holding #${k1.holdingId}`}
        </div>
        <form onSubmit={save}>
          <div className="grid-2" style={{ gap: '14px' }}>
            <div><label style={fieldLabel}>Status</label>
              <select style={inputStyle} value={form.status} onChange={set('status')}>
                <option value="EXPECTED">Waiting for it</option>
                <option value="RECEIVED">Received</option>
                <option value="NOT_APPLICABLE">Not issued for this year</option>
              </select></div>
            <div><label style={fieldLabel}>Received on</label>
              <input style={inputStyle} type="date" value={form.receivedOn} onChange={set('receivedOn')}
                disabled={form.status !== 'RECEIVED'} />
              <div style={{ fontSize: '11px', color: 'var(--tv-text-muted)', marginTop: '4px' }}>
                Left blank, today's date is used.
              </div></div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={fieldLabel}>Document link</label>
              <input style={inputStyle} type="url" value={form.documentUrl} onChange={set('documentUrl')}
                placeholder="https://… (e.g. the file in your Document Center)" /></div>

            <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--tv-border)', paddingTop: '10px', fontSize: '12px', fontWeight: 600, color: 'var(--tv-text-secondary)' }}>
              Figures from the form
            </div>
            <div><label style={fieldLabel}>Box 1 — ordinary business income</label>
              <input style={inputStyle} type="number" step="0.01" value={form.ordinaryIncome} onChange={set('ordinaryIncome')} placeholder="0.00" /></div>
            <div><label style={fieldLabel}>Box 2 — net rental real estate income</label>
              <input style={inputStyle} type="number" step="0.01" value={form.rentalIncome} onChange={set('rentalIncome')} placeholder="0.00" /></div>
            <div><label style={fieldLabel}>Box 19 — distributions</label>
              <input style={inputStyle} type="number" step="0.01" value={form.distributions} onChange={set('distributions')} placeholder="0.00" /></div>
            <div><label style={fieldLabel}>Notes</label>
              <input style={inputStyle} value={form.notes} onChange={set('notes')} placeholder="Optional" /></div>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--tv-text-muted)', marginTop: '10px' }}>
            Transcribe these from the form you received. They're recorded as-is for your own
            tax prep — nothing here is calculated, checked or filed for you.
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={saving}>Cancel</button>
          </div>
        </form>
      </div>
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

/**
 * Explains the ledger. Describes what the user records here — deliberately not "how to
 * invest", since this platform sells nothing and gives no advice.
 */
function HowThisWorks() {
  return (
    <div className="card" style={{ marginBottom: '16px' }}>
      <div className="section-title">How this works</div>
      <ol style={{ fontSize: '13.5px', lineHeight: 1.8, color: 'var(--tv-text-secondary)', paddingLeft: '18px', margin: 0 }}>
        <li><strong>Add what you own.</strong> Record each LLC, LP or syndication you hold units in — the sponsor, the property, your units and what you committed.</li>
        <li><strong>Log capital as it moves.</strong> Record your initial contribution and any capital calls, so you always know how much of your commitment is still uncalled.</li>
        <li><strong>Log distributions by type.</strong> Rental income, return of capital, refinance and sale proceeds are taxed differently, so the ledger keeps them apart and tracks how much of your basis has actually come back.</li>
        <li><strong>Watch your concentration.</strong> The summary shows how much of your capital sits with one sponsor, asset type or market — the exposure that is hardest to see one deal at a time.</li>
      </ol>
      <div className="setting-help" style={{ marginTop: 10 }}>
        <i className="ti ti-info-circle"></i> TerraVest does not sell, value, or broker these
        interests, and does not verify what you record. This is your own bookkeeping —
        figures come from what you enter, and nothing here is investment advice.
      </div>
    </div>
  );
}

/** Portfolio totals plus the concentration breakdown. */
function PortfolioSummary({ summary }) {
  const stat = (label, value, hint) => (
    <div>
      <div style={{ fontSize: '11px', color: 'var(--tv-text-muted)', fontWeight: 500 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '19px', lineHeight: 1.3 }}>{value}</div>
      {hint && <div style={{ fontSize: '11px', color: 'var(--tv-text-muted)' }}>{hint}</div>}
    </div>
  );

  const top = (summary.bySponsor || [])[0];

  return (
    <div className="card" style={{ marginBottom: '16px' }}>
      <div className="section-title">Portfolio</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px' }}>
        {stat('Contributed', currency(summary.contributed || 0), `${summary.holdingCount} holdings · ${summary.activeCount} active`)}
        {stat('Uncalled', currency(summary.uncalled || 0), 'Still callable')}
        {stat('Distributed', currency(summary.distributed || 0),
          summary.distributionRatio != null ? `${Number(summary.distributionRatio).toFixed(2)}× of capital in` : 'No distributions yet')}
        {stat('Capital returned', currency(summary.capitalReturned || 0), 'Basis paid back')}
        {stat('Income received', currency(summary.incomeReceived || 0), 'Profit on top of basis')}
        {stat('Still at risk', currency(summary.unreturnedCapital || 0), 'Unreturned basis')}
      </div>

      {top && Number(top.sharePct) > 0 && (
        <>
          <hr className="divider" />
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            <ConcentrationList title="By sponsor" rows={summary.bySponsor} />
            <ConcentrationList title="By asset type" rows={summary.byAssetType} />
            <ConcentrationList title="By location" rows={summary.byLocation} />
          </div>
          {Number(top.sharePct) >= 50 && (
            <div style={{
              marginTop: '12px', padding: '10px 12px', borderRadius: 'var(--radius-md)',
              background: 'var(--tv-gold-bg, var(--tv-negative-bg))', color: 'var(--tv-gold, var(--tv-negative))',
              fontSize: '12.5px', lineHeight: 1.5,
            }}>
              <i className="ti ti-alert-triangle"></i> <strong>{pct(top.sharePct)}</strong> of your
              contributed capital sits with a single sponsor ({top.label}). Worth knowing — this is
              an observation about your own ledger, not advice.
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ConcentrationList({ title, rows }) {
  const shown = (rows || []).slice(0, 4);
  if (shown.length === 0) return null;
  return (
    <div style={{ flex: '1 1 200px', minWidth: 0 }}>
      <div style={{ fontSize: '11.5px', color: 'var(--tv-text-muted)', fontWeight: 600, marginBottom: '6px' }}>{title}</div>
      {shown.map((r) => (
        <div key={r.label} style={{ marginBottom: '7px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', gap: '8px' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={labelOf(r.label)}>
              {labelOf(r.label)}
            </span>
            <span style={{ fontWeight: 600, flexShrink: 0 }}>{pct(r.sharePct)}</span>
          </div>
          <div style={{ height: '5px', background: 'var(--tv-border)', borderRadius: '999px', overflow: 'hidden', marginTop: '3px' }}>
            <div style={{ width: `${Math.min(100, Number(r.sharePct) || 0)}%`, height: '100%', background: 'var(--tv-forest)' }}></div>
          </div>
        </div>
      ))}
    </div>
  );
}

function HoldingCard({ holding: h, onOpen, onEdit, onDelete }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px', cursor: 'pointer' }} onClick={onOpen}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '16px', lineHeight: 1.3 }}>{h.name}</div>
        <span className={`badge ${h.status === 'EXITED' ? 'badge-gray' : 'badge-green'}`} style={{ fontSize: '10.5px', flexShrink: 0 }}>
          {h.status === 'EXITED' ? 'Exited' : 'Active'}
        </span>
      </div>

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="badge badge-gray" style={{ fontSize: '10.5px' }}>
          {h.entityType}{h.assetType ? ` • ${humanize(h.assetType)}` : ''}
        </span>
        {h.ownershipPct != null && (
          <span className="badge badge-forest" style={{ fontSize: '10.5px' }}>{pct(h.ownershipPct)} owned</span>
        )}
      </div>

      {h.sponsorName && (
        <div style={{ fontSize: '12px', color: 'var(--tv-text-muted)' }}>
          <i className="ti ti-briefcase"></i> {h.sponsorName}
        </div>
      )}
      {h.location && (
        <div style={{ fontSize: '12px', color: 'var(--tv-text-muted)' }}>
          <i className="ti ti-map-pin"></i> {h.location}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <Metric label="Contributed" value={currency(h.contributed || 0)} />
        <Metric label="Distributed" value={currency(h.distributed || 0)} />
        <Metric label="Still at risk" value={currency(h.unreturnedCapital || 0)} />
        {h.uncalled != null && Number(h.uncalled) > 0 && (
          <Metric label="Uncalled" value={currency(h.uncalled)} accent />
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '6px' }}>
        <button className="btn btn-secondary btn-sm" style={{ flex: 1, justifyContent: 'center' }}
          onClick={(e) => { e.stopPropagation(); onEdit(); }}>
          <i className="ti ti-edit"></i> Edit
        </button>
        <button className="btn btn-secondary btn-sm" style={{ color: 'var(--tv-negative)' }}
          onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Remove holding">
          <i className="ti ti-trash"></i>
        </button>
      </div>
    </div>
  );
}

function Metric({ label, value, accent }) {
  return (
    <div>
      <div style={{ fontSize: '11px', color: 'var(--tv-text-muted)', fontWeight: 500 }}>{label}</div>
      <div style={{ fontWeight: 600, fontSize: '13.5px', color: accent ? 'var(--tv-gold)' : 'inherit' }}>{value}</div>
    </div>
  );
}

function HoldingForm({ form, setField, editingId, saving, onSubmit, onCancel }) {
  return (
    <div className="card" style={{ marginBottom: '16px' }}>
      <div className="section-title">{editingId ? 'Edit holding' : 'Add a holding'}</div>
      <form onSubmit={onSubmit}>
        <div className="grid-2" style={{ gap: '14px' }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={fieldLabel}>Entity name *</label>
            <input style={inputStyle} value={form.name} onChange={setField('name')} placeholder="e.g. Cedar Ridge Land LLC" />
          </div>
          <div><label style={fieldLabel}>Entity type</label>
            <select style={inputStyle} value={form.entityType} onChange={setField('entityType')}>
              {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select></div>
          <div><label style={fieldLabel}>Asset type</label>
            <select style={inputStyle} value={form.assetType} onChange={setField('assetType')}>
              <option value="">— Select —</option>
              {ASSET_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
            </select></div>

          <div><label style={fieldLabel}>Location</label>
            <input style={inputStyle} value={form.location} onChange={setField('location')} placeholder="e.g. Bozeman, MT" /></div>
          <div><label style={fieldLabel}>Status</label>
            <select style={inputStyle} value={form.status} onChange={setField('status')}>
              {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select></div>

          <div><label style={fieldLabel}>Sponsor / manager</label>
            <input style={inputStyle} value={form.sponsorName} onChange={setField('sponsorName')} placeholder="e.g. Ridge Capital" />
            <div style={{ fontSize: '11px', color: 'var(--tv-text-muted)', marginTop: '4px' }}>
              Used to show your exposure across deals with the same sponsor.
            </div></div>
          <div><label style={fieldLabel}>Sponsor contact email</label>
            <input style={inputStyle} type="email" value={form.sponsorContact} onChange={setField('sponsorContact')} placeholder="ir@sponsor.com" /></div>

          <div><label style={fieldLabel}>Units you hold</label>
            <input style={inputStyle} type="number" step="0.0001" min="0" value={form.unitsHeld} onChange={setField('unitsHeld')} placeholder="25" /></div>
          <div><label style={fieldLabel}>Total units in the entity</label>
            <input style={inputStyle} type="number" step="0.0001" min="0" value={form.totalUnits} onChange={setField('totalUnits')} placeholder="200" /></div>

          <div><label style={fieldLabel}>Capital committed ($)</label>
            <input style={inputStyle} type="number" min="0" value={form.committedAmount} onChange={setField('committedAmount')} placeholder="100000" />
            <div style={{ fontSize: '11px', color: 'var(--tv-text-muted)', marginTop: '4px' }}>
              What you agreed to put in. Actual contributions are logged in the ledger.
            </div></div>
          <div><label style={fieldLabel}>Acquired on</label>
            <input style={inputStyle} type="date" value={form.acquiredOn} onChange={setField('acquiredOn')} /></div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={fieldLabel}>Sponsor / deal link</label>
            <input style={inputStyle} type="url" value={form.externalUrl} onChange={setField('externalUrl')} placeholder="https://sponsor.com/deal" /></div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={fieldLabel}>Notes</label>
            <textarea style={{ ...inputStyle, minHeight: '70px', resize: 'vertical' }} value={form.notes} onChange={setField('notes')}
              placeholder="Operating agreement terms, liquidity windows, anything you want to remember." />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
            {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add holding'}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel} disabled={saving}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

/** One holding: its capital account, and the ledger behind it. */
function HoldingDetail({ holding: h, onBack, onChanged }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [entry, setEntry] = useState({ ...EMPTY_ENTRY, occurredOn: new Date().toISOString().slice(0, 10) });

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try { setEntries(await api.getHoldingEntries(h.id) || []); }
    catch (err) { setError(err?.message || 'Could not load the ledger.'); }
    finally { setLoading(false); }
  }, [h.id]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const setEntryField = (k) => (e) => setEntry((s) => {
    const next = { ...s, [k]: e.target.value };
    // Switching direction invalidates the category — snap to that direction's first.
    if (k === 'direction') next.category = CATEGORIES[e.target.value][0];
    return next;
  });

  const addEntry = async (e) => {
    e.preventDefault();
    if (!entry.amount || Number(entry.amount) <= 0) { setError('Enter an amount greater than zero.'); return; }
    if (!entry.occurredOn) { setError('Enter a date.'); return; }
    setSaving(true); setError('');
    try {
      await api.addHoldingEntry(h.id, {
        direction: entry.direction, category: entry.category,
        amount: Number(entry.amount), occurredOn: entry.occurredOn,
        note: entry.note.trim() || undefined,
      });
      setEntry({ ...EMPTY_ENTRY, occurredOn: new Date().toISOString().slice(0, 10) });
      setShowAdd(false);
      await loadEntries();
      await onChanged();
    } catch (err) { setError(err?.message || 'Could not add the entry.'); }
    finally { setSaving(false); }
  };

  const removeEntry = async (row) => {
    if (!window.confirm('Remove this ledger entry?')) return;
    try { await api.deleteHoldingEntry(h.id, row.id); await loadEntries(); await onChanged(); }
    catch (err) { setError(err?.message || 'Could not remove the entry.'); }
  };

  return (
    <div id="page-fractional" className="page active">
      <button className="btn btn-secondary btn-sm" style={{ marginBottom: '16px' }} onClick={onBack}>
        <i className="ti ti-arrow-left"></i> Back to holdings
      </button>

      {error && <Banner color="negative">{error}</Banner>}

      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '22px' }}>{h.name}</div>
          <span className={`badge ${h.status === 'EXITED' ? 'badge-gray' : 'badge-green'}`}>
            {h.status === 'EXITED' ? 'Exited' : 'Active'}
          </span>
          <span className="badge badge-gray">{h.entityType}{h.assetType ? ` • ${humanize(h.assetType)}` : ''}</span>
        </div>
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', fontSize: '12.5px', color: 'var(--tv-text-muted)', marginBottom: '14px' }}>
          {h.sponsorName && <span><i className="ti ti-briefcase"></i> {h.sponsorName}</span>}
          {h.location && <span><i className="ti ti-map-pin"></i> {h.location}</span>}
          {h.acquiredOn && <span><i className="ti ti-calendar"></i> Since {h.acquiredOn}</span>}
          {h.sponsorContact && <a href={`mailto:${h.sponsorContact}`} style={{ color: 'var(--tv-forest)' }}><i className="ti ti-mail"></i> {h.sponsorContact}</a>}
          {h.externalUrl && <a href={h.externalUrl} target="_blank" rel="noopener noreferrer external" style={{ color: 'var(--tv-forest)' }}><i className="ti ti-external-link"></i> Sponsor page</a>}
        </div>

        <div className="section-title">Capital account</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '14px' }}>
          <Metric label="Committed" value={h.committedAmount != null ? currency(h.committedAmount) : '—'} />
          <Metric label="Contributed" value={currency(h.contributed || 0)} />
          <Metric label="Uncalled" value={h.uncalled != null ? currency(h.uncalled) : '—'} accent={Number(h.uncalled) > 0} />
          <Metric label="Capital returned" value={currency(h.capitalReturned || 0)} />
          <Metric label="Income received" value={currency(h.incomeReceived || 0)} />
          <Metric label="Still at risk" value={currency(h.unreturnedCapital || 0)} />
          <Metric label="Ownership" value={pct(h.ownershipPct)} />
          <Metric label="Returned / in"
            value={h.distributionRatio != null ? `${Number(h.distributionRatio).toFixed(2)}×` : '—'} />
        </div>
        {h.notes && (
          <>
            <hr className="divider" />
            <div style={{ fontSize: '13px', color: 'var(--tv-text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{h.notes}</div>
          </>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div className="section-title" style={{ marginBottom: 0 }}>Ledger</div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd((v) => !v)}>
            <i className="ti ti-plus"></i> Record a movement
          </button>
        </div>

        {showAdd && (
          <form onSubmit={addEntry} style={{ marginTop: '14px', paddingBottom: '14px', borderBottom: '1px solid var(--tv-border)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', alignItems: 'end' }}>
              <div><label style={fieldLabel}>Direction</label>
                <select style={inputStyle} value={entry.direction} onChange={setEntryField('direction')}>
                  <option value="CONTRIBUTION">Capital in</option>
                  <option value="DISTRIBUTION">Distribution out</option>
                </select></div>
              <div><label style={fieldLabel}>Type</label>
                <select style={inputStyle} value={entry.category} onChange={setEntryField('category')}>
                  {CATEGORIES[entry.direction].map((c) => <option key={c} value={c}>{humanize(c)}</option>)}
                </select></div>
              <div><label style={fieldLabel}>Amount ($)</label>
                <input style={inputStyle} type="number" min="0" step="0.01" value={entry.amount} onChange={setEntryField('amount')} placeholder="25000" /></div>
              <div><label style={fieldLabel}>Date</label>
                <input style={inputStyle} type="date" value={entry.occurredOn} onChange={setEntryField('occurredOn')} /></div>
              <div><label style={fieldLabel}>Note</label>
                <input style={inputStyle} value={entry.note} onChange={setEntryField('note')} placeholder="Optional" /></div>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--tv-text-muted)', marginTop: '8px' }}>
              Return of capital, refinance and sale proceeds give back your basis; rental income
              and capital gain are profit on top of it. They are taxed differently, so the ledger
              keeps them apart.
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Saving…' : 'Add entry'}</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAdd(false)} disabled={saving}>Cancel</button>
            </div>
          </form>
        )}

        {loading ? (
          <div style={{ color: 'var(--tv-text-muted)', fontSize: '13px', padding: '14px 0' }}>Loading…</div>
        ) : entries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px', color: 'var(--tv-text-muted)', fontSize: '13px' }}>
            Nothing recorded yet. Add your initial contribution to start the capital account.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '14px' }}>
            {entries.map((row) => {
              const isIn = row.direction === 'CONTRIBUTION';
              const returnsCapital = CAPITAL_RETURNING.has(row.category);
              return (
                <div key={row.id} style={{
                  display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
                  border: '1px solid var(--tv-border)', borderRadius: 'var(--radius-md)', padding: '10px 12px',
                }}>
                  <i className={isIn ? 'ti ti-arrow-down-right' : 'ti ti-arrow-up-right'}
                    style={{ color: isIn ? 'var(--tv-text-muted)' : 'var(--tv-positive)' }}></i>
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={{ fontWeight: 600, fontSize: '13px' }}>{humanize(row.category)}</div>
                    <div style={{ fontSize: '11.5px', color: 'var(--tv-text-muted)' }}>
                      {row.occurredOn}{row.note ? ` · ${row.note}` : ''}
                    </div>
                  </div>
                  {!isIn && (
                    <span className={`badge ${returnsCapital ? 'badge-gray' : 'badge-green'}`} style={{ fontSize: '10px' }}>
                      {returnsCapital ? 'Returns capital' : 'Income'}
                    </span>
                  )}
                  <div style={{ fontWeight: 600, fontSize: '13.5px', color: isIn ? 'inherit' : 'var(--tv-positive)' }}>
                    {isIn ? '−' : '+'}{currency(row.amount)}
                  </div>
                  <button className="btn btn-secondary btn-sm" style={{ color: 'var(--tv-negative)' }}
                    onClick={() => removeEntry(row)} title="Remove entry">
                    <i className="ti ti-trash"></i>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
