import { useMemo, useState } from "react";
import { currency, formatDate } from "../utils/format";
import { api } from "../api";

const CATEGORIES = [
  "Groceries",
  "Dining",
  "Housing",
  "Income",
  "Utilities",
  "Transportation"
];

/* Title-case a raw account type/subtype label (plaid lowercase or legacy upper). */
function titleCase(s) {
  if (!s) return "Account";
  return String(s)
    .replace(/[_-]/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/* Tolerant field accessors that work with both real API + legacy mock shapes. */
const acctBalance = (a) => a.currentBalance ?? a.balance ?? 0;
const acctAvailable = (a) => a.availableBalance ?? a.available ?? acctBalance(a);
const acctInstitution = (a) => a.officialName ?? a.institution ?? "—";
const acctRawType = (a) => a.subtype ?? a.type ?? "";

/* Map an account to a category bucket used by the type filter. */
function typeBucket(a) {
  const t = (acctRawType(a) || "").toString().toLowerCase();
  const top = (a.type || "").toString().toLowerCase();
  if (t.includes("saving")) return "SAVINGS";
  if (t.includes("checking") || top === "depository") return "CHECKING";
  if (t.includes("credit") || top === "credit") return "CREDIT";
  if (t.includes("invest") || top === "investment") return "INVESTMENT";
  if (top === "loan") return "LOAN";
  return "OTHER";
}

/* Is this account a cash (depository) account? */
function isCash(a) {
  const bucket = typeBucket(a);
  return bucket === "CHECKING" || bucket === "SAVINGS";
}

/* Pick a badge color for the type pill. */
function typeBadgeClass(a) {
  switch (typeBucket(a)) {
    case "CHECKING":
      return "badge-forest";
    case "SAVINGS":
      return "badge-green";
    case "CREDIT":
      return "badge-amber";
    case "INVESTMENT":
      return "badge-gold";
    default:
      return "badge-gray";
  }
}

/* Status badge — only rendered when an account exposes a status field. */
function StatusBadge({ status }) {
  const map = {
    HEALTHY: { cls: "badge-green", label: "Healthy" },
    STALE: { cls: "badge-amber", label: "Stale" },
    ACTION_REQUIRED: { cls: "badge-red", label: "Action required" }
  };
  const s = map[status] || { cls: "badge-gray", label: titleCase(status) };
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

/* Icon + color for a transaction based on sign / category. */
function txVisual(tx) {
  const cat = (tx.category || "").toLowerCase();
  if ((tx.amount || 0) >= 0) return { icon: "ti ti-building-bank", cls: "icon-green" };
  if (cat.includes("grocer") || cat.includes("food")) return { icon: "ti ti-shopping-cart", cls: "icon-amber" };
  if (cat.includes("dining")) return { icon: "ti ti-tools-kitchen-2", cls: "icon-amber" };
  if (cat.includes("hous") || cat.includes("rent") || cat.includes("mortgage")) return { icon: "ti ti-home", cls: "icon-forest" };
  if (cat.includes("transport") || cat.includes("travel")) return { icon: "ti ti-car", cls: "icon-blue" };
  if (cat.includes("util") || cat.includes("bill")) return { icon: "ti ti-bolt", cls: "icon-amber" };
  return { icon: "ti ti-shopping-bag", cls: "icon-red" };
}

export default function CashPage({ accounts = [], transactions = [] }) {
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [txs, setTxs] = useState(transactions || []);
  const [editing, setEditing] = useState({});
  const [notice, setNotice] = useState(""); // inline error banner (replaces blocking alert())

  useMemo(() => setTxs(transactions || []), [transactions]);

  const cashTotal = accounts
    .filter(isCash)
    .reduce((s, a) => s + acctBalance(a), 0);

  const linkedInstitutions = useMemo(
    () => new Set(accounts.map(acctInstitution).filter(Boolean)).size,
    [accounts]
  );

  const hasStatus = accounts.some((a) => a.status);
  const needsAttention = hasStatus
    ? accounts.filter((a) => a.status && a.status !== "HEALTHY").length
    : 0;

  const filtered = useMemo(() => {
    return accounts.filter((a) => {
      if (filter !== "ALL" && typeBucket(a) !== filter) return false;
      const q = search.trim().toLowerCase();
      if (!q) return true;
      const name = (a.name || "").toLowerCase();
      const inst = (acctInstitution(a) || "").toLowerCase();
      return name.includes(q) || inst.includes(q);
    });
  }, [accounts, filter, search]);

  async function changeCategory(txId, newCat) {
    try {
      setNotice("");
      await api.categorizeTransaction(txId, newCat);
      setTxs((prev) => prev.map((t) => (t.id === txId ? { ...t, category: newCat } : t)));
      setEditing((e) => ({ ...e, [txId]: false }));
    } catch (err) {
      console.error(err);
      setNotice("Couldn't update that category. Please try again.");
    }
  }

  return (
    <div id="page-cash" className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">Cash &amp; Accounts</div>
          <div className="page-subtitle">All linked depository and card accounts</div>
        </div>
      </div>

      {notice && (
        <div
          role="alert"
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
            background: "var(--tv-negative-bg)", color: "var(--tv-negative)",
            border: "1px solid var(--tv-negative)", borderRadius: "var(--radius-md)",
            padding: "10px 14px", marginBottom: 16, fontSize: 14,
          }}
        >
          <span><i className="ti ti-alert-circle" style={{ marginRight: 6 }}></i>{notice}</span>
          <button
            type="button" aria-label="Dismiss" onClick={() => setNotice("")}
            style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", fontSize: 16 }}
          >
            <i className="ti ti-x"></i>
          </button>
        </div>
      )}

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">
            <i className="ti ti-cash" style={{ color: "var(--tv-forest-light)" }}></i> Total Cash
          </div>
          <div className="kpi-value">{currency(cashTotal)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">
            <i className="ti ti-building-bank" style={{ color: "var(--tv-forest-light)" }}></i> Linked Institutions
          </div>
          <div className="kpi-value">{linkedInstitutions}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">
            <i className="ti ti-wallet" style={{ color: "var(--tv-forest-light)" }}></i> Accounts
          </div>
          <div className="kpi-value">{accounts.length}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">
            <i
              className="ti ti-alert-triangle"
              style={{ color: needsAttention ? "var(--tv-negative)" : "var(--tv-text-muted)" }}
            ></i>{" "}
            Needs Attention
          </div>
          <div className="kpi-value">{needsAttention}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="filter-bar">
          <div className="filter-search">
            <i className="ti ti-search"></i>
            <input
              type="text"
              placeholder="Search by account or institution…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="form-select filter-select"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="ALL">All types</option>
            <option value="CHECKING">Checking</option>
            <option value="SAVINGS">Savings</option>
            <option value="CREDIT">Credit</option>
            <option value="INVESTMENT">Investment</option>
          </select>
        </div>

        {accounts.length === 0 ? (
          <div className="empty-state">
            <i className="ti ti-building-bank"></i>
            <p>No accounts linked yet.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <i className="ti ti-filter-off"></i>
            <p>No accounts match your filters.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="tv-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Institution</th>
                  <th>Type</th>
                  <th style={{ textAlign: "right" }}>Balance</th>
                  <th style={{ textAlign: "right" }}>Available</th>
                  {hasStatus && <th>Status</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 500 }}>{a.name}</td>
                    <td style={{ color: "var(--tv-text-muted)" }}>{acctInstitution(a)}</td>
                    <td>
                      <span className={`badge ${typeBadgeClass(a)}`}>
                        {titleCase(acctRawType(a))}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>{currency(acctBalance(a))}</td>
                    <td style={{ textAlign: "right" }}>{currency(acctAvailable(a))}</td>
                    {hasStatus && (
                      <td>{a.status ? <StatusBadge status={a.status} /> : "—"}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-header">
          <div className="section-title">Recent activity</div>
        </div>

        {txs.length === 0 ? (
          <div className="empty-state">
            <i className="ti ti-arrows-exchange-2"></i>
            <p>No recent activity.</p>
          </div>
        ) : (
          txs.slice(0, 12).map((tx) => {
            const v = txVisual(tx);
            const amt = Number(tx.amount) || 0;
            const isEditing = !!editing[tx.id];
            return (
              <div className="list-item" key={tx.id}>
                <div className={`item-icon ${v.cls}`}>
                  <i className={v.icon}></i>
                </div>
                <div className="item-main">
                  <div className="item-name">{tx.description || tx.name || "Transaction"}</div>
                  <div className="item-sub">
                    {isEditing ? (
                      <select
                        className="form-select"
                        style={{ height: 32, fontSize: 12.5, maxWidth: 200 }}
                        defaultValue={tx.category}
                        onChange={(e) => changeCategory(tx.id, e.target.value)}
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="badge badge-gray">{tx.category || "Uncategorized"}</span>
                    )}
                  </div>
                </div>
                <div className="item-right" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div>
                    <div className={`item-amount ${amt >= 0 ? "amount-pos" : "amount-neg"}`}>
                      {amt >= 0 ? "+" : ""}
                      {currency(amt)}
                    </div>
                    {tx.date && <div className="item-meta">{formatDate(tx.date)}</div>}
                  </div>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setEditing((e) => ({ ...e, [tx.id]: !e[tx.id] }))}
                    title="Edit category"
                  >
                    <i className="ti ti-pencil"></i>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
