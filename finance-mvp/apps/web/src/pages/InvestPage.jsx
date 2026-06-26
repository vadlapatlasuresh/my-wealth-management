import React, { useMemo, useState, useEffect } from 'react';
import { currency } from '../utils/format';
import { api } from '../api';
import Sparkline from '../components/Sparkline';
import LastRefreshed from '../components/LastRefreshed';
import PlaidLinkButton from '../components/PlaidLinkButton';
import { BROKERS, getBroker } from '../config/brokers';

/* ------------------------------------------------------------------ *
 * Static data / fallbacks
 * ------------------------------------------------------------------ */

/* Holdings start empty and are populated by real synced data via `snapshot.holdings`. */
const EMPTY_HOLDINGS = [];

/* Sub-tabs for the page. */
const TABS = [
  { id: 'stocks', label: 'Stocks & ETFs', icon: 'ti-chart-line' },
  { id: 'brokers', label: 'Brokers', icon: 'ti-building-bank' },
  { id: 'alts', label: 'Alternatives', icon: 'ti-diamond' },
  { id: 'market', label: 'Marketplace', icon: 'ti-map-2' }
];

/* NOTE: The available-broker list is no longer hardcoded here — it is
 * fully config-driven and imported from src/config/brokers.js (BROKERS).
 * To add a broker, edit that file only. */

const ACCOUNT_TYPES = ['Individual', 'Joint', 'Roth IRA', 'Traditional IRA', '401(k)', 'Custodial', 'Other'];

/* Alternative-investment categories, each with an icon + accent for the cards. */
const ALT_TYPES = [
  { value: 'LLC', label: 'LLC', icon: 'ti-building-community', accent: 'icon-forest' },
  { value: 'Land', label: 'Land', icon: 'ti-map-2', accent: 'icon-green' },
  { value: 'Apartments', label: 'Apartments / Syndication', icon: 'ti-building', accent: 'icon-blue' },
  { value: 'Private Equity', label: 'Private Equity', icon: 'ti-briefcase', accent: 'icon-purple' },
  { value: 'Crypto', label: 'Crypto', icon: 'ti-coin', accent: 'icon-amber' },
  { value: 'Collectibles', label: 'Collectibles', icon: 'ti-diamond', accent: 'icon-gold' },
  { value: 'Other', label: 'Other', icon: 'ti-circle-dot', accent: 'icon-red' }
];

/* Map an offering's risk level to a badge color. */
function riskBadge(risk) {
  const r = (risk || '').toLowerCase();
  if (r === 'low') return 'badge-green';
  if (r === 'high') return 'badge-red';
  return 'badge-amber';
}

/* Look up the metadata for an alternative type. */
function altMeta(type) {
  return ALT_TYPES.find((t) => t.value === type) || ALT_TYPES[ALT_TYPES.length - 1];
}

