import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { currency0 } from "../utils/format";
import { obligationsFromAccounts, mergeRecurring } from "../utils/recurring";
import { optimizeDueDates } from "../utils/billOptimizer";

/* BillOptimizerPage — bill due-date optimizer (Phase 4). Reuses the same recurring-bill
   sources as RecurringPage (detected subscriptions + linked-account obligations) and
   recommends which due dates to shift so outflow is smoother across the month. It only
   suggests — it never moves money or changes a date. feature_key: individual.billOptimizer. */

function Header() {
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="page-title">Bill timing</div>
      <div className="page-subtitle">Smooth your month — move bunched-up due dates so no single stretch drains your cash.</div>
    </div>
  );
}

// A two-bar "before" view of how the month's outflow splits, with a light target line.
function SplitBars({ windows, projected, monthlyTotal }) {
  const max = Math.max(1, ...windows.map((w) => w.total), ...projected.map((p) => p.total));
  return (
    <div style={{ display: "flex", gap: 18 }}>
      {windows.map((w, i) => {
        const now = Math.round((w.total / max) * 100);
        const after = Math.round((projected[i].total / max) * 100);
        const changed = Math.abs(projected[i].total - w.total) > 0.5;
        return (
          <div key={w.label} style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 150 }}>
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{ height: `${now}%`, minHeight: 4, borderRadius: "8px 8px 0 0", background: "var(--tv-gold, #E6B455)" }} title={`Now ${currency0(w.total)}`} />
                <div className="page-subtitle" style={{ margin: "6px 0 0", fontSize: 11 }}>Now</div>
              </div>
              {changed && (
                <div style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ height: `${after}%`, minHeight: 4, borderRadius: "8px 8px 0 0", background: "var(--tv-positive, #3DDC97)" }} title={`After ${currency0(projected[i].total)}`} />
                  <div className="page-subtitle" style={{ margin: "6px 0 0", fontSize: 11 }}>After</div>
                </div>
              )}
            </div>
            <div style={{ textAlign: "center", marginTop: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{w.label}</div>
              <div className="page-subtitle" style={{ margin: 0, fontSize: 12 }}>
                {currency0(w.total)} · {w.count} bill{w.count === 1 ? "" : "s"}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function BillOptimizerPage({ accounts = [] }) {
  const navigate = useNavigate();
  const [detected, setDetected] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await api.getRecurringBills();
        if (alive) { setDetected(Array.isArray(data) ? data : []); setError(""); }
      } catch (e) {
        if (alive) { setError(e?.message || "Couldn't load your bills."); setDetected([]); }
      }
    })();
    return () => { alive = false; };
  }, []);

  const items = useMemo(
    () => mergeRecurring(detected || [], obligationsFromAccounts(accounts)),
    [detected, accounts]
  );
  const plan = useMemo(() => optimizeDueDates(items), [items]);

  const loading = detected === null;

  if (loading) {
    return (
      <div className="page active">
        <Header />
        <div className="card" style={{ padding: 28, textAlign: "center" }}>
          <div className="page-subtitle">Reviewing your bill schedule…</div>
        </div>
      </div>
    );
  }

  if (!plan.hasData) {
    return (
      <div className="page active">
        <Header />
        {error && <div className="card" style={{ padding: 14, marginBottom: 14, color: "var(--tv-negative)" }}>{error}</div>}
        <div className="card" style={{ padding: 28, textAlign: "center" }}>
          <i className="ti ti-calendar-stats" style={{ fontSize: 34, color: "var(--tv-forest)" }} />
          <div className="page-title" style={{ fontSize: 18, marginTop: 10 }}>Not enough bills to optimize yet</div>
          <div className="page-subtitle" style={{ marginBottom: 16 }}>
            {plan.reason === "few-bills"
              ? "We need at least a few recurring bills with due dates before we can smooth your month."
              : "We couldn't read amounts for your recurring bills yet."}
          </div>
          <button className="btn btn-primary" onClick={() => navigate("/recurring")}>
            <i className="ti ti-repeat" /> View recurring bills
          </button>
        </div>
      </div>
    );
  }

  const balanced = plan.suggestions.length === 0;

  return (
    <div className="page active">
      <Header />

      {/* Verdict card */}
      <div className="card" style={{ padding: 20, marginBottom: 18, display: "flex", alignItems: "center", gap: 16 }}>
        <span style={{ display: "inline-flex", width: 46, height: 46, alignItems: "center", justifyContent: "center", borderRadius: 12, flex: "0 0 auto",
          background: balanced ? "var(--tv-positive-bg, rgba(61,220,151,.15))" : "var(--tv-warning-bg, rgba(233,196,106,.15))",
          color: balanced ? "var(--tv-positive)" : "var(--tv-warning)" }}>
          <i className={balanced ? "ti ti-check" : "ti ti-adjustments-alt"} style={{ fontSize: 22 }} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>
            {balanced ? "Your bills are already well spread" : `Your month is ${Math.round(plan.imbalance * 100)}% lopsided`}
          </div>
          <div className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>
            {balanced
              ? `Outflow is balanced across the month (${currency0(plan.monthlyTotal)} total).`
              : `Most of your ${currency0(plan.monthlyTotal)} in bills lands in the ${plan.heavyWindow}. Shifting a few smooths the crunch.`}
          </div>
        </div>
      </div>

      {/* Before / after split */}
      <div className="card" style={{ padding: 18, marginBottom: 18 }}>
        <div className="page-title" style={{ fontSize: 16, marginBottom: 12 }}>Outflow across the month</div>
        <SplitBars windows={plan.windows} projected={plan.projected} monthlyTotal={plan.monthlyTotal} />
      </div>

      {/* Suggestions */}
      {!balanced && (
        <div className="card" style={{ padding: 18, marginBottom: 18 }}>
          <div className="page-title" style={{ fontSize: 16, marginBottom: 12 }}>Suggested moves</div>
          {plan.suggestions.map((s, i) => (
            <div key={s.name + i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: i < plan.suggestions.length - 1 ? "1px solid var(--tv-border-light)" : "none" }}>
              <i className="ti ti-arrow-right" style={{ color: "var(--tv-positive)", fontSize: 18, flex: "0 0 auto" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{s.name}</div>
                <div className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>
                  Move from the {s.fromWindow} (day {s.fromDay}) to around the {s.toDayHint}
                  {s.toDayHint <= 15 ? "th" : "nd"} of the {s.toWindow}.
                </div>
              </div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{currency0(s.amount)}</div>
            </div>
          ))}
          <div className="page-subtitle" style={{ fontSize: 12, marginTop: 12 }}>
            Ask each biller to change your due date — most utilities, cards and loans let you pick a new day online.
            We don't change anything for you.
          </div>
        </div>
      )}

      <div className="page-subtitle" style={{ fontSize: 12 }}>
        A guide to smooth cash flow, not financial advice. Pair it with{" "}
        <button className="btn btn-ghost btn-sm" onClick={() => navigate("/cash-flow")}>Cash flow</button>.
      </div>
    </div>
  );
}
