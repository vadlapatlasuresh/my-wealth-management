import { currency } from "../utils/format";

export default function RealEstateWidget({ properties = [] }) {
  const totalValue = properties.reduce((sum, p) => sum + (p.currentValue || 0), 0);
  const totalEquity = properties.reduce((sum, p) => sum + (p.equity || 0), 0);
  const totalLoan = properties.reduce((sum, p) => sum + (p.loanBalance || 0), 0);

  return (
    <div className="card real-estate-widget">
      <h3>Real Estate portfolio</h3>
      <div className="re-summary">
        <div>
          <span>Total value</span>
          <strong>{currency(totalValue)}</strong>
        </div>
        <div>
          <span>Equity</span>
          <strong className="positive">{currency(totalEquity)}</strong>
        </div>
        <div>
          <span>Mortgage</span>
          <strong>{currency(totalLoan)}</strong>
        </div>
      </div>
      {properties.length > 0 && (
        <ul className="simple-list">
          {properties.map((prop) => (
            <li key={prop.id}>
              <div>
                <strong>{prop.address}</strong>
                <p>{prop.purchaseDate} · Valued {currency(prop.currentValue)}</p>
              </div>
              <span className="positive">{currency(prop.equity)} equity</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