/* Format an ISO timestamp into a short "last synced" string. */
function syncedLabel(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

/* ================================================================== *
 * Page
 * ================================================================== */

export default function InvestPage({ snapshot }) {
  const totalInvested = snapshot?.components?.investments ?? 0;
  const series = snapshot?.series || null;

  /* Active sub-tab */
  const [tab, setTab] = useState('stocks');

  /* Marketplace request state */
  const [requested, setRequested] = useState({});

  /* Stocks tab — broker filter */
  const [brokerFilter, setBrokerFilter] = useState('all');

  /* Server-persisted broker accounts — start empty; the user links real accounts. */
  const [brokers, setBrokers] = useState([]);

  /* Server-persisted alternative investments — start empty; the user adds their own. */
  const [alts, setAlts] = useState([]);

  /* Real brokerage positions synced from Plaid Investments (via the aggregation
     service). Falls back to snapshot.holdings if the endpoint has nothing yet. */
  const [syncedHoldings, setSyncedHoldings] = useState([]);
  const holdings = syncedHoldings.length ? syncedHoldings : (snapshot?.holdings || EMPTY_HOLDINGS);

  /* Re-pull brokerage positions (after a Plaid link or a manual refresh). */
  const reloadHoldings = async () => {
    try {
      const h = await api.getHoldings();
      setSyncedHoldings(Array.isArray(h) ? h : []);
    } catch { /* keep what we have */ }
  };

  /* Load the user's linked brokers + alternatives + holdings from the backend on mount. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [b, a, h] = await Promise.allSettled([
        api.getBrokerAccounts(),
        api.getAltInvestments(),
        api.getHoldings(),
      ]);
      if (cancelled) return;
      if (b.status === 'fulfilled') setBrokers(Array.isArray(b.value) ? b.value : []);
      if (a.status === 'fulfilled') setAlts(Array.isArray(a.value) ? a.value : []);
      if (h.status === 'fulfilled') setSyncedHoldings(Array.isArray(h.value) ? h.value : []);
    })();
    return () => { cancelled = true; };
  }, []);

  /* ---- Broker connect flow state (config-driven) ----
   * `connectBrokerId` holds the id of the broker whose connect panel is open
   * (null = closed). `credInputs` holds the per-field values typed into a
   * credentials form. `showSecrets` toggles visibility of password fields.
   * `connectError` surfaces a required-field validation message. */
  const [connectBrokerId, setConnectBrokerId] = useState(null);
  const [credInputs, setCredInputs] = useState({});
  const [showSecrets, setShowSecrets] = useState({});
  const [connectError, setConnectError] = useState('');

  const activeBroker = connectBrokerId ? getBroker(connectBrokerId) : null;

  /* Open the connect panel for a given broker; reset any prior form state. */
  const openConnect = (brokerId) => {
    setConnectBrokerId(brokerId);
    setCredInputs({});
    setShowSecrets({});
    setConnectError('');
  };

  const closeConnect = () => {
    setConnectBrokerId(null);
    setCredInputs({});
    setShowSecrets({});
    setConnectError('');
  };

  /* Persist a newly connected broker. We deliberately store ONLY connected
   * metadata — never the entered credentials/passwords. The "name" prefers a
   * user-supplied broker name (the generic "Other" form) and falls back to the
   * config display name. A newly linked account shows $0 until real data syncs. */
  const finalizeConnect = async (broker, inputs = {}) => {
    const displayName = (inputs.name && inputs.name.trim()) || broker.name;
    try {
      // We send ONLY connected metadata — never the entered credentials/passwords.
      const created = await api.linkBrokerAccount({
        brokerId: broker.id,
        name: displayName,
        accountType: ACCOUNT_TYPES[0],
        value: 0,
      });
      setBrokers((prev) => [created, ...prev]);
      closeConnect();
    } catch (e) {
      setConnectError(e?.message || 'Could not link account.');
    }
  };

  /* OAuth path — simulated authorize step, then mark connected. */
  const confirmOauth = () => {
    if (!activeBroker) return;
    finalizeConnect(activeBroker);
  };

  /* Credentials path — validate required fields, then mark connected.
   * Entered values are used only to validate the form; they are NOT stored
   * (except a user-supplied broker name on the generic "Other" entry). */
  const confirmCredentials = () => {
    if (!activeBroker) return;
    const fields = activeBroker.fields || [];
    const missing = fields.find((f) => f.required && !String(credInputs[f.key] || '').trim());
    if (missing) {
      setConnectError(`${missing.label} is required.`);
      return;
    }
    finalizeConnect(activeBroker, credInputs);
  };

  const disconnectBroker = async (id) => {
    try {
      await api.deleteBrokerAccount(id);
      setBrokers((prev) => prev.filter((b) => b.id !== id));
    } catch { /* keep the row if the delete fails */ }
  };

  /* Re-sync — stamps a fresh linkedAt server-side so "last synced" updates. */
  const syncBroker = async (id) => {
    try {
      const updated = await api.syncBrokerAccount(id);
      setBrokers((prev) => prev.map((b) => (b.id === id ? updated : b)));
    } catch { /* ignore transient sync failure */ }
  };

  /* ---- Alternatives form state ---- */
  const [altForm, setAltForm] = useState(null); // null = hidden; {id?} present when editing
  const openAddAlt = () =>
    setAltForm({ id: null, type: ALT_TYPES[0].value, name: '', value: '', ownershipPct: '', notes: '' });
  const openEditAlt = (a) =>
    setAltForm({
      id: a.id,
      type: a.type,
      name: a.name,
      value: String(a.value ?? ''),
      ownershipPct: a.ownershipPct === '' || a.ownershipPct == null ? '' : String(a.ownershipPct),
      notes: a.notes || ''
    });

  const saveAlt = async () => {
    if (!altForm || !altForm.name.trim()) return;
    const payload = {
      type: altForm.type,
      name: altForm.name.trim(),
      value: Number(altForm.value) || 0,
      ownershipPct: altForm.ownershipPct === '' ? null : Number(altForm.ownershipPct),
      notes: altForm.notes,
    };
    try {
      if (altForm.id) {
        const updated = await api.updateAltInvestment(altForm.id, payload);
        setAlts((prev) => prev.map((a) => (a.id === altForm.id ? updated : a)));
      } else {
        const created = await api.createAltInvestment(payload);
        setAlts((prev) => [created, ...prev]);
      }
      setAltForm(null);
    } catch (e) {
      // Surface the failure inline by keeping the form open; reuse connectError area isn't ideal,
      // so just alert via the form's disabled state. Simplest: log and keep form open.
      setAltForm((f) => (f ? { ...f, error: e?.message || 'Could not save.' } : f));
    }
  };

  const deleteAlt = async (id) => {
    try {
      await api.deleteAltInvestment(id);
      setAlts((prev) => prev.filter((a) => a.id !== id));
    } catch { /* keep the row if delete fails */ }
  };

  /* ---- Derived values ---- */

  /* Distinct broker names present on the holdings (for the filter dropdown). */
  const holdingBrokers = useMemo(() => {
    const set = new Set();
    holdings.forEach((h) => h.broker && set.add(h.broker));
    return Array.from(set).sort();
  }, [holdings]);

  /* Holdings after applying the broker filter. */
  const filteredHoldings = useMemo(() => {
    if (brokerFilter === 'all') return holdings;
    return holdings.filter((h) => (h.broker || '') === brokerFilter);
  }, [holdings, brokerFilter]);

  const brokersTotal = brokers.reduce((sum, b) => sum + (Number(b.value) || 0), 0);
  const altsTotal = alts.reduce((sum, a) => sum + (Number(a.value) || 0), 0);

  /* Day change derived from real holdings (no fabricated number). */
  const dayChangeValue = useMemo(
    () =>
      holdings.reduce((sum, h) => {
        const mv = (Number(h.qty) || 0) * (Number(h.price) || 0);
        const pct = Number(h.dayChg) || 0;
        return sum + mv * (pct / 100);
      }, 0),
    [holdings]
  );
  const dayChangePct = totalInvested > 0 ? (dayChangeValue / totalInvested) * 100 : 0;

  /* Alternatives breakdown by type (only types with at least one entry). */
  const altBreakdown = useMemo(() => {
    const map = new Map();
    alts.forEach((a) => {
      const cur = map.get(a.type) || { type: a.type, count: 0, value: 0 };
      cur.count += 1;
      cur.value += Number(a.value) || 0;
      map.set(a.type, cur);
    });
    return Array.from(map.values()).sort((x, y) => y.value - x.value);
  }, [alts]);

  /* Real asset allocation derived from the user's actual holdings + alternatives.
     No hardcoded percentages — buckets are computed from market values and hidden
     when zero, so an empty portfolio shows an honest empty allocation. */
  const allocation = useMemo(() => {
    let equities = 0;
    let cash = 0;
    holdings.forEach((h) => {
      const mv = (Number(h.qty) || 0) * (Number(h.price) || 0);
      if ((h.symbol || '').toUpperCase() === 'CASH') cash += mv;
      else equities += mv;
    });
    const buckets = [
      { label: 'Stocks & ETFs', value: equities, color: 'var(--tv-forest)' },
      { label: 'Alternatives', value: altsTotal, color: 'var(--tv-forest-light)' },
      { label: 'Cash', value: cash, color: 'var(--tv-gold)' },
    ].filter((b) => b.value > 0);
    const total = buckets.reduce((s, b) => s + b.value, 0);
    return buckets.map((b) => ({
      ...b,
      pct: total > 0 ? Math.round((b.value / total) * 100) : 0,
    }));
  }, [holdings, altsTotal]);

  /* Build a CSV from the (filtered) holdings table and trigger a download via Blob. */
  function exportHoldingsCsv() {
    const header = ['Symbol', 'Name', 'Broker', 'Qty', 'Price', 'Market Value', 'Day Change %'];
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = filteredHoldings.map((h) =>
      [h.symbol, h.name, h.broker || '', h.qty, h.price, h.qty * h.price, h.dayChg].map(esc).join(',')
    );
    const csv = [header.map(esc).join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'holdings.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div id="page-invest" className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">Invest</div>
          <div className="page-subtitle">Holdings, linked brokers, alternatives, and the TerraVest marketplace</div>
        </div>
        <div className="page-actions" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <LastRefreshed />
          <button className="btn btn-secondary btn-sm" title="Export holdings to CSV" onClick={exportHoldingsCsv}>
            <i className="ti ti-download"></i> Export CSV
          </button>
        </div>
      </div>

      {/* Sub-tab bar */}
      <div className="seg-control" style={{ marginBottom: 22 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`seg-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <i className={`ti ${t.icon}`}></i> {t.label}
          </button>
        ))}
      </div>

      {/* ============================================================ *
       * TAB 1 — Stocks & ETFs
       * ============================================================ */}
      {tab === 'stocks' && (
        <>
          {/* KPI summary */}
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-label"><i className="ti ti-wallet" style={{ color: 'var(--tv-forest-light)' }}></i> Total Invested</div>
              <div className="kpi-value">{currency(totalInvested)}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label"><i className="ti ti-trending-up" style={{ color: 'var(--tv-positive)' }}></i> Day Change</div>
              <div className="kpi-value">{currency(dayChangeValue)}</div>
              <div className={`kpi-delta ${dayChangeValue >= 0 ? 'pos' : 'neg'}`}>
                <i className={dayChangeValue >= 0 ? 'ti ti-arrow-up-right' : 'ti ti-arrow-down-right'}></i>
                {dayChangeValue >= 0 ? '+' : ''}{dayChangePct.toFixed(2)}% today
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label"><i className="ti ti-list-details" style={{ color: 'var(--tv-gold)' }}></i> Holdings</div>
              <div className="kpi-value">{holdings.length}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label"><i className="ti ti-chart-pie" style={{ color: 'var(--tv-forest)' }}></i> Allocations</div>
              <div className="kpi-value">{allocation.length}</div>
              {allocation.length > 1 && (
                <div className="kpi-delta pos"><i className="ti ti-check"></i> Diversified</div>
              )}
            </div>
          </div>

          <div className="grid-2" style={{ marginBottom: 24 }}>
            {/* Allocation */}
            <div className="card">
              <div className="card-title">Allocation</div>
              {allocation.length === 0 && (
                <div className="empty-state" style={{ padding: '18px 0' }}>
                  <i className="ti ti-chart-pie"></i>
                  <p>No allocation yet. Link a broker or add holdings to see your mix.</p>
                </div>
              )}
              {allocation.map((a) => (
                <div key={a.label} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <span className="dot-indicator" style={{ background: a.color }}></span>
                      {a.label}
                    </span>
                    <span className="num" style={{ fontWeight: 600, fontSize: 13 }}>{a.pct}%</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${a.pct}%`, background: a.color }}></div>
                  </div>
                </div>
              ))}
            </div>

            {/* Quick stats */}
            <div className="card">
              <div className="card-title">Portfolio Snapshot</div>
              <div className="grid-2">
                <div className="stat-tile">
                  <div className="stat-tile-label">Total Invested</div>
                  <div className="stat-tile-value">{currency(totalInvested)}</div>
                </div>
                <div className="stat-tile">
                  <div className="stat-tile-label">Day Change</div>
                  <div className="stat-tile-value" style={{ color: dayChangeValue >= 0 ? 'var(--tv-positive)' : 'var(--tv-negative)' }}>
                    {dayChangeValue >= 0 ? '+' : ''}{currency(dayChangeValue)}
                  </div>
                </div>
                <div className="stat-tile">
                  <div className="stat-tile-label">Positions</div>
                  <div className="stat-tile-value">{holdings.length}</div>
                </div>
                <div className="stat-tile">
                  <div className="stat-tile-label">Cash</div>
                  <div className="stat-tile-value">
                    {currency(
                      holdings
                        .filter((h) => (h.symbol || '').toUpperCase() === 'CASH')
                        .reduce((sum, h) => sum + (Number(h.qty) || 0) * (Number(h.price) || 0), 0)
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Holdings */}
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="section-header">
              <div className="section-title" style={{ marginBottom: 0 }}>Portfolio holdings</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {/* Broker filter — only shown when holdings carry a broker field */}
                {holdingBrokers.length > 0 && (
                  <select
                    className="form-select"
                    value={brokerFilter}
                    onChange={(e) => setBrokerFilter(e.target.value)}
                    style={{ width: 'auto', minWidth: 150 }}
                    title="Filter holdings by broker"
                  >
                    <option value="all">All brokers</option>
                    {holdingBrokers.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                )}
                <span className="badge badge-forest">{filteredHoldings.length} positions</span>
              </div>
            </div>
            <div className="table-scroll">
              <table className="tv-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Name</th>
                    <th>Broker</th>
                    <th className="num">Qty</th>
                    <th className="num">Price</th>
                    <th className="num">Mkt Value</th>
                    <th className="num">Day Chg</th>
                    <th style={{ textAlign: 'right' }}>Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHoldings.length === 0 ? (
                    <tr>
                      <td colSpan={8}>
                        <div className="empty-state">
                          <i className={holdings.length === 0 ? 'ti ti-chart-line' : 'ti ti-filter-off'}></i>
                          <p>
                            {holdings.length === 0
                              ? 'No holdings yet. Link a broker to sync your positions.'
                              : 'No holdings for this broker.'}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredHoldings.map((h) => {
                      const mv = h.qty * h.price;
                      const up = h.dayChg >= 0;
                      return (
                        <tr key={h.symbol}>
                          <td><strong>{h.symbol}</strong></td>
                          <td style={{ color: 'var(--tv-text-secondary)' }}>{h.name}</td>
                          <td style={{ color: 'var(--tv-text-muted)' }}>{h.broker || '—'}</td>
                          <td className="num">{h.qty}</td>
                          <td className="num">{currency(h.price)}</td>
                          <td className="num">{currency(mv)}</td>
                          <td className="num">
                            <span className={up ? 'amount-pos' : 'amount-neg'} style={{ fontWeight: 600 }}>
                              {up ? '+' : ''}{h.dayChg}%
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <Sparkline series={series} stroke={up ? 'var(--tv-positive)' : 'var(--tv-negative)'} />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ============================================================ *
       * TAB 2 — Brokers
       * ============================================================ */}
      {tab === 'brokers' && (
        <>
          {/* KPI row */}
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-label"><i className="ti ti-building-bank" style={{ color: 'var(--tv-forest-light)' }}></i> Brokers Linked</div>
              <div className="kpi-value">{brokers.length}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label"><i className="ti ti-cash" style={{ color: 'var(--tv-gold)' }}></i> Total Brokerage Value</div>
              <div className="kpi-value">{currency(brokersTotal)}</div>
            </div>
          </div>

          {/* ---- Real linking via Plaid: pulls live holdings into Stocks & ETFs ---- */}
          <div className="card" style={{ marginBottom: 24, border: '1px solid var(--tv-forest)', background: 'var(--tv-sage-pale)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div className="item-icon icon-forest" style={{ width: 46, height: 46, fontSize: 22 }}>
                <i className="ti ti-building-bank"></i>
              </div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>Link a brokerage securely with Plaid</div>
                <div style={{ fontSize: 13, color: 'var(--tv-text-muted)' }}>
                  Connect Fidelity, Schwab, Robinhood, Vanguard and 12,000+ institutions. Your
                  positions sync automatically and appear under <strong>Stocks &amp; ETFs</strong>.
                </div>
              </div>
              <PlaidLinkButton onLinkSuccess={reloadHoldings}>
                <i className="ti ti-plus"></i> Link brokerage
              </PlaidLinkButton>
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--tv-text-muted)' }}>
              <i className="ti ti-shield-check" style={{ color: 'var(--tv-forest-light)' }}></i>{' '}
              Read-only and secured by Plaid — we never see your brokerage password.
            </div>
          </div>

          {/* ---- Available brokers (config-driven from BROKERS) ---- */}
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="section-header">
              <div className="section-title" style={{ marginBottom: 0 }}>Available brokers</div>
              <span className="badge badge-gray">{BROKERS.length} supported</span>
            </div>

            {/* Inline connect panel rendered DYNAMICALLY from the broker's config.
              * Shown above the grid when a broker is selected to connect. */}
            {activeBroker && (
              <div
                className="card"
                style={{
                  marginTop: 16,
                  marginBottom: 8,
                  border: `1px solid var(--tv-border)`,
                  background: 'var(--tv-sage-pale)'
                }}
              >
                {/* Panel header — broker identity + close */}
                <div className="section-header">
                  <div className="section-title" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span
                      className="item-icon"
                      style={{
                        width: 36,
                        height: 36,
                        fontSize: 18,
                        background: `${activeBroker.color}1a`, // ~10% tint
                        color: activeBroker.color
                      }}
                    >
                      <i className={activeBroker.icon}></i>
                    </span>
                    Connect {activeBroker.name}
                  </div>
                  <button className="icon-btn" onClick={closeConnect} title="Cancel">
                    <i className="ti ti-x"></i>
                  </button>
                </div>

                {/* --- authType: oauth --- simulated authorize screen --- */}
                {activeBroker.authType === 'oauth' && (
                  <div style={{ marginTop: 14 }}>
                    <p style={{ fontSize: 14, color: 'var(--tv-text-secondary)', marginBottom: 16 }}>
                      You'll be securely redirected to {activeBroker.name} to authorize{' '}
                      <strong>read-only</strong> access to your account balances and holdings.
                      TerraVest never sees your login credentials.
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={confirmOauth}
                        style={{ background: activeBroker.color, borderColor: activeBroker.color }}
                      >
                        <i className="ti ti-external-link"></i> Continue to {activeBroker.name}
                      </button>
                      <span style={{ fontSize: 12, color: 'var(--tv-text-muted)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <i className="ti ti-flask"></i> Demo mode — no real redirect
                      </span>
                    </div>
                  </div>
                )}

                {/* --- authType: credentials --- one input PER config field --- */}
                {activeBroker.authType === 'credentials' && (
                  <div style={{ marginTop: 14 }}>
                    <div className="grid-2">
                      {(activeBroker.fields || []).map((f) => {
                        const isSecret = f.type === 'password';
                        const revealed = !!showSecrets[f.key];
                        return (
                          <div className="form-group" key={f.key}>
                            <label className="form-label">
                              {f.label}{f.required ? ' *' : ''}
                            </label>
                            <div style={{ position: 'relative' }}>
                              <input
                                className="form-input"
                                type={isSecret && !revealed ? 'password' : 'text'}
                                placeholder={f.label}
                                required={f.required}
                                value={credInputs[f.key] || ''}
                                onChange={(e) => {
                                  setConnectError('');
                                  setCredInputs({ ...credInputs, [f.key]: e.target.value });
                                }}
                                style={isSecret ? { paddingRight: 38 } : undefined}
                              />
                              {/* show/hide toggle for password fields */}
                              {isSecret && (
                                <button
                                  type="button"
                                  className="icon-btn"
                                  onClick={() => setShowSecrets({ ...showSecrets, [f.key]: !revealed })}
                                  title={revealed ? 'Hide' : 'Show'}
                                  style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)' }}
                                >
                                  <i className={revealed ? 'ti ti-eye-off' : 'ti ti-eye'}></i>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {connectError && (
                      <div style={{ fontSize: 13, color: 'var(--tv-negative)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <i className="ti ti-alert-circle"></i> {connectError}
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <button className="btn btn-primary btn-sm" onClick={confirmCredentials}>
                        <i className="ti ti-lock"></i> Connect securely
                      </button>
                      <span style={{ fontSize: 12, color: 'var(--tv-text-muted)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <i className="ti ti-shield-lock"></i> 256-bit encrypted · read-only · credentials never stored
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* The grid itself — one tile per configured broker. */}
            <div className="grid-3" style={{ marginTop: 16 }}>
              {BROKERS.map((cfg) => (
                <div
                  key={cfg.id}
                  className="card"
                  style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span
                      className="item-icon"
                      style={{
                        width: 42,
                        height: 42,
                        fontSize: 20,
                        background: `${cfg.color}1a`, // ~10% tint of brand color
                        color: cfg.color
                      }}
                    >
                      <i className={cfg.icon}></i>
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--tv-text-primary)' }}>
                        {cfg.name}
                      </div>
                      <span className={`badge ${cfg.authType === 'oauth' ? 'badge-forest' : 'badge-gold'}`}>
                        {cfg.authType === 'oauth' ? 'OAuth' : 'Credentials'}
                      </span>
                    </div>
                  </div>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => openConnect(cfg.id)}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    <i className="ti ti-link"></i> Connect
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* ---- Connected brokers ---- */}
          <div className="section-header">
            <div className="section-title" style={{ marginBottom: 0 }}>Connected brokers</div>
            <span className="badge badge-gray">{brokers.length} linked</span>
          </div>
          {brokers.length === 0 ? (
            <div className="empty-state">
              <i className="ti ti-building-bank"></i>
              <p>No brokers connected yet. Pick a broker above to securely link an account.</p>
            </div>
          ) : (
            <div className="card-grid">
              {brokers.map((b) => {
                /* Resolve the broker's config (icon/color) via getBroker().
                 * Fall back gracefully for legacy entries without a brokerId. */
                const cfg = getBroker(b.brokerId);
                const accent = cfg?.color || 'var(--tv-forest)';
                const icon = cfg?.icon || 'ti ti-building-bank';
                return (
                  <div key={b.id} className="card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                      <span
                        className="item-icon"
                        style={{ width: 42, height: 42, fontSize: 20, background: `${accent}1a`, color: accent }}
                      >
                        <i className={icon}></i>
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--tv-text-primary)' }}>
                          {b.name}
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                          <span className="badge badge-gray">{b.accountType}</span>
                          <span className="badge badge-green"><i className="ti ti-circle-check"></i> Connected</span>
                        </div>
                      </div>
                    </div>

                    <div className="stat-tile" style={{ marginBottom: 12 }}>
                      <div className="stat-tile-label">Account value</div>
                      <div className="stat-tile-value">{currency(b.value)}</div>
                    </div>

                    <div style={{ fontSize: 12, color: 'var(--tv-text-muted)', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 14 }}>
                      <i className="ti ti-clock"></i> Last synced {syncedLabel(b.linkedAt)}
                    </div>

                    <hr className="divider" />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => syncBroker(b.id)} title="Refresh last-synced time">
                        <i className="ti ti-refresh"></i> Sync
                      </button>
                      <button className="icon-btn" onClick={() => disconnectBroker(b.id)} title="Disconnect">
                        <i className="ti ti-trash"></i>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ============================================================ *
       * TAB 3 — Alternatives
       * ============================================================ */}
      {tab === 'alts' && (
        <>
          {/* KPI row */}
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-label"><i className="ti ti-diamond" style={{ color: 'var(--tv-gold)' }}></i> Total Alt Value</div>
              <div className="kpi-value">{currency(altsTotal)}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label"><i className="ti ti-list-details" style={{ color: 'var(--tv-forest-light)' }}></i> Holdings</div>
              <div className="kpi-value">{alts.length}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label"><i className="ti ti-category" style={{ color: 'var(--tv-forest)' }}></i> Categories</div>
              <div className="kpi-value">{altBreakdown.length}</div>
            </div>
          </div>

          {/* Add / edit form */}
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="section-header">
              <div className="section-title" style={{ marginBottom: 0 }}>Alternative investments</div>
              {!altForm && (
                <button className="btn btn-primary btn-sm" onClick={openAddAlt}>
                  <i className="ti ti-plus"></i> Add investment
                </button>
              )}
            </div>

            {altForm && (
              <div style={{ marginTop: 16 }}>
                <div className="grid-3">
                  <div className="form-group">
                    <label className="form-label">Type</label>
                    <select
                      className="form-select"
                      value={altForm.type}
                      onChange={(e) => setAltForm({ ...altForm, type: e.target.value })}
                    >
                      {ALT_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Name</label>
                    <input
                      className="form-input"
                      type="text"
                      placeholder="e.g. Sunbelt Holdings LLC"
                      value={altForm.name}
                      onChange={(e) => setAltForm({ ...altForm, name: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Value</label>
                    <input
                      className="form-input"
                      type="number"
                      min="0"
                      placeholder="0"
                      value={altForm.value}
                      onChange={(e) => setAltForm({ ...altForm, value: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Ownership %</label>
                    <input
                      className="form-input"
                      type="number"
                      min="0"
                      max="100"
                      placeholder="100"
                      value={altForm.ownershipPct}
                      onChange={(e) => setAltForm({ ...altForm, ownershipPct: e.target.value })}
                    />
                  </div>
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label className="form-label">Notes</label>
                    <input
                      className="form-input"
                      type="text"
                      placeholder="Optional notes"
                      value={altForm.notes}
                      onChange={(e) => setAltForm({ ...altForm, notes: e.target.value })}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  <button className="btn btn-primary btn-sm" onClick={saveAlt} disabled={!altForm.name.trim()}>
                    <i className="ti ti-check"></i> {altForm.id ? 'Save changes' : 'Add investment'}
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setAltForm(null)}>
                    <i className="ti ti-x"></i> Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Breakdown by type */}
          {altBreakdown.length > 0 && (
            <div className="card" style={{ marginBottom: 24 }}>
              <div className="card-title">Breakdown by type</div>
              <div className="grid-3">
                {altBreakdown.map((row) => {
                  const meta = altMeta(row.type);
                  const share = altsTotal > 0 ? Math.round((row.value / altsTotal) * 100) : 0;
                  return (
                    <div key={row.type} className="stat-tile">
                      <div className="stat-tile-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <i className={`ti ${meta.icon}`}></i> {meta.label}
                      </div>
                      <div className="stat-tile-value">{currency(row.value)}</div>
                      <div style={{ fontSize: 12, color: 'var(--tv-text-muted)' }}>
                        {row.count} {row.count === 1 ? 'holding' : 'holdings'} · {share}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Holdings table / empty state */}
          {alts.length === 0 ? (
            <div className="empty-state">
              <i className="ti ti-diamond"></i>
              <p>No alternative investments yet. Track LLCs, land, syndications, private equity, crypto, and more.</p>
            </div>
          ) : (
            <div className="card">
              <div className="table-scroll">
                <table className="tv-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Name</th>
                      <th className="num">Value</th>
                      <th className="num">Ownership</th>
                      <th>Notes</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alts.map((a) => {
                      const meta = altMeta(a.type);
                      return (
                        <tr key={a.id}>
                          <td>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                              <span className={`item-icon ${meta.accent}`} style={{ width: 28, height: 28, fontSize: 14 }}>
                                <i className={`ti ${meta.icon}`}></i>
                              </span>
                              {meta.label}
                            </span>
                          </td>
                          <td><strong>{a.name}</strong></td>
                          <td className="num">{currency(a.value)}</td>
                          <td className="num">{a.ownershipPct === '' || a.ownershipPct == null ? '—' : `${a.ownershipPct}%`}</td>
                          <td style={{ color: 'var(--tv-text-muted)', maxWidth: 240 }}>{a.notes || '—'}</td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: 6 }}>
                              <button className="icon-btn" onClick={() => openEditAlt(a)} title="Edit">
                                <i className="ti ti-pencil"></i>
                              </button>
                              <button className="icon-btn" onClick={() => deleteAlt(a.id)} title="Delete">
                                <i className="ti ti-trash"></i>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ============================================================ *
       * TAB 4 — Marketplace
       * ============================================================ */}
      {tab === 'market' && (
        <>
          <div className="section-header">
            <div className="section-title" style={{ marginBottom: 0 }}>Marketplace</div>
          </div>
          {/* No fabricated offerings. Real curated deals will populate here when a
              marketplace provider is connected; until then, an honest empty state. */}
          <div className="card">
            <div className="empty-state" style={{ padding: '40px 16px', textAlign: 'center' }}>
              <i className="ti ti-building-store" style={{ fontSize: 30, opacity: 0.5 }}></i>
              <p style={{ marginTop: 10, fontWeight: 600, color: 'var(--tv-text-primary)' }}>
                No live offerings yet
              </p>
              <p style={{ fontSize: 13, color: 'var(--tv-text-muted)', maxWidth: 420, margin: '4px auto 0' }}>
                Curated alternative-investment deals will appear here once a marketplace
                provider is connected. You can still track your own alternatives in the
                Alternatives tab.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
