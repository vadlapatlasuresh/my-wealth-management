import React, { useState } from 'react';
import { currency } from '../utils/format'; // Assuming currency formatter is available

const INITIAL_DOCS = [
  { id: 'ppm', name: 'Private Placement Memo', acknowledged: true },
  { id: 'oa', name: 'Operating Agreement', acknowledged: true },
  { id: 'sub', name: 'Subscription Agreement', acknowledged: false },
  { id: 'terms', name: 'Summary of Terms', acknowledged: false },
  { id: 'risk', name: 'Risk Factors', acknowledged: false },
  { id: 'fin', name: 'Financial Projections', acknowledged: false },
  { id: 'tax', name: 'Tax Disclosures', acknowledged: false },
];

export default function DealRoomPage() {
  const [docs, setDocs] = useState(INITIAL_DOCS);
  const [watchlisted, setWatchlisted] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  const completed = docs.filter((d) => d.acknowledged).length;
  const total = docs.length;
  const allAcknowledged = completed === total;

  const acknowledgeDoc = (id) =>
    setDocs((prev) =>
      prev.map((d) => (d.id === id ? { ...d, acknowledged: true } : d))
    );

  const toggleWatchlist = () => setWatchlisted((w) => !w);

  const subscribe = () => {
    if (allAcknowledged) setSubscribed(true);
  };

  // Donut math: full circumference for r=26 is ~163.4
  const circumference = 2 * Math.PI * 26;
  const filled = (completed / total) * circumference;

  return (
    <div id="page-dealroom" className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">Deal Room</div>
          <div className="page-subtitle">Willow Creek Land LLC — Opportunity detail</div>
        </div>
        <div className="page-actions">
          <button
            className={`btn btn-sm ${watchlisted ? 'btn-gold' : 'btn-secondary'}`}
            onClick={toggleWatchlist}
          >
            <i className={watchlisted ? 'ti ti-bookmark-filled' : 'ti ti-bookmark'}></i>{' '}
            {watchlisted ? 'On watchlist' : 'Watchlist'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={toggleWatchlist}>
            <i className="ti ti-arrow-left"></i> Marketplace
          </button>
        </div>
      </div>

      <div className="grid-2">
        {/* Main content */}
        <div className="col-span-2" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '16px' }}>
          <div>
            {/* Header card */}
            <div className="card" style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                <div style={{ width: '64px', height: '64px', background: 'var(--tv-sage-pale)', borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '30px', color: 'var(--tv-forest)', flexShrink: 0 }}>🌲</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '22px' }}>Willow Creek Land LLC</div>
                    <span className="badge badge-forest">Core Plus</span>
                    <span className="badge badge-gray">Real Estate</span>
                    <span className="badge badge-gray">Land Development</span>
                    {watchlisted && <span className="badge badge-gold"><i className="ti ti-bookmark-filled"></i> Watchlisted</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--tv-text-muted)', marginBottom: '12px' }}><i className="ti ti-map-pin"></i> Bozeman, Montana</div>
                  <div style={{ display: 'flex', gap: '24px' }}>
                    <div><div style={{ fontSize: '11.5px', color: 'var(--tv-text-muted)', fontWeight: '500' }}>Minimum Investment</div><div style={{ fontFamily: 'var(--font-display)', fontSize: '22px', color: 'var(--tv-forest)' }}>{currency(25000)}</div><div style={{ fontSize: '11.5px', color: 'var(--tv-text-muted)' }}>Per Investor</div></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Overview */}
            <div className="card" style={{ marginBottom: '16px' }}>
              <div className="section-title">Overview</div>
              <p style={{ fontSize: '13.5px', color: 'var(--tv-text-secondary)', lineHeight: '1.7' }}>Willow Creek Land LLC is a purpose-built entity formed to acquire and develop 120 acres of entitled residential land in Bozeman, Montana. The project is well-positioned in a high-growth submarket with strong demand drivers, limited inventory, and a clear path to value creation.</p>
            </div>

            {/* Key Terms */}
            <div className="card" style={{ marginBottom: '16px' }}>
              <div className="section-title">Key terms</div>
              <div className="grid-3" style={{ gap: '16px' }}>
                <div><div style={{ fontSize: '11.5px', color: 'var(--tv-text-muted)', marginBottom: '3px', fontWeight: '500' }}>Investment Type</div><div style={{ fontWeight: '600' }}>Equity</div></div>
                <div><div style={{ fontSize: '11.5px', color: 'var(--tv-text-muted)', marginBottom: '3px', fontWeight: '500' }}>Target IRR</div><div style={{ fontWeight: '600', color: 'var(--tv-positive)' }}>18–22%</div></div>
                <div><div style={{ fontSize: '11.5px', color: 'var(--tv-text-muted)', marginBottom: '3px', fontWeight: '500' }}>Investment Structure</div><div style={{ fontWeight: '600' }}>LLC Membership</div></div>
                <div><div style={{ fontSize: '11.5px', color: 'var(--tv-text-muted)', marginBottom: '3px', fontWeight: '500' }}>Target Hold Period</div><div style={{ fontWeight: '600' }}>36–48 months</div></div>
                <div><div style={{ fontSize: '11.5px', color: 'var(--tv-text-muted)', marginBottom: '3px', fontWeight: '500' }}>Distributions</div><div style={{ fontWeight: '600' }}>Quarterly</div></div>
                <div><div style={{ fontSize: '11.5px', color: 'var(--tv-text-muted)', marginBottom: '3px', fontWeight: '500' }}>Preferred Return</div><div style={{ fontWeight: '600' }}>8.0%</div></div>
              </div>
            </div>

            {/* Fee Structure */}
            <div className="card" style={{ marginBottom: '16px', background: 'var(--tv-bg)' }}>
              <div className="section-title">Fee structure</div>
              <div className="grid-3" style={{ gap: '12px' }}>
                <div style={{ background: 'white', borderRadius: 'var(--radius-md)', padding: '12px', border: '1px solid var(--tv-border)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--tv-text-muted)', marginBottom: '3px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.05em' }}>Acquisition Fee</div>
                  <div style={{ fontWeight: '600' }}>2.0%</div>
                  <div style={{ fontSize: '11.5px', color: 'var(--tv-text-muted)' }}>of Purchase Price</div>
                </div>
                <div style={{ background: 'white', borderRadius: 'var(--radius-md)', padding: '12px', border: '1px solid var(--tv-border)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--tv-text-muted)', marginBottom: '3px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.05em' }}>Asset Mgmt Fee</div>
                  <div style={{ fontWeight: '600' }}>1.5%</div>
                  <div style={{ fontSize: '11.5px', color: 'var(--tv-text-muted)' }}>of Gross Asset Value</div>
                </div>
                <div style={{ background: 'white', borderRadius: 'var(--radius-md)', padding: '12px', border: '1px solid var(--tv-border)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--tv-text-muted)', marginBottom: '3px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.05em' }}>Performance Fee</div>
                  <div style={{ fontWeight: '600' }}>20.0%</div>
                  <div style={{ fontSize: '11.5px', color: 'var(--tv-text-muted)' }}>above 8% pref. return</div>
                </div>
              </div>
            </div>

            {/* Risk Factors */}
            <div className="card" style={{ borderLeft: '4px solid var(--tv-negative)' }}>
              <div className="section-title">Risk factors</div>
              <ul style={{ fontSize: '13px', color: 'var(--tv-text-secondary)', lineHeight: '1.9', paddingLeft: '18px' }}>
                <li>Real estate investments are illiquid and there is no guarantee of a market for interests.</li>
                <li>The project may not achieve expected returns and investors may lose some or all of their investment.</li>
                <li>Market conditions, regulatory changes, and other factors may materially impact results.</li>
              </ul>
            </div>
          </div>

          {/* Document Checklist */}
          <div>
            <div className="card" style={{ position: 'sticky', top: '0' }}>
              <div className="section-title">Document checklist</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
                <svg width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="none" stroke="var(--tv-border)" strokeWidth="7"/><circle cx="32" cy="32" r="26" fill="none" stroke="var(--tv-forest)" strokeWidth="7" strokeDasharray={`${filled} ${circumference}`} strokeDashoffset={circumference / 4} strokeLinecap="round" transform="rotate(-90 32 32)"/><text x="32" y="30" textAnchor="middle" fontSize="16" fontWeight="700" fill="var(--tv-text-primary)" fontFamily="var(--font-display)">{completed}/{total}</text></svg>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: '700' }}>{completed} of {total} completed</div>
                  <div style={{ fontSize: '12px', color: 'var(--tv-text-muted)' }}>Review all docs to subscribe.</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                {docs.map((doc) => (
                  <div
                    key={doc.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px',
                      background: doc.acknowledged ? 'var(--tv-positive-bg)' : 'white',
                      border: doc.acknowledged ? '1px solid rgba(30,123,75,.2)' : '1px solid var(--tv-border)',
                      borderRadius: 'var(--radius-md)',
                    }}
                  >
                    <i
                      className={doc.acknowledged ? 'ti ti-circle-check' : 'ti ti-file-text'}
                      style={{ color: doc.acknowledged ? 'var(--tv-positive)' : 'var(--tv-text-muted)', fontSize: '18px', flexShrink: 0 }}
                    ></i>
                    <div style={{ flex: 1, fontSize: '13px' }}>
                      <div style={{ fontWeight: '500' }}>{doc.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--tv-text-muted)' }}>PDF</div>
                    </div>
                    {doc.acknowledged ? (
                      <span className="badge badge-green" style={{ fontSize: '10.5px' }}>Acknowledged</span>
                    ) : (
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '4px 10px', fontSize: '11.5px' }}
                        onClick={() => acknowledgeDoc(doc.id)}
                      >
                        Acknowledge
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <hr className="divider" />
              {subscribed ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '12px',
                    background: 'var(--tv-positive-bg)',
                    border: '1px solid rgba(30,123,75,.2)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--tv-positive)',
                    fontSize: '13px',
                    fontWeight: '600',
                  }}
                >
                  <i className="ti ti-circle-check" style={{ fontSize: '18px' }}></i>
                  Subscription request submitted
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: 'var(--tv-text-muted)', marginBottom: '12px' }}>
                    <i className={allAcknowledged ? 'ti ti-lock-open' : 'ti ti-lock'} style={{ fontSize: '16px' }}></i>{' '}
                    {allAcknowledged ? 'All documents acknowledged — you may subscribe.' : 'You must acknowledge all documents to subscribe.'}
                  </div>
                  <button
                    className="btn btn-primary"
                    style={{ width: '100%', justifyContent: 'center', opacity: allAcknowledged ? '1' : '.5', cursor: allAcknowledged ? 'pointer' : 'not-allowed' }}
                    onClick={subscribe}
                    disabled={!allAcknowledged}
                  >
                    Subscribe to Opportunity
                  </button>
                </>
              )}
              <button
                className={`btn ${watchlisted ? 'btn-gold' : 'btn-secondary'}`}
                style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }}
                onClick={toggleWatchlist}
              >
                <i className={watchlisted ? 'ti ti-bookmark-filled' : 'ti ti-bookmark'}></i>{' '}
                {watchlisted ? 'Added to Watchlist' : 'Add to Watchlist'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
