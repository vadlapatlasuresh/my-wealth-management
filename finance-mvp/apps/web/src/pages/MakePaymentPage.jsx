import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { currency } from "../utils/format";
import PayeeCategoryList from "../components/PayeeCategoryList";
import { STEPS, DONE_STEP } from "../config/makePaymentFlow";
import {
  buildPayeeCategories,
  CATEGORY_CREDIT_CARD,
  categoryById,
  daysUntil,
} from "../utils/payees";

/**
 * Make Payment (formerly "Pay Bills").
 *
 * Step 0 is the categorized "Who are you paying?" selector — every linked credit
 * card, mortgage, student loan and auto loan, grouped under sticky category headers.
 * Step 1 collapses the old Amount + Funding steps into a single payment-entry screen
 * pre-filled from the account the user picked.
 */


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

export default function MakePaymentPage({
  step,
  setStep,
  accounts = [],
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
  const sectionsRef = useRef(null);

  // Always start a fresh visit at step 0.
  useEffect(() => { setStep(0); /* eslint-disable-next-line */ }, []);

  const update = (field, value) => setBillPayForm((p) => ({ ...p, [field]: value }));

  // Every payable linked account, grouped into categories (empty ones dropped).
  const categories = useMemo(() => buildPayeeCategories(accounts), [accounts]);
  const allPayees = useMemo(() => categories.flatMap((c) => c.payees), [categories]);

  const isLinked = billPayForm.payee_kind !== "external";
  // `payee_account_id` supersedes the old card-only `card_account_id`; we read both so
  // a form persisted by the previous Bill Pay build still resolves to the right account.
  const selectedPayeeId = billPayForm.payee_account_id || billPayForm.card_account_id || "";
  const selectedPayee = allPayees.find((p) => p.id === selectedPayeeId) || null;
  const selectedCategory = selectedPayee ? categoryById(selectedPayee.categoryId) : null;

  const selectedFunding = fundingAccounts.find((f) => f.id === billPayForm.funding_account_id);
  const amount = Number(billPayForm.amount) || 0;
  const fundingBalance = fundingBalanceOf(selectedFunding);
  const insufficient = !!selectedFunding && amount > fundingBalance;

  const today = new Date().toISOString().slice(0, 10);
  const isScheduled = billPayForm.scheduled_date && billPayForm.scheduled_date > today;

  const hasCreditCards = categories.some((c) => c.id === CATEGORY_CREDIT_CARD);

  // Per-step validation that gates the Next button.
  const stepValid = (s) => {
    if (s === 0) return isLinked ? !!selectedPayeeId : !!billPayForm.payee_name?.trim();
    if (s === 1) return amount > 0 && !!billPayForm.funding_account_id && !insufficient;
    if (s === 2) return authorized && !insufficient && amount > 0 && !!billPayForm.funding_account_id;
    return true;
  };

  const next = () => { if (stepValid(step)) setStep(Math.min(step + 1, DONE_STEP)); };
  const back = () => setStep(Math.max(step - 1, 0));

  /** Pick a linked account → pre-fill payee + suggested amount, then open payment entry. */
  const choosePayee = (payee) => {
    setBillPayForm((p) => ({
      ...p,
      payee_kind: "linked",
      payee_account_id: payee.id,
      // Mirrored for backward compatibility with the old card-only field.
      card_account_id: payee.id,
      payee_name: `${payee.institution || payee.name}`.trim(),
      payee_type: payee.payeeType,
      amount: payee.suggestedAmount != null ? payee.suggestedAmount : "",
    }));
    setStep(1);
  };

  /** "Pay a credit card" shortcut — scrolls the Credit Cards section into view. */
  const jumpToCreditCards = () => {
    const el = sectionsRef.current?.querySelector(`#payee-section-${CATEGORY_CREDIT_CARD}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Quick-amount chips on the entry screen, driven by whatever the account exposes.
  const amountChips = useMemo(() => {
    if (!selectedPayee) return [];
    const isCard = selectedPayee.categoryId === CATEGORY_CREDIT_CARD;
    const chips = [];
    if (selectedPayee.minPayment != null) {
      chips.push({
        label: isCard ? "Minimum" : "Scheduled payment",
        value: selectedPayee.minPayment,
      });
    }
    if (selectedPayee.lastStatementBalance != null) {
      chips.push({ label: "Statement balance", value: selectedPayee.lastStatementBalance });
    }
    if (selectedPayee.balance > 0) {
      chips.push({
        label: isCard ? "Current balance" : "Payoff balance",
        value: selectedPayee.balance,
      });
    }
    // De-duplicate chips that resolve to the same dollar figure.
    return chips.filter(
      (c, i) => chips.findIndex((o) => Number(o.value) === Number(c.value)) === i
    );
  }, [selectedPayee]);

  const payeeDisplayName = isLinked
    ? selectedPayee
      ? `${acctLabel(selectedPayee)} ····${mask4(selectedPayee)}`
      : "—"
    : billPayForm.payee_name;

  const dueDays = daysUntil(selectedPayee?.nextPaymentDueDate);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Make a Payment</div>
          <div className="page-subtitle">Pay a card, loan or biller — securely</div>
        </div>
        {step < DONE_STEP && (
          <div className="page-actions">
            <button className="btn btn-secondary btn-sm" onClick={() => navigate("/")}>
              <i className="ti ti-x"></i> Cancel
            </button>
          </div>
        )}
      </div>

      {/* Stepper */}
      <div className="stepper" style={{ maxWidth: 560, marginBottom: 20 }}>
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

      {/* ---------------- STEP 0 — Who are you paying? ---------------- */}
      {step === 0 && (
        <div className="card" style={{ maxWidth: 720 }}>
          <div className="section-title">Who are you paying?</div>

          {/* Prominent shortcut straight to the credit-card section. */}
          <div className="payee-shortcuts">
            {isLinked && hasCreditCards && (
              <button className="btn btn-primary btn-sm" onClick={jumpToCreditCards}>
                <i className="ti ti-credit-card"></i> Pay a credit card
              </button>
            )}
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => update("payee_kind", isLinked ? "external" : "linked")}
            >
              <i className="ti ti-building-store"></i>
              {isLinked ? "Pay someone else" : "Back to linked accounts"}
            </button>
          </div>

          {isLinked ? (
            <div ref={sectionsRef}>
              <PayeeCategoryList
                categories={categories}
                selectedPayeeId={selectedPayeeId}
                onSelect={choosePayee}
                formatDate={formatDate}
              />
            </div>
          ) : (
            <>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Payee name</label>
                  <input className="form-input" placeholder="e.g. City Water Utility"
                    value={billPayForm.payee_name} onChange={(e) => update("payee_name", e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Payee type</label>
                  <select className="form-select" value={billPayForm.payee_type}
                    onChange={(e) => update("payee_type", e.target.value)}>
                    {PAYEE_TYPES.filter((t) => t.value !== "CREDIT_CARD").map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
                <button className="btn btn-primary" disabled={!stepValid(0)} onClick={next}>
                  Continue <i className="ti ti-arrow-right"></i>
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ---------------- STEP 1 — Payment entry ---------------- */}
      {step === 1 && (
        <div className="card" style={{ maxWidth: 720 }}>
          <div className="section-title">Payment details</div>

          {/* Who we're paying, pre-filled from the selected account. */}
          <div className="list-item" style={{ alignItems: "center" }}>
            <div className={`item-icon ${selectedCategory?.iconClass || "icon-gray"}`}
              style={{ width: 42, height: 42, fontSize: 20 }}>
              <i className={selectedCategory?.icon || "ti ti-building-store"}></i>
            </div>
            <div className="item-main">
              <div className="item-name">{payeeDisplayName}</div>
              <div className="item-sub">
                {selectedCategory?.label || "Biller"}
                {selectedPayee?.nextPaymentDueDate
                  ? ` · due ${formatDate(new Date(`${selectedPayee.nextPaymentDueDate}T00:00:00`))}`
                  : ""}
                {dueDays != null && dueDays < 0 ? " · overdue" : ""}
              </div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => setStep(0)}>
              <i className="ti ti-switch-horizontal"></i> Change
            </button>
          </div>

          <hr className="divider" />

          {/* Amount — pre-filled with the suggested payment, fully editable. */}
          {amountChips.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              {amountChips.map((chip) => (
                <button key={chip.label} className="btn btn-secondary btn-sm"
                  onClick={() => update("amount", chip.value)}>
                  {chip.label} {currency(chip.value)}
                </button>
              ))}
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

          {/* Payment source */}
          <div className="form-group">
            <label className="form-label">Pay from</label>
            {fundingAccounts.length === 0 ? (
              <div className="empty-state"><i className="ti ti-building-bank"></i><p>No checking or savings account linked to fund this payment.</p></div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {fundingAccounts.map((f) => {
                  const active = billPayForm.funding_account_id === f.id;
                  const bal = fundingBalanceOf(f);
                  const tooLow = amount > bal;
                  return (
                    <button key={f.id} type="button"
                      className={`payee-row ${active ? "selected" : ""}`}
                      onClick={() => update("funding_account_id", f.id)}>
                      <div className="item-icon icon-forest" style={{ width: 42, height: 42, fontSize: 20 }}>
                        <i className="ti ti-building-bank"></i>
                      </div>
                      <div className="payee-row-main">
                        <div className="payee-row-name">{acctLabel(f)} ····{mask4(f)}</div>
                        <div className="payee-row-sub" style={{ color: tooLow ? "var(--tv-negative)" : "var(--tv-text-muted)" }}>
                          Available {currency(bal)}{tooLow ? " · not enough to cover this payment" : ""}
                        </div>
                      </div>
                      {active && <i className="ti ti-circle-check" style={{ color: "var(--tv-forest)", fontSize: 22 }}></i>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Scheduled date */}
          <div className="form-group">
            <label className="form-label">When?</label>
            <div className="seg-control" style={{ marginBottom: 10 }}>
              <button className={`seg-btn ${!isScheduled ? "active" : ""}`}
                onClick={() => update("scheduled_date", "")}>
                <i className="ti ti-bolt"></i> Pay now
              </button>
              <button className={`seg-btn ${isScheduled ? "active" : ""}`}
                onClick={() => update("scheduled_date", billPayForm.scheduled_date || new Date(Date.now() + 86400000).toISOString().slice(0, 10))}>
                <i className="ti ti-calendar"></i> Schedule
              </button>
            </div>
            {isScheduled && (
              <input className="form-input" type="date" min={today} style={{ maxWidth: 220 }}
                value={billPayForm.scheduled_date} onChange={(e) => update("scheduled_date", e.target.value)} />
            )}
          </div>

          {insufficient && (
            <div style={{ marginTop: 4, padding: "10px 12px", background: "var(--tv-negative-bg)", color: "var(--tv-negative)", borderRadius: "var(--radius-md)", fontSize: 13 }}>
              <i className="ti ti-alert-triangle"></i> This account's available balance ({currency(fundingBalance)}) is less than {currency(amount)}. Choose another account or lower the amount.
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18 }}>
            <button className="btn btn-secondary" onClick={back}><i className="ti ti-arrow-left"></i> Back</button>
            <button className="btn btn-primary" disabled={!stepValid(1)} onClick={next}>Review <i className="ti ti-arrow-right"></i></button>
          </div>
        </div>
      )}

      {/* ---------------- STEP 2 — Review & authorize ---------------- */}
      {step === 2 && (
        <div className="grid-2">
          <div className="card">
            <div className="section-title">Review your payment</div>

            <div className="list-item">
              <div className={`item-icon ${selectedCategory?.iconClass || "icon-blue"}`} style={{ width: 40, height: 40, fontSize: 20 }}>
                <i className={selectedCategory?.icon || "ti ti-building-store"}></i>
              </div>
              <div className="item-main">
                <div className="item-name">Paying</div>
                <div className="item-sub">
                  {selectedCategory?.label
                    || PAYEE_TYPES.find((t) => t.value === billPayForm.payee_type)?.label
                    || "Biller"}
                </div>
              </div>
              <div className="item-right"><div style={{ fontSize: 14, fontWeight: 600 }}>{payeeDisplayName}</div></div>
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
            <div className="list-item">
              <div className="item-icon icon-gold" style={{ width: 40, height: 40, fontSize: 20 }}><i className="ti ti-calendar"></i></div>
              <div className="item-main"><div className="item-name">When</div></div>
              <div className="item-right">
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {isScheduled ? formatDate(new Date(billPayForm.scheduled_date)) : "Pay now"}
                </div>
              </div>
            </div>

            <hr className="divider" />

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
              {[["Paying", isLinked ? `····${mask4(selectedPayee)}` : billPayForm.payee_name],
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
              onClick={onSubmit} disabled={submitting || !stepValid(2)}>
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

      {/* ---------------- STEP 3 — Done ---------------- */}
      {step === DONE_STEP && (
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
      {step < DONE_STEP && (
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
