import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { currency } from "../utils/format";

const STEPS = [
  { label: "Payee", icon: "1" },
  { label: "Amount", icon: "2" },
  { label: "Funding", icon: "3" },
  { label: "Review", icon: "4" },
  { label: "Done", icon: "5" },
];

const PAYEE_TYPES = [
  { value: "UTILITY", label: "Utility" },
  { value: "LOAN", label: "Loan / Mortgage" },
  { value: "CREDIT_CARD", label: "Credit card" },
  { value: "PERSON", label: "Person" },
  { value: "OTHER", label: "Other" },
];

// ---- small display helpers -------------------------------------------------
const mask4 = (acc) =>
  String(acc?.account_number || acc?.mask || acc?.id || "").slice(-4);
const acctLabel = (acc) =>
  acc ? `${acc.institution || ""} ${acc.name || ""}`.trim() || "Account" : "";
const fundingBalanceOf = (acc) => Number(acc?.available ?? acc?.balance ?? 0);

function StatusBadge({ status }) {
  const map = {
    COMPLETED: { cls: "badge-green", icon: "ti ti-circle-check", label: "Completed" },
    SCHEDULED: { cls: "badge-gold", icon: "ti ti-calendar", label: "Scheduled" },
    PROCESSING: { cls: "badge-amber", icon: "ti ti-loader", label: "Processing" },
    PENDING: { cls: "badge-amber", icon: "ti ti-clock", label: "Pending" },
    FAILED: { cls: "badge-red", icon: "ti ti-alert-triangle", label: "Failed" },
    CANCELED: { cls: "badge-gray", icon: "ti ti-ban", label: "Canceled" },
  };
  const m = map[status] || { cls: "badge-gray", icon: "ti ti-help", label: status || "—" };
  return <span className={`badge ${m.cls}`}><i className={m.icon}></i> {m.label}</span>;
}

