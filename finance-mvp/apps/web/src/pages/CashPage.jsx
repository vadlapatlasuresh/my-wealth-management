import { useMemo, useState } from "react";
import { currency, formatDate } from "../utils/format";
import { api } from "../api";

function StatusBadge({ status }) {
  const map = {
    HEALTHY: { cls: "healthy", label: "Healthy" },
    STALE: { cls: "stale", label: "Stale" },
    ACTION_REQUIRED: { cls: "danger", label: "Action required" }
  };
  const s = map[status] || { cls: "healthy", label: status };
  return (
    <span className={`status-badge ${s.cls}`}>
      <span className="dot" /> {s.label}
    </span>
  );
}

export default function CashPage({ accounts, transactions }) {
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [txs, setTxs] = useState(transactions || []);
  const [editing, setEditing] = useState({});

  useMemo(() => setTxs(transactions || []), [transactions]);

  const cashTotal = accounts
    .filter((a) => a.type === "CHECKING" || a.type === "SAVINGS")
    .reduce((s, a) => s + a.balance, 0);

  const needsAttention = accounts.filter((a) => a.status !== "HEALTHY").length;

  const filtered = useMemo(() => {
    return accounts.filter((a) => {
      if (filter !== "ALL" && a.type !== filter) return false;
      const q = search.toLowerCase();
      if (!q) return true;
      return (
        a.name.toLowerCase().includes(q) || a.institution.toLowerCase().includes(q)
      );
    });
  }, [accounts, filter, search]);

  async function changeCategory(txId, newCat) {
    try {
      await api.categorizeTransaction(txId, newCat);
      setTxs((prev) => prev.map((t) => (t.id === txId ? { ...t, category: newCat } : t)));
      setEditing((e) => ({ ...e, [txId]: false }));
    } catch (err) {
      console.error(err);
      alert('Failed to update category');
    }
  }

  return (
    <>
      <header className="page-header row">
        <div>
          <h1>Cash & accounts</h1>
          <p className="muted">All linked depository and card accounts</p>
        </div>
      </header>

      <div className="summary-row">
        <div className="summary-card">
          <span>Total cash</span>
          <strong>{currency(cashTotal)}</strong>
        </div>
        <div className="summary-card">
          <span>Linked institutions</span>
          <strong>{new Set(accounts.map((a) => a.institution)).size}</strong>
        </div>
        <div className="summary-card">
          <span>Needs attention</span>
          <strong>{needsAttention}</strong>
        </div>
      </div>

      <div className="filter-row">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="ALL">All types</option>
          <option value="CHECKING">Checking</option>
          <option value="SAVINGS">Savings</option>
          <option value="CREDIT_CARD">Credit card</option>
        </select>
        <input
          placeholder="Search accounts…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Institution</th>
              <th>Account</th>
              <th>Type</th>
              <th className="num">Balance</th>
              <th className="num">Available</th>
              <th>Last synced</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => (
              <tr key={a.id}>
                <td>{a.institution}</td>
                <td>{a.name}</td>
                <td>{a.type.replace("_", " ")}</td>
                <td className="num">{currency(a.balance)}</td>
                <td className="num">{currency(a.available ?? a.balance)}</td>
                <td>{formatDate(a.lastSynced)}</td>
                <td>
                  <StatusBadge status={a.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Recent activity</h3>
        <ul className="tx-list">
          {txs.slice(0, 12).map((tx) => (
            <li key={tx.id}>
              <div>
                <strong>{tx.description}</strong>
                <p>
                  {editing[tx.id] ? (
                    <select defaultValue={tx.category} onBlur={(e) => changeCategory(tx.id, e.target.value)}>
                      <option>Groceries</option>
                      <option>Dining</option>
                      <option>Housing</option>
                      <option>Income</option>
                      <option>Utilities</option>
                      <option>Transportation</option>
                    </select>
                  ) : (
                    <span>{tx.category}</span>
                  )}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className={tx.amount >= 0 ? "positive" : "negative"}>{currency(tx.amount)}</span>
                <div>
                  <button className="btn-ghost btn-sm" onClick={() => setEditing((e) => ({ ...e, [tx.id]: true }))}>
                    Edit category
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
