import { useState } from 'react';
import { currency } from '../utils/format';

/* ------------------------------------------------------------------ *
 * Self-contained mock data
 * ------------------------------------------------------------------ */

// Properties the investor already co-owns through fractional LLCs.
const HOLDINGS = [
  {
    id: 'h1',
    name: 'Cedar Ridge Farmland LLC',
    address: '2,400 ac · Story County, Iowa',
    icon: 'ti ti-plant-2',
    shares: 120,
    totalShares: 5000,
    invested: 24000,
    currentValue: 28850,
  },
  {
    id: 'h2',
    name: 'Harborview Apartments LLC',
    address: '88-unit multifamily · Tampa, FL',
    icon: 'ti ti-building-community',
    shares: 60,
    totalShares: 4000,
    invested: 30000,
    currentValue: 31650,
  },
  {
    id: 'h3',
    name: 'Timberline Forest Tract LLC',
    address: '1,150 ac managed timber · Bend, OR',
    icon: 'ti ti-trees',
    shares: 40,
    totalShares: 6000,
    invested: 10000,
    currentValue: 11420,
  },
];

// Open offerings on the marketplace.
const OFFERINGS = [
  {
    id: 'o1',
    name: 'Magnolia Grove Build-to-Rent LLC',
    address: '36-home BTR community · Austin, TX',
    icon: 'ti ti-home-2',
    risk: 'Medium',
    targetReturn: '11.4% IRR',
    minInvestment: 5000,
    raiseTarget: 4200000,
    raised: 2940000,
  },
  {
    id: 'o2',
    name: 'Prairie Wind Cropland LLC',
    address: '1,800 ac row crop · Champaign, IL',
    icon: 'ti ti-plant-2',
    risk: 'Low',
    targetReturn: '7.8% IRR',
    minInvestment: 2500,
    raiseTarget: 3100000,
    raised: 2635000,
  },
  {
    id: 'o3',
    name: 'Beacon Street Mixed-Use LLC',
    address: 'Retail + 24 lofts · Charleston, SC',
    icon: 'ti ti-building-store',
    risk: 'Medium',
    targetReturn: '13.2% IRR',
    minInvestment: 10000,
    raiseTarget: 6800000,
    raised: 1564000,
  },
  {
    id: 'o4',
    name: 'Sierra Solar Land Lease LLC',
    address: '640 ac utility lease · Bakersfield, CA',
    icon: 'ti ti-sun-electricity',
    risk: 'Low',
    targetReturn: '6.5% IRR',
    minInvestment: 1000,
    raiseTarget: 2400000,
    raised: 2280000,
  },
];

function pctOf(part, whole) {
  if (!whole) return 0;
  return (part / whole) * 100;
}

