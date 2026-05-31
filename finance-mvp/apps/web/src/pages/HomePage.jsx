import NetWorthChart from "../components/NetWorthChart";
import { currency, formatDate } from "../utils/format";

export default function HomePage({ snapshot, accounts = [], transactions = [], creditCards = [], onPay, onSync }) {
  const totalUtil =
    creditCards.length > 0
      ? creditCards.reduce((s, c) => s + (c.balance || 0) / (c.creditLimit || c.balance || 1), 0) /
        creditCards.length
      : 0;

  const netTotal = snapshot?.net_worth?.total ?? 0;
  const change30 = snapshot?.net_worth?.change_30d ?? 0;

  return (
    <>
      <header className="page-header">
        <h1>Home</h1>
        <p className="muted">As of {formatDate(snapshot?.computed_at)}</p>
      </header>

      <div className="kpi-row">
        <div className="kpi-tile hero">
          <span>Net worth</span>
          <strong>{currency(netTotal)}</strong>
          <small className={change30 >= 0 ? "positive" : "negative"}>{change30 >= 0 ? "+" : ""}{currency(change30)} 30d</small>
        </div>
        <div className="kpi-tile">
          <span>Cash</span>
          <strong>{currency(snapshot?.components?.cash)}</strong>
        </div>
        <div className="kpi-tile">
          <span>Investments</span>
          <strong>{currency(snapshot?.components?.investments)}</strong>
        </div>
        <div className="kpi-tile">
          <span>Credit card debt</span>
          <strong>{currency(snapshot?.components?.credit_cards)}</strong>
        </div>
      </div>

      <div className="home-grid">
        <NetWorthChart
          total={netTotal}
          change30d={change30}
          series={snapshot?.series}
        />

        <div className="side-widgets">
          <div className="card widget">
            <h3>Credit utilization</h3>
            <div className="donut-wrap">
              <div
                className="donut"
                style={{ "--pct": `${Math.min(totalUtil * 100, 100)}%` }}
              />
              <span className="donut-label">{Math.round(totalUtil * 100)}%</span>
            </div>
          </div>
          <div className="card widget">
            <h3>Upcoming bills</h3>
            <ul className="simple-list">
              {creditCards.length === 0 && <li>No upcoming bills</li>}
              {creditCards.map((card) => (
                <li key={card.id}>
                  <span>{card.name}</span>
                  <span>{currency(card.balance)} due {card.dueDate ? formatDate(card.dueDate) : "—"}</span>
                </li>
              ))}
            </ul>
            <div style={{ marginTop: 12 }}>
              <button className="btn-primary" onClick={() => onPay && onPay()}>
                Pay a bill
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Linked institutions</h3>
          <div>
            <button className="btn-secondary btn-sm" onClick={() => onSync && onSync()} style={{ marginRight: 8 }}>
              Sync accounts
            </button>
          </div>
        </div>
        <div className="chip-strip">
          {[...new Set((accounts || []).map((a) => a.institution))].map((name) => (
            <span key={name} className="inst-chip">
              <span className="dot healthy" /> {name}
            </span>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Recent transactions</h3>
        </div>
        <ul className="tx-list">
          {(transactions || []).slice(0, 6).map((tx) => (
            <li key={tx.id}>
              <div>
                <strong>{tx.description}</strong>
                <p>{tx.category}</p>
              </div>
              <span className={tx.amount >= 0 ? "positive" : "negative"}>
                {currency(tx.amount)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
