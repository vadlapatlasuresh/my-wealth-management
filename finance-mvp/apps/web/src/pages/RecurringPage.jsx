import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { currency, currency0, formatDate } from "../utils/format";

/* RecurringPage — the "subscriptions radar" (Phase 2 acquisition hook).
   The backend (account-aggregation-service RecurringBillDetector) already detects recurring
   charges from ~13 months of transactions; this page surfaces them: the headline monthly
   burn, the annualized total, and every subscription with its cadence and next charge date.
   feature_key: individual.recurring. Pure surfacing — no mock data; empty history => empty state. */

// Normalize a per-occurrence amount at a given cadence into a monthly-equivalent cost,
// so a weekly $5 and a yearly $120 can be summed into one honest "monthly burn" number.
const MONTHLY_FACTOR = {
  WEEKLY: 52 / 12,
  BIWEEKLY: 26 / 12,
  MONTHLY: 1,
  YEARLY: 1 / 12,
};

function monthlyEquivalent(amount, cadence) {
  const f = MONTHLY_FACTOR[(cadence || "MONTHLY").toUpperCase()] ?? 1;
  return (Number(amount) || 0) * f;
}

function cadenceLabel(c) {
  const map = { WEEKLY: "Weekly", BIWEEKLY: "Every 2 weeks", MONTHLY: "Monthly", YEARLY: "Yearly" };
  return map[(c || "").toUpperCase()] || c || "";
}

function daysUntil(iso) {
  if (!iso) return null;
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return null;
  return Math.round((d - Date.now()) / (24 * 3600 * 1000));
}

export default function RecurringPage() {
  const navigate = useNavigate();
  const [bills, setBills] = useState(null); // null = loading, [] = loaded empty
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await api.getRecurringBills();
        if (alive) setBills(Array.isArray(data) ? data : []);
      } catch {
        if (alive) { setError("We couldn't load your recurring charges. Try again shortly."); setBills([]); }
      }
    })();
    return () => { alive = false; };
  }, []);

  const { monthlyTotal, annualTotal, sorted } = useMemo(() => {
    const list = (bills || []).map((b) => ({
      ...b,
      monthly: monthlyEquivalent(b.amount, b.cadence),
      inDays: daysUntil(b.nextDate),
    }));
    const monthly = list.reduce((s, b) => s + b.monthly, 0);
    // Soonest next charge first (backend already sorts, but be defensive).
    list.sort((a, b) => (a.inDays ?? 9999) - (b.inDays ?? 9999));
    return { monthlyTotal: monthly, annualTotal: monthly * 12, sorted: list };
  }, [bills]);

  const loading = bills === null;

  return (
    <div className="page active">
      <div style={{ marginBottom: 18 }}>
        <div className="page-title">Recurring &amp; subscriptions</div>
        <div className="page-subtitle">
          Every repeating charge we found in your accounts — so nothing bills you by surprise.
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ padding: 28, textAlign: "center" }}>
          <div className="page-subtitle">Scanning your transactions…</div>
        </div>
      ) : sorted.length === 0 ? (
        <div className="card" style={{ padding: 28, textAlign: "center" }}>
          <i className="ti ti-receipt-off" style={{ fontSize: 34, color: "var(--tv-forest, #2f7a5b)" }} />
          <div className="page-title" style={{ fontSize: 18, marginTop: 10 }}>No recurring charges yet</div>
          <div className="page-subtitle" style={{ marginBottom: 16 }}>
            {error
              ? error
              : "Once you've got a few months of linked transactions, your subscriptions and bills show up here automatically."}
          </div>
          <button className="btn btn-primary" onClick={() => navigate("/accounts")}>
            <i className="ti ti-plus" /> Link accounts
          </button>
        </div>
      ) : (
        <>
          {/* Headline "aha" numbers */}
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: 18 }}>
            <div className="kpi-card" style={{ "--kpi-accent": "var(--tv-gold, #c9973a)" }}>
              <div className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>You're spending about</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{currency0(monthlyTotal)}<span style={{ fontSize: 15, fontWeight: 500 }}>/mo</span></div>
              <div className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>on {sorted.length} recurring charge{sorted.length === 1 ? "" : "s"}</div>
            </div>
            <div className="kpi-card" style={{ "--kpi-accent": "#7a5bd6" }}>
              <div className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>That's</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{currency0(annualTotal)}<span style={{ fontSize: 15, fontWeight: 500 }}>/yr</span></div>
              <div className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>Cancel one you forgot and it adds up fast.</div>
            </div>
          </div>

          {/* Subscription list */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {sorted.map((b, i) => {
              const due = b.inDays;
              const dueStr =
                due == null ? "" : due <= 0 ? "Due today" : due === 1 ? "Tomorrow" : `in ${due} days`;
              const soon = due != null && due <= 5;
              return (
                <div
                  key={`${b.name}-${i}`}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
                    borderBottom: i < sorted.length - 1 ? "1px solid var(--tv-border, rgba(0,0,0,.06))" : "none",
                  }}
                >
                  <span style={{ display: "inline-flex", width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 10, background: "rgba(201,151,58,.14)", color: "var(--tv-gold, #c9973a)", flex: "0 0 auto" }}>
                    <i className="ti ti-repeat" style={{ fontSize: 18 }} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.name}</div>
                    <div className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>
                      {cadenceLabel(b.cadence)} · seen {b.occurrences}×
                      {b.nextDate ? <> · next {formatDate(b.nextDate)}</> : null}
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

          <div className="page-subtitle" style={{ fontSize: 12, marginTop: 12 }}>
            Detected from your transaction history. Amounts are the typical (median) charge; a subscription
            you cancelled will drop off once it stops appearing.
          </div>
        </>
      )}
    </div>
  );
}
