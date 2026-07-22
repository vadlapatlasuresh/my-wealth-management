import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { currency, currency0, greeting, formatDateTime } from "../utils/format";
import { deriveUpcomingBills } from "../utils/netWorth";
import { computeHealthScore } from "../utils/healthScore";
import { detectAlerts } from "../utils/alerts";

/* TodayPage — the daily-open surface (Phase 1 of the personal-finance expansion).
   Deliberately a *composition* of data the app already loads (snapshot, accounts,
   transactions, scheduled payments, insights) rather than a new backend: it turns
   the existing numbers into "what changed and what needs you today." Every field is
   read defensively so an empty/loading account renders a calm empty state, never a
   crash. Feature key: individual.todayFeed (Free tier). */

const LOW_CASH_FLOOR = 200; // below this available cash we surface a heads-up

// Net worth can arrive under a few shapes depending on the snapshot source; try the
// known keys, then fall back to summing linked account balances so the tile is never blank.
function readNetWorth(snapshot, accounts) {
  const s = snapshot || {};
  const direct =
    s.netWorth ?? s.totalNetWorth ?? s.total ?? s.net_worth ?? null;
  if (direct != null && !Number.isNaN(Number(direct))) return Number(direct);
  return (accounts || []).reduce((sum, a) => {
    const bal = Number(a.currentBalance ?? a.balance ?? 0) || 0;
    const isDebt = ["credit", "loan"].includes((a.type || "").toLowerCase());
    return sum + (isDebt ? -bal : bal);
  }, 0);
}

// Spendable cash = sum of depository (checking/savings) balances.
function readAvailableCash(accounts) {
  return (accounts || [])
    .filter((a) => (a.type || "").toLowerCase() === "depository")
    .reduce((sum, a) => sum + (Number(a.currentBalance ?? a.balance ?? 0) || 0), 0);
}

function txLabel(t) {
  return t.name || t.description || t.merchant || "Transaction";
}

function healthColor(score) {
  if (score >= 80) return "var(--tv-forest, #2f7a5b)";
  if (score >= 60) return "#3f8f6f";
  if (score >= 40) return "var(--tv-gold, #c9973a)";
  return "var(--tv-red, #c0392b)";
}

