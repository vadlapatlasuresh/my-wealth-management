import React from 'react';

export default function UIFlowMapPage() {
  return (
    <div id="page-flowmap" className="page active">
      <div className="page-header">
        <div><div className="page-title">UI Flow Map</div><div className="page-subtitle">Navigation architecture and user journeys</div></div>
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="section-title">Application navigation architecture</div>
        <svg viewBox="0 0 820 600" width="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <marker id="arr2" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M2 1L8 5L2 9" fill="none" stroke="#8AB89A" strokeWidth="1.5" strokeLinecap="round"/>
            </marker>
          </defs>

          {/* Sidebar / Root */}
          <rect x="10" y="260" width="120" height="44" rx="8" fill="#1A4D3B" stroke="#1A4D3B"/>
          <text x="70" y="283" textAnchor="middle" fontSize="13" fill="white" fontFamily="DM Sans,sans-serif" fontWeight="600">TerraVest App</text>
          <text x="70" y="297" textAnchor="middle" fontSize="10" fill="rgba(255,255,255,.6)" fontFamily="DM Sans,sans-serif">Left sidebar</text>

          {/* Finance section label */}
          <text x="220" y="42" textAnchor="middle" fontSize="10" fill="#7A9086" fontFamily="DM Sans,sans-serif" fontWeight="600" letterSpacing="1">FINANCE</text>

          {/* Finance pages row 1 */}
          <rect x="160" y="50" width="110" height="44" rx="8" fill="#EAF3EE" stroke="#8AB89A" strokeWidth="1"/>
          <text x="215" y="73" textAnchor="middle" fontSize="12" fill="#1A4D3B" fontFamily="DM Sans,sans-serif" fontWeight="600">Home</text>
          <text x="215" y="87" textAnchor="middle" fontSize="10" fill="#7A9086" fontFamily="DM Sans,sans-serif">Dashboard</text>

          <rect x="290" y="50" width="110" height="44" rx="8" fill="#EAF3EE" stroke="#8AB89A" strokeWidth="1"/>
          <text x="345" y="73" textAnchor="middle" fontSize="12" fill="#1A4D3B" fontFamily="DM Sans,sans-serif" fontWeight="600">Accounts</text>
          <text x="345" y="87" textAnchor="middle" fontSize="10" fill="#7A9086" fontFamily="DM Sans,sans-serif">Linked banks</text>

          <rect x="420" y="50" width="110" height="44" rx="8" fill="#EAF3EE" stroke="#8AB89A" strokeWidth="1"/>
          <text x="475" y="73" textAnchor="middle" fontSize="12" fill="#1A4D3B" fontFamily="DM Sans,sans-serif" fontWeight="600">Transactions</text>
          <text x="475" y="87" textAnchor="middle" fontSize="10" fill="#7A9086" fontFamily="DM Sans,sans-serif">History &amp; search</text>

          <rect x="550" y="50" width="110" height="44" rx="8" fill="#EAF3EE" stroke="#8AB89A" strokeWidth="1"/>
          <text x="605" y="73" textAnchor="middle" fontSize="12" fill="#1A4D3B" fontFamily="DM Sans,sans-serif" fontWeight="600">Budgets</text>
          <text x="605" y="87" textAnchor="middle" fontSize="10" fill="#7A9086" fontFamily="DM Sans,sans-serif">Category limits</text>

          <rect x="680" y="50" width="110" height="44" rx="8" fill="#EAF3EE" stroke="#8AB89A" strokeWidth="1"/>
          <text x="735" y="73" textAnchor="middle" fontSize="12" fill="#1A4D3B" fontFamily="DM Sans,sans-serif" fontWeight="600">Investments</text>
          <text x="735" y="87" textAnchor="middle" fontSize="10" fill="#7A9086" fontFamily="DM Sans,sans-serif">Portfolio</text>

          {/* Finance row 2 */}
          <rect x="160" y="130" width="110" height="44" rx="8" fill="#EAF3EE" stroke="#8AB89A" strokeWidth="1"/>
          <text x="215" y="153" textAnchor="middle" fontSize="12" fill="#1A4D3B" fontFamily="DM Sans,sans-serif" fontWeight="600">Pay Bills</text>
          <text x="215" y="167" textAnchor="middle" fontSize="10" fill="#7A9086" fontFamily="DM Sans,sans-serif">5-step wizard</text>

          <rect x="290" y="130" width="110" height="44" rx="8" fill="#EAF3EE" stroke="#8AB89A" strokeWidth="1"/>
          <text x="345" y="153" textAnchor="middle" fontSize="12" fill="#1A4D3B" fontFamily="DM Sans,sans-serif" fontWeight="600">Debt Lab</text>
          <text x="345" y="167" textAnchor="middle" fontSize="10" fill="#7A9086" fontFamily="DM Sans,sans-serif">Strategy compare</text>

          {/* Arrows: sidebar → finance pages */}
          <line x1="130" y1="275" x2="160" y2="72" stroke="#8AB89A" strokeWidth="1" markerEnd="url(#arr2)" opacity=".5"/>
          <line x1="130" y1="275" x2="290" y2="72" stroke="#8AB89A" strokeWidth="1" markerEnd="url(#arr2)" opacity=".5"/>
          <line x1="130" y1="275" x2="420" y2="72" stroke="#8AB89A" strokeWidth="1" markerEnd="url(#arr2)" opacity=".5"/>
          <line x1="130" y1="275" x2="550" y2="72" stroke="#8AB89A" strokeWidth="1" markerEnd="url(#arr2)" opacity=".5"/>
          <line x1="130" y1="275" x2="680" y2="72" stroke="#8AB89A" strokeWidth="1" markerEnd="url(#arr2)" opacity=".5"/>
          <line x1="130" y1="282" x2="160" y2="152" stroke="#8AB89A" strokeWidth="1" markerEnd="url(#arr2)" opacity=".5"/>
          <line x1="130" y1="282" x2="290" y2="152" stroke="#8AB89A" strokeWidth="1" markerEnd="url(#arr2)" opacity=".5"/>

          {/* Real Estate section label */}
          <text x="350" y="240" textAnchor="middle" fontSize="10" fill="#C9973A" fontFamily="DM Sans,sans-serif" fontWeight="600" letterSpacing="1">REAL ESTATE</text>

          <rect x="160" y="250" width="120" height="44" rx="8" fill="#FDF5E4" stroke="#C9973A" strokeWidth="1.5"/>
          <text x="220" y="273" textAnchor="middle" fontSize="12" fill="#1A4D3B" fontFamily="DM Sans,sans-serif" fontWeight="600">Properties</text>
          <text x="220" y="287" textAnchor="middle" fontSize="10" fill="#7A9086" fontFamily="DM Sans,sans-serif">Portfolio widget</text>

          <rect x="300" y="250" width="120" height="44" rx="8" fill="#FDF5E4" stroke="#C9973A" strokeWidth="1.5"/>
          <text x="360" y="273" textAnchor="middle" fontSize="12" fill="#1A4D3B" fontFamily="DM Sans,sans-serif" fontWeight="600">Deal Room</text>
          <text x="360" y="287" textAnchor="middle" fontSize="10" fill="#7A9086" fontFamily="DM Sans,sans-serif">Opportunity detail</text>

          <rect x="440" y="250" width="120" height="44" rx="8" fill="#FDF5E4" stroke="#C9973A" strokeWidth="1.5"/>
          <text x="500" y="273" textAnchor="middle" fontSize="12" fill="#1A4D3B" fontFamily="DM Sans,sans-serif" fontWeight="600">Fractional LLC</text>
          <text x="500" y="287" textAnchor="middle" fontSize="10" fill="#7A9086" fontFamily="DM Sans,sans-serif">Auto formation</text>

          {/* Arrows sidebar → RE pages */}
          <line x1="130" y1="290" x2="160" y2="272" stroke="#C9973A" strokeWidth="1" markerEnd="url(#arr2)" opacity=".6"/>
          <line x1="130" y1="290" x2="300" y2="272" stroke="#C9973A" strokeWidth="1" markerEnd="url(#arr2)" opacity=".6"/>
          <line x1="130" y1="290" x2="440" y2="272" stroke="#C9973A" strokeWidth="1" markerEnd="url(#arr2)" opacity=".6"/>

          {/* Key interactions */}
          <text x="160" y="360" textAnchor="start" fontSize="10" fill="#7A9086" fontFamily="DM Sans,sans-serif" fontWeight="600" letterSpacing="1">KEY USER JOURNEYS</text>

          {/* Journey 1: Bill Pay flow */}
          <text x="160" y="382" textAnchor="start" fontSize="11" fill="#4A5E54" fontFamily="DM Sans,sans-serif" fontWeight="600">Bill Pay wizard:</text>
          <rect x="160" y="390" width="70" height="28" rx="6" fill="#EAF3EE" stroke="#8AB89A"/>
          <text x="195" y="408" textAnchor="middle" fontSize="10" fill="#1A4D3B" fontFamily="DM Sans,sans-serif">Select card</text>
          <line x1="230" y1="404" x2="245" y2="404" stroke="#8AB89A" strokeWidth="1" markerEnd="url(#arr2)"/>
          <rect x="245" y="390" width="60" height="28" rx="6" fill="#EAF3EE" stroke="#8AB89A"/>
          <text x="275" y="408" textAnchor="middle" fontSize="10" fill="#1A4D3B" fontFamily="DM Sans,sans-serif">Amount</text>
          <line x1="305" y1="404" x2="320" y2="404" stroke="#8AB89A" strokeWidth="1" markerEnd="url(#arr2)"/>
          <rect x="320" y="390" width="65" height="28" rx="6" fill="#EAF3EE" stroke="#8AB89A"/>
          <text x="352" y="408" textAnchor="middle" fontSize="10" fill="#1A4D3B" fontFamily="DM Sans,sans-serif">Funding</text>
          <line x1="385" y1="404" x2="400" y2="404" stroke="#8AB89A" strokeWidth="1" markerEnd="url(#arr2)"/>
          <rect x="400" y="390" width="60" height="28" rx="6" fill="#C9973A" stroke="#C9973A"/>
          <text x="430" y="408" textAnchor="middle" fontSize="10" fill="white" fontFamily="DM Sans,sans-serif">Review</text>
          <line x1="460" y1="404" x2="475" y2="404" stroke="#8AB89A" strokeWidth="1" markerEnd="url(#arr2)"/>
          <rect x="475" y="390" width="55" height="28" rx="6" fill="#1A4D3B" stroke="#1A4D3B"/>
          <text x="502" y="408" textAnchor="middle" fontSize="10" fill="white" fontFamily="DM Sans,sans-serif">Done ✓</text>

          {/* Journey 2: Investment subscription */}
          <text x="160" y="450" textAnchor="start" fontSize="11" fill="#4A5E54" fontFamily="DM Sans,sans-serif" fontWeight="600">Investment subscription:</text>
          <rect x="160" y="458" width="90" height="28" rx="6" fill="#FDF5E4" stroke="#C9973A"/>
          <text x="205" y="476" textAnchor="middle" fontSize="10" fill="#1A4D3B" fontFamily="DM Sans,sans-serif">Browse deals</text>
          <line x1="250" y1="472" x2="265" y2="472" stroke="#C9973A" strokeWidth="1" markerEnd="url(#arr2)"/>
          <rect x="265" y="458" width="90" height="28" rx="6" fill="#FDF5E4" stroke="#C9973A"/>
          <text x="310" y="476" textAnchor="middle" fontSize="10" fill="#1A4D3B" fontFamily="DM Sans,sans-serif">Review docs</text>
          <line x1="355" y1="472" x2="370" y2="472" stroke="#C9973A" strokeWidth="1" markerEnd="url(#arr2)"/>
          <rect x="370" y="458" width="90" height="28" rx="6" fill="#FDF5E4" stroke="#C9973A"/>
          <text x="415" y="476" textAnchor="middle" fontSize="10" fill="#1A4D3B" fontFamily="DM Sans,sans-serif">Acknowledge</text>
          <line x1="460" y1="472" x2="475" y2="472" stroke="#C9973A" strokeWidth="1" markerEnd="url(#arr2)"/>
          <rect x="475" y="458" width="80" height="28" rx="6" fill="#1A4D3B" stroke="#1A4D3B"/>
          <text x="515" y="476" textAnchor="middle" fontSize="10" fill="white" fontFamily="DM Sans,sans-serif">Subscribe ✓</text>

          {/* Settings section */}
          <text x="160" y="530" textAnchor="start" fontSize="10" fill="#7A9086" fontFamily="DM Sans,sans-serif" fontWeight="600" letterSpacing="1">ACCOUNT</text>
          <rect x="160" y="540" width="90" height="36" rx="8" fill="#F0F4F8" stroke="#DDE5E1"/>
          <text x="205" y="562" textAnchor="middle" fontSize="11" fill="#4A5E54" fontFamily="DM Sans,sans-serif">Security</text>
          <rect x="265" y="540" width="90" height="36" rx="8" fill="#F0F4F8" stroke="#DDE5E1"/>
          <text x="310" y="562" textAnchor="middle" fontSize="11" fill="#4A5E54" fontFamily="DM Sans,sans-serif">Messages</text>
          <rect x="370" y="540" width="90" height="36" rx="8" fill="#F0F4F8" stroke="#DDE5E1"/>
          <text x="415" y="562" textAnchor="middle" fontSize="11" fill="#4A5E54" fontFamily="DM Sans,sans-serif">Settings</text>
          <rect x="475" y="540" width="90" height="36" rx="8" fill="#F0F4F8" stroke="#DDE5E1"/>
          <text x="520" y="562" textAnchor="middle" fontSize="11" fill="#4A5E54" fontFamily="DM Sans,sans-serif">Sign out</text>
        </svg>
      </div>

      {/* Responsive notes */}
      <div className="card">
        <div className="section-title">Responsive &amp; mobile notes</div>
        <div className="grid-2" style={{ gap: '16px', marginTop: '4px' }}>
          <div>
            <div style={{ fontSize: '13.5px', fontWeight: '600', marginBottom: '8px' }}><i className="ti ti-device-desktop" style={{ marginRight: '6px', color: 'var(--tv-forest-light)' }}></i>Desktop (≥1024px)</div>
            <ul style={{ fontSize: '13px', color: 'var(--tv-text-secondary)', lineHeight: '2', paddingLeft: '18px' }}>
              <li>Full 228px sidebar always visible</li>
              <li>2–3 column content grids</li>
              <li>KPI row: 6 cards in one row</li>
              <li>Side-by-side chart + widget layouts</li>
            </ul>
          </div>
          <div>
            <div style={{ fontSize: '13.5px', fontWeight: '600', marginBottom: '8px' }}><i className="ti ti-device-mobile" style={{ marginRight: '6px', color: 'var(--tv-gold)' }}></i>Mobile (&lt;768px)</div>
            <ul style={{ fontSize: '13px', color: 'var(--tv-text-secondary)', lineHeight: '2', paddingLeft: '18px' }}>
              <li>Sidebar collapses to bottom nav bar</li>
              <li>Single-column stacked layout</li>
              <li>KPI row: 2×3 grid scrollable</li>
              <li>Modals slide up from bottom</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
