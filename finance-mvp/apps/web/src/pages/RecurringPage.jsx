import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { currency, currency0, formatDate } from "../utils/format";
import { obligationsFromAccounts, mergeRecurring, monthlyTotal } from "../utils/recurring";

/* RecurringPage — the "subscriptions radar".
   Two sources, deliberately distinguished so nothing is presented as more certain than it is:
     • DETECTED — subscriptions inferred from transaction history by the backend
       (RecurringBillDetector). Needs ~3 consistent occurrences, so it is legitimately empty
       on a freshly linked account.
     • FROM YOUR ACCOUNTS — real obligations already known from linked credit cards and loans
       (minimum payment + next due date straight from Plaid). These make the screen useful on
       day one instead of blank until months of history accumulate.
   feature_key: individual.recurring. */

function cadenceLabel(c) {
  const map = { WEEKLY: "Weekly", BIWEEKLY: "Every 2 weeks", MONTHLY: "Monthly", YEARLY: "Yearly" };
  return map[String(c || "").toUpperCase()] || c || "";
}

function daysUntil(iso) {
  if (!iso) return null;
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return null;
  return Math.round((d - Date.now()) / (24 * 3600 * 1000));
}

export default function RecurringPage({ accounts = [] }) {
  const navigate = useNavigate();
  const [detected, setDetected] = useState(null); // null = loading
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await api.getRecurringBills();
        if (alive) { setDetected(Array.isArray(data) ? data : []); setError(""); }
      } catch (e) {
        // A failure here must not masquerade as "you have no subscriptions".
        if (alive) { setError(e?.message || "Couldn't load detected subscriptions."); setDetected([]); }
      }
    })();
    return () => { alive = false; };
  }, []);

  const obligations = useMemo(() => obligationsFromAccounts(accounts), [accounts]);
  const items = useMemo(
    () => mergeRecurring(detected || [], obligations).map((i) => ({ ...i, inDays: daysUntil(i.nextDate) })),
    [detected, obligations]
  );
  const perMonth = useMemo(() => monthlyTotal(items), [items]);

  const loading = detected === null;
  const hasLinkedAccounts = accounts.length > 0;
  const detectedCount = (detected || []).length;

  if (loading) {
    return (
      <div className="page active">
        <Header />
        <div className="card" style={{ padding: 28, textAlign: "center" }}>
          <div className="page-subtitle">Scanning your transactions…</div>
        </div>
      </div>
    );
  }

  // Only ask someone to link accounts when they genuinely have none.
  if (!hasLinkedAccounts && items.length === 0) {
    return (
      <div className="page active">
        <Header />
        <div className="card" style={{ padding: 28, textAlign: "center" }}>
          <i className="ti ti-receipt-off" style={{ fontSize: 34, color: "var(--tv-forest, #2f7a5b)" }} />
          <div className="page-title" style={{ fontSize: 18, marginTop: 10 }}>No linked accounts yet</div>
          <div className="page-subtitle" style={{ marginBottom: 16 }}>
            Link an account and we'll find your recurring charges automatically.
          </div>
          <button className="btn btn-primary" onClick={() => navigate("/accounts")}>
            <i className="ti ti-plus" /> Link accounts
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page active">
      <Header />

      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", marginBottom: 14, borderRadius: 10, background: "var(--tv-negative-bg)", border: "1px solid var(--tv-red, #c0392b)" }}>
          <i className="ti ti-alert-circle" style={{ color: "var(--tv-red, #c0392b)" }} />
          <span style={{ fontSize: 13.5 }}>{error}</span>
        </div>
      )}

      {items.length > 0 && (
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: 18 }}>
          <div className="kpi-card" style={{ "--kpi-accent": "var(--tv-gold, #c9973a)" }}>
            <div className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>Recurring each month</div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{currency0(perMonth)}<span style={{ fontSize: 15, fontWeight: 500 }}>/mo</span></div>
            <div className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>
              across {items.length} charge{items.length === 1 ? "" : "s"}
            </div>
          </div>
          <div className="kpi-card" style={{ "--kpi-accent": "#7a5bd6" }}>
            <div className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>That's</div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{currency0(perMonth * 12)}<span style={{ fontSize: 15, fontWeight: 500 }}>/yr</span></div>
            <div className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>Cancel one you forgot and it adds up fast.</div>
          </div>
        </div>
      )}

      {/* Linked accounts but nothing inferred yet — explain WHY rather than implying nothing exists. */}
      {hasLinkedAccounts && detectedCount === 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 16, display: "flex", gap: 12, alignItems: "center" }}>
          <i className="ti ti-info-circle" style={{ fontSize: 22, color: "var(--tv-gold, #c9973a)", flex: "0 0 auto" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14.5 }}>No subscriptions detected from transactions yet</div>
            <div className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>
              We need to see a charge repeat about three times at a steady amount before calling it
              a subscription. {obligations.length > 0
                ? "Your card and loan payments below come straight from your linked accounts in the meantime."
                : "Keep syncing and they'll show up here."}
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" style={{ flex: "0 0 auto" }}
            onClick={() => navigate("/transactions")}>
            View transactions
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="card" style={{ padding: 26, textAlign: "center" }}>
          <i className="ti ti-receipt-off" style={{ fontSize: 30, color: "var(--tv-forest, #2f7a5b)" }} />
          <div className="page-title" style={{ fontSize: 17, marginTop: 8 }}>Nothing recurring yet</div>
          <div className="page-subtitle">
            Your linked accounts don't show a minimum payment, and no repeating charges have been
            detected yet.
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {items.map((b, i) => {
            const due = b.inDays;
            const dueStr = due == null ? "" : due <= 0 ? "Due today" : due === 1 ? "Tomorrow" : `in ${due} days`;
            const soon = due != null && due <= 5;
            const fromAccount = b.source === "account";
            return (
              <div key={`${b.source}-${b.name}-${i}`}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderBottom: i < items.length - 1 ? "1px solid var(--tv-border, rgba(0,0,0,.06))" : "none" }}>
                <span style={{ display: "inline-flex", width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 10, background: fromAccount ? "var(--tv-positive-bg)" : "var(--tv-gold-pale)", color: fromAccount ? "var(--tv-forest, #2f7a5b)" : "var(--tv-gold, #c9973a)", flex: "0 0 auto" }}>
                  <i className={fromAccount ? "ti ti-credit-card" : "ti ti-repeat"} style={{ fontSize: 18 }} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {b.name}{b.mask ? ` ••${b.mask}` : ""}
                  </div>
                  <div className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>
                    {fromAccount
                      ? <>Minimum payment · from your linked account{b.nextDate ? <> · due {formatDate(b.nextDate)}</> : null}</>
                      : <>{cadenceLabel(b.cadence)}{b.occurrences ? ` · seen ${b.occurrences}×` : ""}{b.nextDate ? ` · next ${formatDate(b.nextDate)}` : ""}</>}
                  </div>
                </div>
                <div style={{ textAlign: "right", flex: "0 0 auto" }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{currency(b.amount)}</div>
                  {dueStr && (
                    <div style={{ fontSize: 12, fontWeight: 600, color: soon ? "var(--tv-red, #c0392b)" : "var(--tv-muted, #7a8a83)" }}>
                      {dueStr}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="page-subtitle" style={{ fontSize: 12, marginTop: 12 }}>
        <i className="ti ti-credit-card" style={{ color: "var(--tv-forest, #2f7a5b)" }} /> come from your linked
        accounts. <i className="ti ti-repeat" style={{ color: "var(--tv-gold, #c9973a)" }} /> are detected from
        your transaction history — amounts are the typical (median) charge, and a cancelled
        subscription drops off once it stops appearing.
      </div>
    </div>
  );
}

function Header() {
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="page-title">Recurring &amp; subscriptions</div>
      <div className="page-subtitle">Every repeating charge we know about — so nothing bills you by surprise.</div>
    </div>
  );
}
