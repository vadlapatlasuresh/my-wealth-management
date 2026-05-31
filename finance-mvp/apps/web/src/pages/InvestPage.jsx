import { currency } from "../utils/format";
import Sparkline from "../components/Sparkline";

const MOCK_HOLDINGS = [
  { symbol: "VTI", name: "Vanguard Total Stock", qty: 120, price: 248.2, dayChg: 0.82 },
  { symbol: "VXUS", name: "Vanguard Intl Stock", qty: 85, price: 62.4, dayChg: -0.31 },
  { symbol: "BND", name: "Vanguard Bond", qty: 200, price: 72.1, dayChg: 0.12 },
  { symbol: "CASH", name: "Brokerage Cash", qty: 1, price: 12400, dayChg: 0 }
];

const MOCK_OFFERINGS = [
  {
    id: "1",
    title: "Willow Creek Land LLC",
    geography: "Texas Hill Country",
    risk: "Medium",
    ticketMin: 25000,
    target: "10–12% target"
  },
  {
    id: "2",
    title: "Pine Ridge Parcel Fund",
    geography: "Georgia",
    risk: "Low",
    ticketMin: 15000,
    target: "8–10% target"
  }
];

export default function InvestPage({ snapshot }) {
  const totalInvested = snapshot?.components?.investments ?? 0;
  const holdings = snapshot?.holdings || MOCK_HOLDINGS;
  const series = snapshot?.series || null;

  return (
    <>
      <header className="page-header">
        <h1>Invest</h1>
        <p className="muted">Portfolio holdings and TerraVest marketplace</p>
      </header>

      <div className="invest-top">
        <div className="card allocation-card">
          <h3>Allocation</h3>
          <div className="alloc-legend">
            <div><span className="swatch us" /> US Equity 58%</div>
            <div><span className="swatch intl" /> Intl 22%</div>
            <div><span className="swatch bond" /> Bonds 12%</div>
            <div><span className="swatch cash" /> Cash 8%</div>
          </div>
        </div>
        <div className="kpi-tile">
          <span>Total invested</span>
          <strong>{currency(totalInvested)}</strong>
        </div>
        <div className="kpi-tile">
          <span>Day change</span>
          <strong className="positive">+{currency(1240.55)}</strong>
        </div>
      </div>

      <div className="card table-card">
        <div className="card-head">
          <h3>Portfolio holdings</h3>
          <button type="button" className="btn-secondary btn-sm">
            Export CSV
          </button>
        </div>
        <table className="data-table dense">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Name</th>
              <th className="num">Qty</th>
              <th className="num">Price</th>
              <th className="num">Mkt value</th>
              <th className="num">Day chg</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => {
              const mv = h.qty * h.price;
              return (
                <tr key={h.symbol}>
                  <td>
                    <strong>{h.symbol}</strong>
                  </td>
                  <td>{h.name}</td>
                  <td className="num">{h.qty}</td>
                  <td className="num">{currency(h.price)}</td>
                  <td className="num">{currency(mv)}</td>
                  <td className={`num ${h.dayChg >= 0 ? "positive" : "negative"}`}>
                    {h.dayChg >= 0 ? "+" : ""}
                    {h.dayChg}%
                  </td>
                  <td>
                    <Sparkline series={series} stroke={h.dayChg >= 0 ? "#059669" : "#dc2626"} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <header className="page-header">
        <h2>Marketplace</h2>
        <p className="muted">Land-backed offerings (mock)</p>
      </header>

      <div className="offering-grid">
        {MOCK_OFFERINGS.map((o) => (
          <article key={o.id} className="card offering-card">
            <span className={`risk-pill ${o.risk.toLowerCase()}`}>{o.risk} risk</span>
            <h3>{o.title}</h3>
            <p>{o.geography}</p>
            <p className="muted">Min {currency(o.ticketMin)}</p>
            <p>{o.target}</p>
            <button type="button" className="btn-secondary btn-sm">
              View deal
            </button>
          </article>
        ))}
      </div>
    </>
  );
}