export default function BillPayPage({
  step,
  setStep,
  creditCards = [],
  fundingAccounts = [],
  billPayForm,
  setBillPayForm,
  paymentIntents = [],
  onSubmit,
  onStartOver,
  onCancelIntent,
  submitting = false,
  lastIntent = null,
  formatDate,
}) {
  const navigate = useNavigate();
  const [authorized, setAuthorized] = useState(false);
  const [cancelingId, setCancelingId] = useState(null);

  // Always start a fresh visit at step 0.
  useEffect(() => { setStep(0); /* eslint-disable-next-line */ }, []);

  const update = (field, value) => setBillPayForm((p) => ({ ...p, [field]: value }));

  const isCard = billPayForm.payee_kind === "card";
  const selectedCard = creditCards.find((c) => c.id === billPayForm.card_account_id);
  const selectedFunding = fundingAccounts.find((f) => f.id === billPayForm.funding_account_id);
  const amount = Number(billPayForm.amount) || 0;
  const fundingBalance = fundingBalanceOf(selectedFunding);
  const insufficient = !!selectedFunding && amount > fundingBalance;

  const today = new Date().toISOString().slice(0, 10);
  const isScheduled = billPayForm.scheduled_date && billPayForm.scheduled_date > today;

  // Per-step validation that gates the Next button.
  const stepValid = (s) => {
    if (s === 0) return isCard ? !!billPayForm.card_account_id : !!billPayForm.payee_name?.trim();
    if (s === 1) return amount > 0;
    if (s === 2) return !!billPayForm.funding_account_id && !insufficient;
    if (s === 3) return authorized && !insufficient && amount > 0 && !!billPayForm.funding_account_id;
    return true;
  };

  const next = () => { if (stepValid(step)) setStep(Math.min(step + 1, STEPS.length - 1)); };
  const back = () => setStep(Math.max(step - 1, 0));

  // ---- Upcoming-bill reminders (credit cards with a due date / minimum payment) ----
  const daysUntil = (iso) => {
    if (!iso) return null;
    const due = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(due.getTime())) return null;
    const t = new Date(); t.setHours(0, 0, 0, 0);
    return Math.round((due - t) / 86400000);
  };
  const dueCards = creditCards
    .filter((c) => c.nextPaymentDueDate || c.minPayment != null)
    .map((c) => ({ ...c, days: daysUntil(c.nextPaymentDueDate) }))
    .sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999));

  // Jump straight into the wizard to pay a specific card (preselects + suggests min due).
  const payCard = (c) => {
    setBillPayForm((p) => ({
      ...p,
      payee_kind: "card",
      card_account_id: c.id,
      amount: c.minPayment != null ? c.minPayment : (c.lastStatementBalance ?? c.balance ?? ""),
    }));
    setStep(0);
  };

  // Quick-amount chips when paying a card. Prefer the real statement balance from
  // Plaid Liabilities for the "statement balance" chip; fall back to current balance.
  const cardBalance = Number(selectedCard?.balance || 0);
  const statementBalance = selectedCard?.lastStatementBalance != null
    ? Number(selectedCard.lastStatementBalance)
    : cardBalance;
  const minDue = selectedCard?.minPayment != null
    ? Number(selectedCard.minPayment)
    : Math.max(25, Math.round(cardBalance * 0.02));

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Pay a Bill</div>
          <div className="page-subtitle">Move money to a card or biller — securely</div>
        </div>
        {step < 4 && (
          <div className="page-actions">
            <button className="btn btn-secondary btn-sm" onClick={() => navigate("/")}>
              <i className="ti ti-x"></i> Cancel
            </button>
          </div>
        )}
      </div>

      {/* Upcoming credit-card bills — reminders, all in one place */}
      {step === 0 && dueCards.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="section-header" style={{ marginBottom: 12 }}>
            <div className="section-title" style={{ marginBottom: 0 }}>
              <i className="ti ti-bell-ringing" style={{ color: "var(--tv-gold)", marginRight: 6 }}></i>
              Upcoming bills
            </div>
            <span style={{ fontSize: 12.5, color: "var(--tv-text-muted)" }}>
              {dueCards.length} card{dueCards.length === 1 ? "" : "s"}
            </span>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {dueCards.map((c) => {
              const overdue = c.days != null && c.days < 0;
              const soon = c.days != null && c.days >= 0 && c.days <= 7;
              const tone = overdue ? "var(--tv-negative)" : soon ? "#B7791F" : "var(--tv-text-muted)";
              const whenText =
                c.days == null ? "Payment due"
                  : overdue ? `${Math.abs(c.days)} days overdue`
                  : c.days === 0 ? "Due today"
                  : `Due in ${c.days} day${c.days === 1 ? "" : "s"}`;
              return (
                <div key={c.id} className="list-item" style={{ alignItems: "center" }}>
                  <div className="item-icon icon-red" style={{ width: 40, height: 40, fontSize: 19 }}>
                    <i className="ti ti-credit-card"></i>
                  </div>
                  <div className="item-main">
                    <div className="item-name">{acctLabel(c)} ····{mask4(c)}</div>
                    <div className="item-sub" style={{ color: tone, fontWeight: overdue || soon ? 600 : 400 }}>
                      {whenText}
                      {c.nextPaymentDueDate ? ` · ${formatDate(new Date(`${c.nextPaymentDueDate}T00:00:00`))}` : ""}
                      {c.minPayment != null ? ` · min ${currency(c.minPayment)}` : ""}
                    </div>
                  </div>
                  <div className="item-right" style={{ marginRight: 12, textAlign: "right" }}>
                    <div style={{ fontSize: 11.5, color: "var(--tv-text-muted)" }}>Balance</div>
                    <div style={{ fontWeight: 600 }}>{currency(c.lastStatementBalance ?? c.balance)}</div>
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={() => payCard(c)}>
                    <i className="ti ti-bolt"></i> Pay
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Stepper */}
      <div className="stepper" style={{ maxWidth: 640, marginBottom: 20 }}>
        {STEPS.map((s, idx) => (
          <React.Fragment key={idx}>
            <div className={`step ${idx < step ? "done" : ""} ${idx === step ? "active" : ""}`}>
              <div className="step-circle">
                {idx < step ? <i className="ti ti-check" style={{ fontSize: 14 }}></i> : s.icon}
              </div>
              <div className="step-label">{s.label}</div>
            </div>
            {idx < STEPS.length - 1 && <div className={`step-line ${idx < step ? "done" : ""}`}></div>}
          </React.Fragment>
        ))}
      </div>

      {/* ---------------- STEP 0 — Payee ---------------- */}
      {step === 0 && (
        <div className="card" style={{ maxWidth: 720 }}>
          <div className="section-title">Who are you paying?</div>
          <div className="seg-control" style={{ marginBottom: 18 }}>
            <button className={`seg-btn ${isCard ? "active" : ""}`} onClick={() => update("payee_kind", "card")}>
              <i className="ti ti-credit-card"></i> Pay a credit card
            </button>
            <button className={`seg-btn ${!isCard ? "active" : ""}`} onClick={() => update("payee_kind", "external")}>
              <i className="ti ti-building-store"></i> Pay a biller
            </button>
          </div>

          {isCard ? (
            creditCards.length === 0 ? (
              <div className="empty-state">
                <i className="ti ti-credit-card-off"></i>
                <p>No credit cards linked yet. Link an account to pay a card, or pay a biller instead.</p>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {creditCards.map((c) => {
                  const active = billPayForm.card_account_id === c.id;
                  const util = c.creditLimit ? Math.round((Number(c.balance) / Number(c.creditLimit)) * 100) : null;
                  return (
                    <button key={c.id} type="button" onClick={() => update("card_account_id", c.id)}
                      style={{
                        textAlign: "left", display: "flex", alignItems: "center", gap: 14, padding: "14px 16px",
                        border: `1.5px solid ${active ? "var(--tv-forest)" : "var(--tv-border)"}`,
                        background: active ? "var(--tv-sage-pale)" : "var(--tv-card)",
                        borderRadius: "var(--radius-md)", cursor: "pointer",
                      }}>
                      <div className="item-icon icon-blue" style={{ width: 42, height: 42, fontSize: 20 }}><i className="ti ti-credit-card"></i></div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600 }}>{acctLabel(c)} ····{mask4(c)}</div>
                        <div style={{ fontSize: 12.5, color: "var(--tv-text-muted)" }}>
                          Balance {currency(c.balance)}{util != null ? ` · ${util}% utilization` : ""}
                        </div>
                      </div>
                      {active && <i className="ti ti-circle-check" style={{ color: "var(--tv-forest)", fontSize: 22 }}></i>}
                    </button>
                  );
                })}
              </div>
            )
          ) : (
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Payee name</label>
                <input className="form-input" placeholder="e.g. City Water Utility"
                  value={billPayForm.payee_name} onChange={(e) => update("payee_name", e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Payee type</label>
                <select className="form-select" value={billPayForm.payee_type} onChange={(e) => update("payee_type", e.target.value)}>
                  {PAYEE_TYPES.filter((t) => t.value !== "CREDIT_CARD").map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
            <button className="btn btn-primary" disabled={!stepValid(0)} onClick={next}>
              Continue <i className="ti ti-arrow-right"></i>
            </button>
          </div>
        </div>
      )}

      {/* ---------------- STEP 1 — Amount ---------------- */}
      {step === 1 && (
        <div className="card" style={{ maxWidth: 720 }}>
          <div className="section-title">How much?</div>
          {isCard && selectedCard && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => update("amount", minDue)}>Minimum {currency(minDue)}</button>
              <button className="btn btn-secondary btn-sm" onClick={() => update("amount", statementBalance)}>Statement balance {currency(statementBalance)}</button>
            </div>
          )}
          <div className="form-group" style={{ maxWidth: 280 }}>
            <label className="form-label">Payment amount (USD)</label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--tv-text-muted)", fontSize: 18 }}>$</span>
              <input className="form-input" type="number" min="0" step="0.01" autoFocus
                style={{ paddingLeft: 26, fontSize: 20, height: 48, fontFamily: "var(--font-display)" }}
                value={billPayForm.amount} onChange={(e) => update("amount", e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18 }}>
            <button className="btn btn-secondary" onClick={back}><i className="ti ti-arrow-left"></i> Back</button>
            <button className="btn btn-primary" disabled={!stepValid(1)} onClick={next}>Continue <i className="ti ti-arrow-right"></i></button>
          </div>
        </div>
      )}

      {/* ---------------- STEP 2 — Funding ---------------- */}
      {step === 2 && (
        <div className="card" style={{ maxWidth: 720 }}>
          <div className="section-title">Pay from which account?</div>
          {fundingAccounts.length === 0 ? (
            <div className="empty-state"><i className="ti ti-building-bank"></i><p>No checking or savings account linked to fund this payment.</p></div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {fundingAccounts.map((f) => {
                const active = billPayForm.funding_account_id === f.id;
                const bal = fundingBalanceOf(f);
                const tooLow = amount > bal;
                return (
                  <button key={f.id} type="button" onClick={() => update("funding_account_id", f.id)}
                    style={{
                      textAlign: "left", display: "flex", alignItems: "center", gap: 14, padding: "14px 16px",
                      border: `1.5px solid ${active ? "var(--tv-forest)" : "var(--tv-border)"}`,
                      background: active ? "var(--tv-sage-pale)" : "var(--tv-card)",
                      borderRadius: "var(--radius-md)", cursor: "pointer",
                    }}>
                    <div className="item-icon icon-forest" style={{ width: 42, height: 42, fontSize: 20 }}><i className="ti ti-building-bank"></i></div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{acctLabel(f)} ····{mask4(f)}</div>
                      <div style={{ fontSize: 12.5, color: tooLow ? "var(--tv-negative)" : "var(--tv-text-muted)" }}>
                        Available {currency(bal)}{tooLow ? " · not enough to cover this payment" : ""}
                      </div>
                    </div>
                    {active && <i className="ti ti-circle-check" style={{ color: "var(--tv-forest)", fontSize: 22 }}></i>}
                  </button>
                );
              })}
            </div>
          )}
          {insufficient && (
            <div style={{ marginTop: 14, padding: "10px 12px", background: "var(--tv-negative-bg)", color: "var(--tv-negative)", borderRadius: "var(--radius-md)", fontSize: 13 }}>
              <i className="ti ti-alert-triangle"></i> This account's available balance ({currency(fundingBalance)}) is less than {currency(amount)}. Choose another account or lower the amount.
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18 }}>
            <button className="btn btn-secondary" onClick={back}><i className="ti ti-arrow-left"></i> Back</button>
            <button className="btn btn-primary" disabled={!stepValid(2)} onClick={next}>Review <i className="ti ti-arrow-right"></i></button>
          </div>
        </div>
      )}

      {/* ---------------- STEP 3 — Review & schedule ---------------- */}
      {step === 3 && (
        <div className="grid-2">
          <div className="card">
            <div className="section-title">Review your payment</div>

            <div className="list-item">
              <div className="item-icon icon-blue" style={{ width: 40, height: 40, fontSize: 20 }}><i className={isCard ? "ti ti-credit-card" : "ti ti-building-store"}></i></div>
              <div className="item-main"><div className="item-name">Paying</div><div className="item-sub">{isCard ? "Credit card" : (PAYEE_TYPES.find(t => t.value === billPayForm.payee_type)?.label || "Biller")}</div></div>
              <div className="item-right"><div style={{ fontSize: 14, fontWeight: 600 }}>{isCard ? `${acctLabel(selectedCard)} ····${mask4(selectedCard)}` : billPayForm.payee_name}</div></div>
            </div>
            <div className="list-item">
              <div className="item-icon icon-green" style={{ width: 40, height: 40, fontSize: 20 }}><i className="ti ti-currency-dollar"></i></div>
              <div className="item-main"><div className="item-name">Amount</div></div>
              <div className="item-right"><div style={{ fontSize: 18, fontWeight: 600, fontFamily: "var(--font-display)" }}>{currency(amount)}</div></div>
            </div>
            <div className="list-item">
              <div className="item-icon icon-forest" style={{ width: 40, height: 40, fontSize: 20 }}><i className="ti ti-building-bank"></i></div>
              <div className="item-main"><div className="item-name">Fund from</div><div className="item-sub">Available: {currency(fundingBalance)}</div></div>
              <div className="item-right"><div style={{ fontSize: 14, fontWeight: 600 }}>{acctLabel(selectedFunding)} ····{mask4(selectedFunding)}</div></div>
            </div>

            <hr className="divider" />

            {/* Schedule */}
            <div className="form-group">
              <label className="form-label">When?</label>
              <div className="seg-control" style={{ marginBottom: 10 }}>
                <button className={`seg-btn ${!isScheduled ? "active" : ""}`} onClick={() => update("scheduled_date", "")}><i className="ti ti-bolt"></i> Pay now</button>
                <button className={`seg-btn ${isScheduled ? "active" : ""}`} onClick={() => update("scheduled_date", billPayForm.scheduled_date || new Date(Date.now() + 86400000).toISOString().slice(0, 10))}><i className="ti ti-calendar"></i> Schedule</button>
              </div>
              {isScheduled && (
                <input className="form-input" type="date" min={today} style={{ maxWidth: 220 }}
                  value={billPayForm.scheduled_date} onChange={(e) => update("scheduled_date", e.target.value)} />
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Memo (optional)</label>
              <input className="form-input" placeholder="e.g. June statement"
                value={billPayForm.memo} onChange={(e) => update("memo", e.target.value)} />
            </div>

            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, paddingTop: 4, cursor: "pointer" }} onClick={() => setAuthorized((a) => !a)}>
              <div className={`tv-checkbox ${authorized ? "checked" : ""}`}>{authorized && <i className="ti ti-check"></i>}</div>
              <p style={{ fontSize: 12.5, color: "var(--tv-text-muted)", lineHeight: 1.6 }}>
                I authorize this payment and agree to the <a style={{ color: "var(--tv-forest-light)", fontWeight: 500 }}>Terms of Service</a>, and authorize the bank to debit my account on the settlement date.
              </p>
            </div>
          </div>

          {/* Summary sidebar */}
          <div>
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="section-title">Payment summary</div>
              {[["Paying", isCard ? `····${mask4(selectedCard)}` : billPayForm.payee_name],
                ["Amount", currency(amount)],
                ["Payment fee", "$0.00"]].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, padding: "7px 0", borderBottom: "1px solid var(--tv-border-light)" }}>
                  <span style={{ color: "var(--tv-text-muted)" }}>{k}</span><span style={{ fontWeight: 500 }}>{v}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 700, padding: "10px 0", borderBottom: "1px solid var(--tv-border-light)" }}>
                <span>Total</span><span style={{ color: "var(--tv-forest)", fontFamily: "var(--font-display)" }}>{currency(amount)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "7px 0" }}>
                <span style={{ color: "var(--tv-text-muted)" }}>{isScheduled ? "Scheduled for" : "Settlement"}</span>
                <span>{isScheduled ? formatDate(new Date(billPayForm.scheduled_date)) : "1–3 business days"}</span>
              </div>
            </div>
            {insufficient && (
              <div style={{ marginBottom: 10, padding: "10px 12px", background: "var(--tv-negative-bg)", color: "var(--tv-negative)", borderRadius: "var(--radius-md)", fontSize: 13 }}>
                <i className="ti ti-alert-triangle"></i> Funding account no longer covers this amount.
              </div>
            )}
            <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", padding: 13, fontSize: 15 }}
              onClick={onSubmit} disabled={submitting || !stepValid(3)}>
              <i className={`ti ${submitting ? "ti-loader spin" : "ti-lock"}`}></i>
              {submitting ? "Processing…" : isScheduled ? "Schedule Payment" : "Confirm & Pay"}
            </button>
            <button className="btn btn-secondary" style={{ width: "100%", justifyContent: "center", padding: 12, marginTop: 8 }} onClick={back}>Back</button>
            <div style={{ textAlign: "center", marginTop: 12, fontSize: 12, color: "var(--tv-text-muted)" }}>
              <i className="ti ti-shield-check" style={{ color: "var(--tv-positive)", marginRight: 4 }}></i>
              256-bit encrypted · idempotency-protected
            </div>
          </div>
        </div>
      )}

      {/* ---------------- STEP 4 — Done ---------------- */}
      {step === 4 && (
        <div className="card" style={{ maxWidth: 560, margin: "0 auto" }}>
          <div className="empty-state">
            <i className="ti ti-circle-check" style={{ color: "var(--tv-positive)", fontSize: 56 }}></i>
            <p style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
              {lastIntent?.status === "SCHEDULED" ? "Payment scheduled!" : "Payment submitted!"}
            </p>
            <p style={{ color: "var(--tv-text-muted)", marginBottom: 16 }}>
              {lastIntent?.status === "SCHEDULED"
                ? `We'll send ${currency(lastIntent?.amount || amount)} to ${lastIntent?.payee || "your payee"} on ${lastIntent?.scheduled_date ? formatDate(new Date(lastIntent.scheduled_date)) : "the scheduled date"}.`
                : `${currency(lastIntent?.amount || amount)} to ${lastIntent?.payee || "your payee"} is on its way.`}
            </p>
            {lastIntent?.confirmation_number && (
              <div style={{ display: "inline-flex", flexDirection: "column", gap: 4, padding: "12px 20px", background: "var(--tv-sage-pale)", borderRadius: "var(--radius-md)", marginBottom: 18 }}>
                <span style={{ fontSize: 11.5, color: "var(--tv-text-muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>Confirmation number</span>
                <span style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-display)", color: "var(--tv-forest)" }}>{lastIntent.confirmation_number}</span>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button className="btn btn-secondary" onClick={onStartOver}><i className="ti ti-plus"></i> Make another payment</button>
              <button className="btn btn-primary" onClick={() => navigate("/")}><i className="ti ti-home"></i> Back to Home</button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Payment history ---------------- */}
      {step < 4 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="section-header" style={{ marginBottom: 0 }}>
            <div className="section-title">Recent payments</div>
            <span style={{ fontSize: 12.5, color: "var(--tv-text-muted)" }}>{paymentIntents.length} total</span>
          </div>
          {paymentIntents.length === 0 ? (
            <div className="empty-state"><i className="ti ti-receipt"></i><p>No payments yet. Complete the steps above to make your first one.</p></div>
          ) : (
            <div className="table-scroll">
              <table className="tv-table" style={{ marginTop: 14 }}>
                <thead><tr><th>Payee</th><th>Amount</th><th>Status</th><th>Date</th><th>Confirmation</th><th></th></tr></thead>
                <tbody>
                  {paymentIntents.map((p) => {
                    const canCancel = p.status === "SCHEDULED" || p.status === "PENDING";
                    return (
                      <tr key={p.intent_id}>
                        <td>{p.payee || "—"}</td>
                        <td style={{ fontWeight: 600 }}>{currency(p.amount)}</td>
                        <td><StatusBadge status={p.status} /></td>
                        <td>{formatDate(new Date(p.scheduled_date || p.created_at))}</td>
                        <td style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 12.5, color: "var(--tv-text-muted)" }}>{p.confirmation_number || "—"}</td>
                        <td>
                          {canCancel ? (
                            <button className="btn btn-secondary btn-sm" disabled={cancelingId === p.intent_id}
                              onClick={async () => { setCancelingId(p.intent_id); try { await onCancelIntent(p.intent_id); } finally { setCancelingId(null); } }}>
                              {cancelingId === p.intent_id ? "Canceling…" : "Cancel"}
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
