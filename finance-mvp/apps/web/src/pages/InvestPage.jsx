import React, { useMemo, useState, useEffect } from 'react';
import { currency } from '../utils/format';
import { api } from '../api';
import Sparkline from '../components/Sparkline';
import LastRefreshed from '../components/LastRefreshed';
import PlaidLinkButton from '../components/PlaidLinkButton';

/* ------------------------------------------------------------------ *
 * Static data / fallbacks
 * ------------------------------------------------------------------ */

/* Holdings start empty and are populated by real synced data from Plaid. */
const EMPTY_HOLDINGS = [];

/* Sub-tabs for the page. */
const TABS = [
  { id: 'stocks', label: 'Stocks & ETFs', icon: 'ti-chart-line' },
  { id: 'brokers', label: 'Brokers', icon: 'ti-building-bank' },
  { id: 'alts', label: 'Alternatives', icon: 'ti-diamond' },
  { id: 'market', label: 'Marketplace', icon: 'ti-map-2' }
];

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

/* ================================================================== *
 * Page
 * ================================================================== */

/* Format a Plaid investment subtype for display: "roth ira" -> "Roth IRA",
   "brokerage" -> "Brokerage", "sep ira" -> "SEP IRA", "401k" -> "401k". */
function fmtSubtype(s) {
  if (!s) return '';
  return String(s).split(/[\s_]+/).map((w) => {
    if (/^\d/.test(w)) return w;                 // 401k, 403b, 529
    if (w.length <= 3) return w.toUpperCase();   // ira, sep, isa, hsa
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ');
}

export default function InvestPage({ snapshot, accounts = [] }) {
  const totalInvested = snapshot?.components?.investments ?? 0;
  const series = snapshot?.series || null;

  /* Active sub-tab */
  const [tab, setTab] = useState('stocks');

  /* Marketplace request state */
  const [requested, setRequested] = useState({});

  /* Stocks tab — broker filter */
  const [brokerFilter, setBrokerFilter] = useState('all');

  /* Server-persisted alternative investments — start empty; the user adds their own. */
  const [alts, setAlts] = useState([]);

  /* Real brokerage positions + trade activity synced from Plaid Investments (via the
     aggregation service). Holdings fall back to snapshot.holdings if none yet. */
  const [syncedHoldings, setSyncedHoldings] = useState([]);
  const [activity, setActivity] = useState([]);
  const holdings = syncedHoldings.length ? syncedHoldings : (snapshot?.holdings || EMPTY_HOLDINGS);

  /* Re-pull brokerage positions + activity (after a Plaid link or a manual refresh). */
  const reloadHoldings = async () => {
    try {
      const [h, act] = await Promise.allSettled([
        api.getHoldings(),
        api.getInvestmentTransactions(),
      ]);
      if (h.status === 'fulfilled') setSyncedHoldings(Array.isArray(h.value) ? h.value : []);
      if (act.status === 'fulfilled') setActivity(Array.isArray(act.value) ? act.value : []);
    } catch { /* keep what we have */ }
  };

  /* Load the user's alternatives + synced holdings + brokerage activity on mount. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [a, h, act] = await Promise.allSettled([
        api.getAltInvestments(),
        api.getHoldings(),
        api.getInvestmentTransactions(),
      ]);
      if (cancelled) return;
      if (a.status === 'fulfilled') setAlts(Array.isArray(a.value) ? a.value : []);
      if (h.status === 'fulfilled') setSyncedHoldings(Array.isArray(h.value) ? h.value : []);
      if (act.status === 'fulfilled') setActivity(Array.isArray(act.value) ? act.value : []);
    })();
    return () => { cancelled = true; };
  }, []);

  /* Linked brokerages are derived from real synced holdings (grouped by broker),
     so there's no separate "connect" step — linking happens via Plaid above. */
  // Linked brokerage ACCOUNTS come from the user's investment-type accounts — so each
  // account shows with its details even before (or without) any synced positions, which
  // is the common case right after linking or when the Investments product is still
  // populating. Enrich with a per-broker position count from holdings when available.
  const brokerAccounts = useMemo(() => {
    const posByBroker = {};
    for (const h of holdings) {
      const k = (h.broker || '').trim();
      if (k) posByBroker[k] = (posByBroker[k] || 0) + 1;
    }
    return (accounts || [])
      .filter((a) => (a.type || '').toLowerCase() === 'investment')
      .map((a) => {
        const institution = a.officialName || '';
        return {
          id: a.id,
          name: a.name || institution || 'Brokerage account',
          institution,
          subtype: a.subtype || '',
          mask: a.mask || '',
          value: Number(a.currentBalance) || 0,
          positions: posByBroker[institution] || posByBroker[a.name] || 0,
        };
      })
      .sort((x, y) => y.value - x.value);
  }, [accounts, holdings]);

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

  const brokersTotal = brokerAccounts.reduce((sum, b) => sum + (Number(b.value) || 0), 0);
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

          {/* ---- Brokerage activity (synced trade history from Plaid Investments) ---- */}
          {activity.length > 0 && (
            <div className="card" style={{ marginTop: 20 }}>
              <div className="section-header" style={{ marginBottom: 4 }}>
                <div className="section-title" style={{ marginBottom: 0 }}>Recent activity</div>
                <span style={{ fontSize: 12.5, color: 'var(--tv-text-muted)' }}>{activity.length} transactions</span>
              </div>
              <div className="table-scroll">
                <table className="tv-table" style={{ marginTop: 12 }}>
                  <thead>
                    <tr>
                      <th>Date</th><th>Activity</th><th>Security</th>
                      <th className="num">Qty</th><th className="num">Price</th><th className="num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.slice(0, 100).map((t, i) => {
                      const raw = (t.subtype || t.type || '').replace(/_/g, ' ');
                      const label = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : '—';
                      const isBuy = (t.type || '').toLowerCase() === 'buy';
                      const isSell = (t.type || '').toLowerCase() === 'sell';
                      const badgeCls = isBuy ? 'badge-green' : isSell ? 'badge-red' : 'badge-gray';
                      const amt = Number(t.amount) || 0;
                      return (
                        <tr key={`${t.date}-${i}`}>
                          <td style={{ whiteSpace: 'nowrap', color: 'var(--tv-text-muted)' }}>{t.date}</td>
                          <td><span className={`badge ${badgeCls}`}>{label}</span></td>
                          <td>
                            <strong>{t.symbol || '—'}</strong>
                            {t.name ? <span style={{ color: 'var(--tv-text-muted)' }}> · {t.name}</span> : null}
                            {t.broker ? <div style={{ fontSize: 11.5, color: 'var(--tv-text-muted)' }}>{t.broker}</div> : null}
                          </td>
                          <td className="num">{t.quantity != null ? Number(t.quantity) : '—'}</td>
                          <td className="num">{t.price != null ? currency(t.price) : '—'}</td>
                          <td className="num" style={{ fontWeight: 600 }}>{currency(amt)}</td>
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
       * TAB 2 — Brokers
       * ============================================================ */}
      {tab === 'brokers' && (
        <>
          {/* KPI row */}
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-label"><i className="ti ti-building-bank" style={{ color: 'var(--tv-forest-light)' }}></i> Accounts linked</div>
              <div className="kpi-value">{brokerAccounts.length}</div>
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

          {/* ---- Your brokerage accounts (the linked investment accounts) ---- */}
          <div className="section-header">
            <div className="section-title" style={{ marginBottom: 0 }}>Your brokerage accounts</div>
            <span className="badge badge-gray">{brokerAccounts.length} linked</span>
          </div>
          {brokerAccounts.length === 0 ? (
            <div className="empty-state">
              <i className="ti ti-building-bank"></i>
              <p>No brokerage accounts linked yet. Use <strong>Link brokerage</strong> above to securely connect one with Plaid — each linked account appears here with its details.</p>
            </div>
          ) : (
            <div className="card-grid">
              {brokerAccounts.map((b) => (
                <div key={b.id} className="card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                    <span
                      className="item-icon icon-forest"
                      style={{ width: 42, height: 42, fontSize: 20 }}
                    >
                      <i className="ti ti-building-bank"></i>
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--tv-text-primary)' }}>
                        {b.name}
                        {b.mask ? <span style={{ color: 'var(--tv-text-muted)', fontSize: 13, fontWeight: 400 }}> ····{b.mask}</span> : null}
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                        {b.subtype ? <span className="badge badge-forest">{fmtSubtype(b.subtype)}</span> : null}
                        <span className="badge badge-green"><i className="ti ti-circle-check"></i> Linked via Plaid</span>
                      </div>
                      {b.institution ? (
                        <div style={{ fontSize: 12, color: 'var(--tv-text-muted)', marginTop: 4 }}>{b.institution}</div>
                      ) : null}
                    </div>
                  </div>

                  <div className="stat-tile" style={{ marginBottom: 12 }}>
                    <div className="stat-tile-label">Account value</div>
                    <div className="stat-tile-value">{currency(b.value)}</div>
                  </div>

                  <div style={{ fontSize: 12, color: 'var(--tv-text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <i className="ti ti-list-details"></i>
                    {b.positions > 0
                      ? `${b.positions} position${b.positions === 1 ? '' : 's'}`
                      : 'Positions sync shortly after linking'}
                  </div>
                </div>
              ))}
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