export default function TodayPage({
  snapshot,
  accounts = [],
  transactions = [],
  paymentIntents = [],
  insights = [],
  user,
  formatDate,
}) {
  const navigate = useNavigate();
  const [now, setNow] = useState(() => new Date());

  // Tick at each minute boundary so the greeting/clock stay accurate cheaply.
  useEffect(() => {
    let timer;
    const schedule = () => {
      const msToNext = 60000 - (Date.now() % 60000);
      timer = setTimeout(() => { setNow(new Date()); schedule(); }, msToNext + 50);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);

  const name = user?.name || (user?.email ? user.email.split("@")[0] : "there");
  const { dateStr, timeStr } = formatDateTime(now, {});

  const netWorth = useMemo(() => readNetWorth(snapshot, accounts), [snapshot, accounts]);
  const cash = useMemo(() => readAvailableCash(accounts), [accounts]);
  const upcomingBills = useMemo(
    () => deriveUpcomingBills(paymentIntents, formatDate),
    [paymentIntents, formatDate]
  );
  const billsTotal = useMemo(
    () => upcomingBills.reduce((s, b) => s + (b.amount || 0), 0),
    [upcomingBills]
  );

  const recent = useMemo(() => {
    return [...(transactions || [])]
      .sort((a, b) => {
        const ta = a.date ? new Date(a.date).getTime() : 0;
        const tb = b.date ? new Date(b.date).getTime() : 0;
        return tb - ta;
      })
      .slice(0, 6);
  }, [transactions]);

  // Smart alerts (anomaly detection) from the same data — surfaced here and on /alerts.
  const alerts = useMemo(() => detectAlerts({ accounts, transactions }), [accounts, transactions]);

  // "Needs you today" — an honest, prioritized action list built from real state.
  const needs = useMemo(() => {
    const items = [];
    const now7 = Date.now() + 7 * 24 * 3600 * 1000;
    const soon = upcomingBills.filter((b) => b.dueTs && b.dueTs <= now7);
    if (soon.length) {
      const total = soon.reduce((s, b) => s + (b.amount || 0), 0);
      items.push({
        icon: "ti ti-receipt",
        tone: "amber",
        text: `${soon.length} bill${soon.length === 1 ? "" : "s"} due within 7 days — ${currency0(total)}`,
        cta: "Review",
        onClick: () => navigate("/make-payment"),
      });
    }
    if (accounts.length && cash < LOW_CASH_FLOOR) {
      items.push({
        icon: "ti ti-alert-triangle",
        tone: "red",
        text: `Available cash is low (${currency(cash)}).`,
        cta: "See accounts",
        onClick: () => navigate("/accounts"),
      });
    }
    // Top 2 smart alerts (skip the low-balance one — already covered above).
    alerts.filter((a) => !a.key.startsWith("low-")).slice(0, 2).forEach((a) => {
      items.push({
        icon: a.icon,
        tone: a.tone,
        text: `${a.title}: ${a.detail}`,
        cta: "View",
        onClick: () => navigate("/alerts"),
      });
    });
    // Surface up to two AI/system insights if present.
    (insights || []).slice(0, 2).forEach((ins) => {
      const text = typeof ins === "string" ? ins : ins.message || ins.title || ins.text;
      if (text) {
        items.push({
          icon: "ti ti-sparkles",
          tone: "forest",
          text,
          cta: "Ask AI",
          onClick: () => navigate("/ai-assistant"),
        });
      }
    });
    return items;
  }, [upcomingBills, accounts.length, cash, insights, alerts, navigate]);

  const health = useMemo(
    () => computeHealthScore({ accounts, transactions, snapshot }),
    [accounts, transactions, snapshot]
  );

  const noData = !accounts.length && !transactions.length;

  return (
    <div className="page">
      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <div className="page-title">{greeting(now)}, {name}</div>
        <div className="page-subtitle">{dateStr} · {timeStr} — here's what needs you today</div>
      </div>

      {noData ? (
        <div className="card" style={{ padding: 28, textAlign: "center" }}>
          <i className="ti ti-plugged-in" style={{ fontSize: 34, color: "var(--tv-forest, #2f7a5b)" }} />
          <div className="page-title" style={{ fontSize: 18, marginTop: 10 }}>Link an account to begin</div>
          <div className="page-subtitle" style={{ marginBottom: 16 }}>
            Today lights up once your accounts are connected — net worth, upcoming bills and alerts, all in one place.
          </div>
          <button className="btn btn-primary" onClick={() => navigate("/accounts")}>
            <i className="ti ti-plus" /> Link accounts
          </button>
        </div>
      ) : (
        <>
          {/* Financial health score — the daily centerpiece */}
          {health.computable && (
            <div
              className="card kpi-clickable"
              style={{ padding: 16, marginBottom: 18, display: "flex", alignItems: "center", gap: 16, cursor: "pointer" }}
              onClick={() => navigate("/health-score")}
            >
              <div style={{ position: "relative", flex: "0 0 auto", width: 58, height: 58, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: `conic-gradient(${healthColor(health.score)} ${health.score * 3.6}deg, var(--tv-border, rgba(0,0,0,.10)) 0)` }}>
                <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--tv-card, #fff)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 17, color: healthColor(health.score) }}>
                  {health.score}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Financial health: {health.band}</div>
                <div className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>
                  {(health.factors.find((f) => f.score < 60) || {}).action || "You're in good shape — see what's driving your score."}
                </div>
              </div>
              <i className="ti ti-chevron-right" style={{ color: "var(--tv-muted, #7a8a83)", flex: "0 0 auto" }} />
            </div>
          )}

          {/* Quick stats */}
          <div className="kpi-grid" style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 18 }}>
            <StatTile icon="ti ti-scale" accent="var(--tv-forest, #2f7a5b)" label="Net worth" value={currency0(netWorth)} onClick={() => navigate("/")} />
            <StatTile icon="ti ti-wallet" accent="var(--tv-gold, #c9973a)" label="Available cash" value={currency0(cash)} onClick={() => navigate("/accounts")} />
            <StatTile icon="ti ti-receipt" accent="#7a5bd6" label="Bills due soon" value={currency0(billsTotal)} sub={`${upcomingBills.length} scheduled`} onClick={() => navigate("/make-payment")} />
          </div>

          {/* Needs you today */}
          <div className="card" style={{ padding: 18, marginBottom: 18 }}>
            <div className="page-title" style={{ fontSize: 16, marginBottom: 12 }}>Needs you today</div>
            {needs.length === 0 ? (
              <div className="page-subtitle" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <i className="ti ti-circle-check" style={{ color: "var(--tv-forest, #2f7a5b)", fontSize: 18 }} />
                You're all caught up. Nothing needs your attention right now.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {needs.map((n, i) => (
                  <NeedRow key={i} {...n} />
                ))}
              </div>
            )}
          </div>

          {/* Recent activity */}
          <div className="card" style={{ padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div className="page-title" style={{ fontSize: 16, margin: 0 }}>Recent activity</div>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate("/transactions")}>View all</button>
            </div>
            {recent.length === 0 ? (
              <div className="page-subtitle">No transactions yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {recent.map((t, i) => {
                  const amt = Number(t.amount) || 0;
                  const isIn = amt >= 0;
                  return (
                    <div key={t.id || i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: i < recent.length - 1 ? "1px solid var(--tv-border, rgba(0,0,0,.06))" : "none" }}>
                      <i className={isIn ? "ti ti-arrow-down-left" : "ti ti-arrow-up-right"} style={{ color: isIn ? "var(--tv-forest, #2f7a5b)" : "var(--tv-red, #c0392b)", fontSize: 16 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{txLabel(t)}</div>
                        {t.category && <div className="page-subtitle" style={{ fontSize: 12, margin: 0 }}>{t.category}</div>}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: isIn ? "var(--tv-forest, #2f7a5b)" : "inherit" }}>
                        {isIn ? "+" : "-"}{currency(Math.abs(amt))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatTile({ icon, accent, label, value, sub, onClick }) {
  return (
    <div className="kpi-card kpi-clickable" style={{ "--kpi-accent": accent, cursor: "pointer" }} onClick={onClick}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ display: "inline-flex", width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 8, background: accent, color: "#fff" }}>
          <i className={icon} style={{ fontSize: 16 }} />
        </span>
        <span className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
      {sub && <div className="page-subtitle" style={{ margin: 0, fontSize: 12 }}>{sub}</div>}
    </div>
  );
}

function NeedRow({ icon, tone, text, cta, onClick }) {
  const color =
    tone === "red" ? "var(--tv-red, #c0392b)"
    : tone === "amber" ? "var(--tv-gold, #c9973a)"
    : "var(--tv-forest, #2f7a5b)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <i className={icon} style={{ color, fontSize: 18 }} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 13.5 }}>{text}</span>
      {cta && <button className="btn btn-ghost btn-sm" onClick={onClick}>{cta}</button>}
    </div>
  );
}
