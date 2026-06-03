import React from 'react';
import { currency } from '../utils/format'; // Assuming currency formatter is available

export default function DealRoomPage() {
  // For now, using static data as per the HTML mock.
  // In a real application, this data would come from props or API calls.

  return (
    <div id="page-dealroom" className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">Deal Room</div>
          <div className="page-subtitle">Willow Creek Land LLC — Opportunity detail</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm"><i className="ti ti-bookmark"></i> Watchlist</button>
          <button className="btn btn-primary btn-sm"><i className="ti ti-arrow-left"></i> Marketplace</button>
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
                <svg width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="none" stroke="var(--tv-border)" strokeWidth="7"/><circle cx="32" cy="32" r="26" fill="none" stroke="var(--tv-forest)" strokeWidth="7" strokeDasharray="57.5 105" strokeDashoffset="35" strokeLinecap="round"/><text x="32" y="30" textAnchor="middle" fontSize="16" fontWeight="700" fill="var(--tv-text-primary)" fontFamily="var(--font-display)">2/7</text></svg>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: '700' }}>2 of 7 completed</div>
                  <div style={{ fontSize: '12px', color: 'var(--tv-text-muted)' }}>Review all docs to subscribe.</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', background: 'var(--tv-positive-bg)', border: '1px solid rgba(30,123,75,.2)', borderRadius: 'var(--radius-md)' }}>
                  <i className="ti ti-check-circle" style={{ color: 'var(--tv-positive)', fontSize: '18px', flexShrink: 0 }}></i>
                  <div style={{ flex: 1, fontSize: '13px' }}><div style={{ fontWeight: '500' }}>Private Placement Memo</div><div style={{ fontSize: '11px', color: 'var(--tv-text-muted)' }}>PDF</div></div>
                  <span className="badge badge-green" style={{ fontSize: '10.5px' }}>Acknowledged</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', background: 'var(--tv-positive-bg)', border: '1px solid rgba(30,123,75,.2)', borderRadius: 'var(--radius-md)' }}>
                  <i className="ti ti-check-circle" style={{ color: 'var(--tv-positive)', fontSize: '18px', flexShrink: 0 }}></i>
                  <div style={{ flex: 1, fontSize: '13px' }}><div style={{ fontWeight: '500' }}>Operating Agreement</div><div style={{ fontSize: '11px', color: 'var(--tv-text-muted)' }}>PDF</div></div>
                  <span className="badge badge-green" style={{ fontSize: '10.5px' }}>Acknowledged</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', background: 'white', border: '1px solid var(--tv-border)', borderRadius: 'var(--radius-md)' }}>
                  <i className="ti ti-file-text" style={{ color: 'var(--tv-text-muted)', fontSize: '18px', flexShrink: 0 }}></i>
                  <div style={{ flex: 1, fontSize: '13px' }}><div style={{ fontWeight: '500' }}>Subscription Agreement</div><div style={{ fontSize: '11px', color: 'var(--tv-text-muted)' }}>PDF</div></div>
                  <button className="btn btn-secondary btn-sm" style={{ padding: '4px 10px', fontSize: '11.5px' }}>Acknowledge</button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', background: 'white', border: '1px solid var(--tv-border)', borderRadius: 'var(--radius-md)' }}>
                  <i className="ti ti-file-text" style={{ color: 'var(--tv-text-muted)', fontSize: '18px', flexShrink: 0 }}></i>
                  <div style={{ flex: 1, fontSize: '13px' }}><div style={{ fontWeight: '500' }}>Summary of Terms</div><div style={{ fontSize: '11px', color: 'var(--tv-text-muted)' }}>PDF</div></div>
                  <button className="btn btn-secondary btn-sm" style={{ padding: '4px 10px', fontSize: '11.5px' }}>Acknowledge</button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', background: 'white', border: '1px solid var(--tv-border)', borderRadius: 'var(--radius-md)' }}>
                  <i className="ti ti-file-text" style={{ color: 'var(--tv-text-muted)', fontSize: '18px', flexShrink: 0 }}></i>
                  <div style={{ flex: 1, fontSize: '13px' }}><div style={{ fontWeight: '500' }}>Risk Factors</div><div style={{ fontSize: '11px', color: 'var(--tv-text-muted)' }}>PDF</div></div>
                  <button className="btn btn-secondary btn-sm" style={{ padding: '4px 10px', fontSize: '11.5px' }}>Acknowledge</button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', background: 'white', border: '1px solid var(--tv-border)', borderRadius: 'var(--radius-md)' }}>
                  <i className="ti ti-file-text" style={{ color: 'var(--tv-text-muted)', fontSize: '18px', flexShrink: 0 }}></i>
                  <div style={{ flex: 1, fontSize: '13px' }}><div style={{ fontWeight: '500' }}>Financial Projections</div><div style={{ fontSize: '11px', color: 'var(--tv-text-muted)' }}>PDF</div></div>
                  <button className="btn btn-secondary btn-sm" style={{ padding: '4px 10px', fontSize: '11.5px' }}>Acknowledge</button>
                </div>
              </div>
              <hr className="divider" />
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: 'var(--tv-text-muted)', marginBottom: '12px' }}><i className="ti ti-lock" style={{ fontSize: '16px' }}></i> You must acknowledge all documents to subscribe.</div>
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', opacity: '.5', cursor: 'not-allowed' }}>Subscribe to Opportunity</button>
              <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }}><i className="ti ti-bookmark"></i> Add to Watchlist</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
