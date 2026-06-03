import React, { useMemo } from "react";
import { currency, formatDate } from "../utils/format";

export default function RealEstatePage({ properties = [] }) {
  const totalValue = useMemo(() => properties.reduce((sum, p) => sum + (p.currentValue || 0), 0), [properties]);
  const totalEquity = useMemo(() => properties.reduce((sum, p) => sum + (p.equity || 0), 0), [properties]);
  const totalMortgage = useMemo(() => properties.reduce((sum, p) => sum + (p.loanBalance || 0), 0), [properties]);

  // Placeholder for 30d changes, as they are not directly available in the current properties structure
  const valueChange30d = 8500; // Example value
  const equityChange30d = 1800; // Example value
  const mortgageChange30d = -800; // Example value (negative for decrease)

  const getDeltaClass = (value) => (value >= 0 ? "pos" : "neg");
  const getDeltaIcon = (value) =>
    value >= 0 ? "ti ti-arrow-up-right" : "ti ti-arrow-down-right";

  const onAddProperty = () => {
    console.log("Add Property clicked!");
    // Implement logic to add a new property, e.g., open a modal or navigate to a form
  };

  return (
    <div id="page-realestate" className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">Properties</div>
          <div className="page-subtitle">Your real estate portfolio</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={onAddProperty}>
          <i className="ti ti-plus"></i> Add Property
        </button>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <div className="kpi-card">
          <div className="kpi-label">Total Value</div>
          <div className="kpi-value">{currency(totalValue)}</div>
          <div className={`kpi-delta ${getDeltaClass(valueChange30d)}`}>
            <i className={getDeltaIcon(valueChange30d)}></i> {valueChange30d >= 0 ? '+' : ''}{currency(valueChange30d)} ({(valueChange30d / (totalValue - valueChange30d) * 100).toFixed(1)}%) 30d
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total Equity</div>
          <div className="kpi-value">{currency(totalEquity)}</div>
          <div className={`kpi-delta ${getDeltaClass(equityChange30d)}`}>
            <i className={getDeltaIcon(equityChange30d)}></i> {equityChange30d >= 0 ? '+' : ''}{currency(equityChange30d)} ({(equityChange30d / (totalEquity - equityChange30d) * 100).toFixed(1)}%) 30d
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total Mortgage</div>
          <div className="kpi-value">{currency(totalMortgage)}</div>
          <div className={`kpi-delta ${getDeltaClass(mortgageChange30d)}`}>
            <i className={getDeltaIcon(mortgageChange30d)}></i> {mortgageChange30d >= 0 ? '+' : ''}{currency(mortgageChange30d)} ({(mortgageChange30d / (totalMortgage - mortgageChange30d) * 100).toFixed(1)}%) 30d
          </div>
        </div>
      </div>

      <div className="grid-2">
        {properties.length === 0 ? (
          <div className="card col-span-2">
            <div className="empty-state">
              <i className="ti ti-building-estate"></i>
              <p>No properties added yet. Click "Add Property" to get started!</p>
            </div>
          </div>
        ) : (
          properties.map((prop) => (
            <div className="property-card" key={prop.id}>
              <div className="property-header">
                <div className="property-icon">🏡</div> {/* Consider dynamic icons based on property type */}
                <div>
                  <div className="property-address">{prop.address}</div>
                  <div style={{ fontSize: '12px', color: 'var(--tv-text-muted)', marginTop: '3px' }}>
                    Purchased: {formatDate(prop.purchaseDate)} &nbsp;·&nbsp;
                    <span className={`badge ${prop.type === 'Primary' ? 'badge-green' : 'badge-gold'}`} style={{ fontSize: '10.5px' }}>{prop.type}</span>
                  </div>
                </div>
              </div>
              <div className="property-meta-row">
                <div className="property-stat">
                  <div className="property-stat-label">Current Value</div>
                  <div className="property-stat-value">{currency(prop.currentValue)}</div>
                </div>
                <div className="property-stat">
                  <div className="property-stat-label">Equity</div>
                  <div className="property-stat-value" style={{ color: 'var(--tv-positive)' }}>{currency(prop.equity)}</div>
                </div>
                <div className="property-stat">
                  <div className="property-stat-label">Mortgage</div>
                  <div className="property-stat-value">{currency(prop.loanBalance)}</div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
