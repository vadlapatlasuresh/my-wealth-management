import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { currency, currency0 } from "../utils/format";
import { deriveUpcomingBills } from "../utils/netWorth";
import { monthlyBuckets, averages, safeToSpend } from "../utils/cashflow";

/* CashFlowPage — money in vs out over time + an honest "safe to spend" number (Phase 2).
   Computed client-side from linked accounts, transactions and scheduled bills.
   feature_key: individual.cashflow. No mock data — empty history renders an empty state. */

function liquidCash(accounts = []) {
  return (accounts || [])
    .filter((a) => (a.type || "").toLowerCase() === "depository")
    .reduce((s, a) => s + (Number(a.currentBalance ?? a.balance ?? 0) || 0), 0);
}

// A compact grouped bar chart: income vs spend per month, with a net line read below.
function CashFlowChart({ buckets }) {
  const max = Math.max(1, ...buckets.map((b) => Math.max(b.income, b.spend)));
  const H = 150;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: H, padding: "8px 4px" }}>
      {buckets.map((b) => {
        const inH = Math.round((b.income / max) * (H - 26));
        const outH = Math.round((b.spend / max) * (H - 26));
        return (
          <div key={b.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 0 }}>
            <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 3, width: "100%", justifyContent: "center" }}>
              <div title={`In ${currency0(b.income)}`} style={{ width: "42%", maxWidth: 18, height: inH, borderRadius: "4px 4px 0 0", background: "var(--tv-forest, #2f7a5b)" }} />
              <div title={`Out ${currency0(b.spend)}`} style={{ width: "42%", maxWidth: 18, height: outH, borderRadius: "4px 4px 0 0", background: "var(--tv-gold, #c9973a)" }} />
            </div>
            <div className="page-subtitle" style={{ margin: 0, fontSize: 11 }}>{b.label}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function CashFlowPage({ accounts = [], transactions = [], paymentIntents = [] }) {
  const navigate = useNavigate();

  const buckets = useMemo(() => monthlyBuckets(transactions, 6), [transactions]);
  const { avgIncome, avgSpend, avgNet } = useMemo(() => averages(buckets), [buckets]);
  const cash = useMemo(() => liquidCash(accounts), [accounts]);
  const upcomingTotal = useMemo(
    () => deriveUpcomingBills(paymentIntents).reduce((s, b) => s + (b.amount || 0), 0),
    [paymentIntents]
  );
  const sts = safeToSpend(cash, upcomingTotal);

  const hasData = buckets.some((b) => b.income > 0 || b.spend > 0);
  const netPositive = avgNet >= 0;

  return (
    <div className="page active">
      <div style={{ marginBottom: 18 }}>
        <div className="page-title">Cash flow</div>
        <div className="page-subtitle">What's coming in, what's going out, and what's safe to spend.</div>
      </div>

      {!hasData ? (
        <div className="card" style={{ padding: 28, textAlign: "center" }}>
          <i className="ti ti-arrows-exchange" style={{ fontSize: 34, color: "var(--tv-forest, #2f7a5b)" }} />
          <div className="page-title" style={{ fontSize: 18, marginTop: 10 }}>No cash flow yet</div>
          <div className="page-subtitle" style={{ marginBottom: 16 }}>
            Once you have a few months of linked transactions, your income and spending trends appear here.
          </div>
          <button className="btn btn-primary" onClick={() => navigate("/accounts")}>
            <i className="ti ti-plus" /> Link accounts
          </button>
        </div>
      ) : (
        <>
          {/* Safe-to-spend headline */}
          <div className="card" style={{ padding: 18, marginBottom: 18, display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ display: "inline-flex", width: 46, height: 46, alignItems: "center", justifyContent: "center", borderRadius: 12, background: sts >= 0 ? "var(--tv-positive-bg)" : "var(--tv-negative-bg)", color: sts >= 0 ? "var(--tv-forest, #2f7a5b)" : "var(--tv-red, #c0392b)", flex: "0 0 auto" }}>
              <i className="ti ti-wallet" style={{ fontSize: 22 }} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>Safe to spend right now</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: sts >= 0 ? "inherit" : "var(--tv-red, #c0392b)" }}>{currency0(sts)}</div>
              <div className="page-subtitle" style={{ margin: 0, fontSize: 12 }}>
                {currency0(cash)} cash − {currency0(upcomingTotal)} scheduled bills
              </div>
            </div>
          </div>

          {/* In / out / net averages */}
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", marginBottom: 18 }}>
            <div className="kpi-card" style={{ "--kpi-accent": "var(--tv-forest, #2f7a5b)" }}>
              <div className="page-subtitle" style={{ margin: 0, fontSize: 12 }}>Avg money in</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--tv-forest, #2f7a5b)" }}>{currency0(avgIncome)}<span style={{ fontSize: 13, fontWeight: 500 }}>/mo</span></div>
            </div>
            <div className="kpi-card" style={{ "--kpi-accent": "var(--tv-gold, #c9973a)" }}>
              <div className="page-subtitle" style={{ margin: 0, fontSize: 12 }}>Avg money out</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--tv-gold, #c9973a)" }}>{currency0(avgSpend)}<span style={{ fontSize: 13, fontWeight: 500 }}>/mo</span></div>
            </div>
            <div className="kpi-card" style={{ "--kpi-accent": netPositive ? "var(--tv-forest, #2f7a5b)" : "var(--tv-red, #c0392b)" }}>
              <div className="page-subtitle" style={{ margin: 0, fontSize: 12 }}>Avg net</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: netPositive ? "var(--tv-forest, #2f7a5b)" : "var(--tv-red, #c0392b)" }}>
                {netPositive ? "+" : "−"}{currency0(Math.abs(avgNet))}<span style={{ fontSize: 13, fontWeight: 500 }}>/mo</span>
              </div>
            </div>
          </div>

          {/* Trend chart */}
          <div className="card" style={{ padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div className="page-title" style={{ fontSize: 16, margin: 0 }}>Last 6 months</div>
              <div style={{ display: "flex", gap: 12, fontSize: 12 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--tv-forest, #2f7a5b)" }} /> In</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--tv-gold, #c9973a)" }} /> Out</span>
              </div>
            </div>
            <CashFlowChart buckets={buckets} />
          </div>

          <div className="page-subtitle" style={{ fontSize: 12, marginTop: 12 }}>
            An estimate for guidance, not financial advice. "Safe to spend" subtracts only bills we can see scheduled.
          </div>
        </>
      )}
    </div>
  );
}