export default function FractionalLLCPage() {
  const [tab, setTab] = useState('holdings'); // 'holdings' | 'marketplace'
  const [invested, setInvested] = useState({}); // offeringId -> true once "invested"
  const [showHow, setShowHow] = useState(false); // "How it works" explainer panel

  // Portfolio summary derived from holdings.
  const totalInvested = HOLDINGS.reduce((s, h) => s + h.invested, 0);
  const currentValue = HOLDINGS.reduce((s, h) => s + h.currentValue, 0);
  const totalReturn = currentValue - totalInvested;
  const returnPct = pctOf(totalReturn, totalInvested);

  return (
    <div id="page-fractional-llc" className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">Fractional LLC</div>
          <div className="page-subtitle">
            Co-invest in land &amp; property through fractional ownership
          </div>
        </div>
        <div className="page-actions">
          <button
            className={`btn btn-secondary btn-sm ${showHow ? 'active' : ''}`}
            title="How fractional LLC ownership works"
            aria-expanded={showHow}
            onClick={() => setShowHow((v) => !v)}
          >
            <i className="ti ti-help-circle"></i> How it works
          </button>
          <button className="btn btn-gold btn-sm" onClick={() => setTab('marketplace')}>
            <i className="ti ti-search"></i> Browse deals
          </button>
        </div>
      </div>

      {showHow ? (
        <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--tv-gold)' }}>
          <div className="card-title">
            <i className="ti ti-help-circle" style={{ color: 'var(--tv-gold)' }}></i> How fractional LLC ownership works
          </div>
          <ol style={{ margin: '8px 0 0', paddingLeft: 18, display: 'grid', gap: 8, color: 'var(--tv-text-secondary)', fontSize: 13.5, lineHeight: 1.55 }}>
            <li><strong>Pick a deal.</strong> Each property is held in a single-purpose LLC. Browse open offerings and review the terms, projected returns, and risk factors.</li>
            <li><strong>Buy fractional shares.</strong> Invest from the listed minimum. You receive membership units proportional to your investment — no need to buy the whole property.</li>
            <li><strong>Earn passively.</strong> Rental income and appreciation are distributed to members pro-rata. Track value and distributions right here in your portfolio.</li>
            <li><strong>Exit when eligible.</strong> Shares can be sold back or transferred at the next liquidity window, subject to the LLC operating agreement.</li>
          </ol>
          <div className="setting-help" style={{ marginTop: 10 }}>
            <i className="ti ti-info-circle"></i> Illustrative only — not investment advice. Review each offering's documents before investing.
          </div>
        </div>
      ) : null}

      {/* Portfolio summary */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">
            <i className="ti ti-wallet" style={{ color: 'var(--tv-forest)' }}></i> Total Invested
          </div>
          <div className="kpi-value">{currency(totalInvested)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">
            <i className="ti ti-chart-pie" style={{ color: 'var(--tv-forest)' }}></i> Current Value
          </div>
          <div className="kpi-value">{currency(currentValue)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">
            <i className="ti ti-trending-up" style={{ color: 'var(--tv-positive)' }}></i> Total Return
          </div>
          <div className="kpi-value">{currency(totalReturn)}</div>
          <div className="kpi-delta pos">
            <i className="ti ti-arrow-up-right"></i> +{returnPct.toFixed(1)}% all-time
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">
            <i className="ti ti-stack-2" style={{ color: 'var(--tv-forest)' }}></i> Active Holdings
          </div>
          <div className="kpi-value">{HOLDINGS.length}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <div
          className={`tab ${tab === 'holdings' ? 'active' : ''}`}
          onClick={() => setTab('holdings')}
        >
          My Holdings
        </div>
        <div
          className={`tab ${tab === 'marketplace' ? 'active' : ''}`}
          onClick={() => setTab('marketplace')}
        >
          Marketplace
        </div>
      </div>

      {tab === 'holdings' ? (
        <HoldingsView />
      ) : (
        <MarketplaceView invested={invested} setInvested={setInvested} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * My Holdings
 * ------------------------------------------------------------------ */
function HoldingsView() {
  if (HOLDINGS.length === 0) {
    return (
      <div className="card">
        <div className="empty-state">
          <i className="ti ti-building-estate"></i>
          <p>You don't own any fractional LLC positions yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid-2">
      {HOLDINGS.map((h) => {
        const ret = h.currentValue - h.invested;
        const retPct = pctOf(ret, h.invested);
        const ownPct = pctOf(h.shares, h.totalShares);
        const positive = ret >= 0;
        return (
          <div className="property-card" key={h.id}>
            <div className="property-header">
              <div className="property-icon">
                <i className={h.icon}></i>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="property-address">{h.name}</div>
                <div
                  style={{
                    fontSize: '12px',
                    color: 'var(--tv-text-muted)',
                    marginTop: '3px',
                  }}
                >
                  {h.address}
                </div>
              </div>
              <span className={`badge ${positive ? 'badge-green' : 'badge-red'}`}>
                <i className={positive ? 'ti ti-arrow-up-right' : 'ti ti-arrow-down-right'}></i>
                {positive ? '+' : ''}{retPct.toFixed(1)}%
              </span>
            </div>

            <div className="property-meta-row">
              <div className="property-stat">
                <div className="property-stat-label">Invested</div>
                <div className="property-stat-value">{currency(h.invested)}</div>
              </div>
              <div className="property-stat">
                <div className="property-stat-label">Current Value</div>
                <div className="property-stat-value">{currency(h.currentValue)}</div>
              </div>
              <div className="property-stat">
                <div className="property-stat-label">Return</div>
                <div
                  className="property-stat-value"
                  style={{ color: positive ? 'var(--tv-positive)' : 'var(--tv-negative)' }}
                >
                  {positive ? '+' : ''}{currency(ret)}
                </div>
              </div>
            </div>

            <div style={{ padding: '0 18px 18px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '12px',
                  color: 'var(--tv-text-muted)',
                  marginBottom: '2px',
                }}
              >
                <span>
                  {h.shares.toLocaleString()} of {h.totalShares.toLocaleString()} shares
                </span>
                <span style={{ fontWeight: 600, color: 'var(--tv-text-primary)' }}>
                  {ownPct.toFixed(2)}% owned
                </span>
              </div>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${ownPct}%`, background: 'var(--tv-forest)' }}
                ></div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Marketplace
 * ------------------------------------------------------------------ */
function MarketplaceView({ invested, setInvested }) {
  return (
    <div>
      <div className="section-header">
        <div className="section-title">Open offerings</div>
        <span className="badge badge-forest">
          <i className="ti ti-circle-dot"></i> {OFFERINGS.length} live deals
        </span>
      </div>

      <div className="card-grid">
        {OFFERINGS.map((o) => {
          const fundedPct = pctOf(o.raised, o.raiseTarget);
          const isLow = o.risk === 'Low';
          const done = !!invested[o.id];
          return (
            <div className="property-card" key={o.id}>
              <div className="property-header">
                <div className="property-icon">
                  <i className={o.icon}></i>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="property-address">{o.name}</div>
                  <div
                    style={{
                      fontSize: '12px',
                      color: 'var(--tv-text-muted)',
                      marginTop: '3px',
                    }}
                  >
                    {o.address}
                  </div>
                </div>
              </div>

              <div style={{ padding: '14px 18px 0', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <span className={`badge ${isLow ? 'badge-green' : 'badge-amber'}`}>
                  <i className="ti ti-shield-half"></i> {o.risk} risk
                </span>
                <span className="badge badge-gold">
                  <i className="ti ti-target-arrow"></i> {o.targetReturn}
                </span>
              </div>

              <div className="property-meta-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="property-stat">
                  <div className="property-stat-label">Minimum</div>
                  <div className="property-stat-value">{currency(o.minInvestment)}</div>
                </div>
                <div className="property-stat">
                  <div className="property-stat-label">Total Raise</div>
                  <div className="property-stat-value">{currency(o.raiseTarget)}</div>
                </div>
              </div>

              <div style={{ padding: '0 18px 14px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '12px',
                    color: 'var(--tv-text-muted)',
                    marginBottom: '2px',
                  }}
                >
                  <span>{currency(o.raised)} raised</span>
                  <span style={{ fontWeight: 600, color: 'var(--tv-forest)' }}>
                    {fundedPct.toFixed(0)}% funded
                  </span>
                </div>
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${fundedPct}%`, background: 'var(--tv-gold)' }}
                  ></div>
                </div>
              </div>

              <div style={{ padding: '0 18px 18px' }}>
                {done ? (
                  <div
                    className="badge badge-green"
                    style={{ width: '100%', justifyContent: 'center', padding: '8px' }}
                  >
                    <i className="ti ti-circle-check"></i> Investment request submitted
                  </div>
                ) : (
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => setInvested((prev) => ({ ...prev, [o.id]: true }))}
                  >
                    <i className="ti ti-coin"></i> Invest
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
