import { currency } from "../utils/format";

const STEPS = ["Select card", "Amount", "Funding", "Review", "Done"];

export default function BillPayPage({
  step,
  setStep,
  creditCards,
  fundingAccounts,
  billPayForm,
  setBillPayForm,
  paymentIntents,
  onSubmit,
  onBack,
  submitting = false,
  lastIntent = null
}) {
  const selectedCard = creditCards.find((c) => c.id === billPayForm.card_account_id);
  const selectedFunding = fundingAccounts.find((f) => f.id === billPayForm.funding_account_id);

  return (
    <>
      <header className="page-header row">
        <div>
          <button type="button" className="btn-ghost" onClick={onBack}>
            ← Back
          </button>
          <h1>Pay bill</h1>
        </div>
      </header>

      <div className="stepper">
        {STEPS.map((label, i) => (
          <div
            key={label}
            className={`step ${i === step ? "active" : ""} ${i < step ? "done" : ""}`}
          >
            <span className="step-num">{i + 1}</span>
            <span>{label}</span>
          </div>
        ))}
      </div>

      <div className="billpay-layout">
        <div className="card billpay-main">
          {step === 0 && (
            <>
              <h3>Select card</h3>
              <div className="card-picker">
                {creditCards.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    className={`pick-card ${
                      billPayForm.card_account_id === card.id ? "selected" : ""
                    }`}
                    onClick={() =>
                      setBillPayForm((p) => ({ ...p, card_account_id: card.id }))
                    }
                  >
                    <strong>{card.institution}</strong>
                    <span>{card.name}</span>
                    <span>{currency(card.balance)} balance</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="btn-primary"
                disabled={!billPayForm.card_account_id}
                onClick={() => setStep(1)}
              >
                Continue
              </button>
            </>
          )}

          {step === 1 && (
            <>
              <h3>Payment amount</h3>
              <div className="amount-options">
                {[
                  { key: "min", label: "Minimum", val: 35 },
                  { key: "stmt", label: "Statement", val: selectedCard?.balance },
                  { key: "custom", label: "Custom", val: billPayForm.amount }
                ].map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    className="amount-chip"
                    onClick={() => setBillPayForm((p) => ({ ...p, amount: opt.val || 0 }))}
                  >
                    {opt.label}
                    {opt.val != null && <small>{currency(opt.val)}</small>}
                  </button>
                ))}
              </div>
              <label>
                Amount
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={billPayForm.amount}
                  onChange={(e) =>
                    setBillPayForm((p) => ({ ...p, amount: e.target.value }))
                  }
                />
              </label>
              <div className="wizard-actions">
                <button type="button" className="btn-ghost" onClick={() => setStep(0)}>
                  Back
                </button>
                <button type="button" className="btn-primary" onClick={() => setStep(2)}>
                  Continue
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h3>Funding account</h3>
              <select
                value={billPayForm.funding_account_id}
                onChange={(e) =>
                  setBillPayForm((p) => ({ ...p, funding_account_id: e.target.value }))
                }
              >
                {fundingAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.institution} — {a.name} ({currency(a.balance)})
                  </option>
                ))}
              </select>
              <div className="wizard-actions">
                <button type="button" className="btn-ghost" onClick={() => setStep(1)}>
                  Back
                </button>
                <button type="button" className="btn-primary" onClick={() => setStep(3)}>
                  Continue
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h3>Review payment</h3>
              <dl className="review-list">
                <dt>Card</dt>
                <dd>
                  {selectedCard?.institution} {selectedCard?.name}
                </dd>
                <dt>Amount</dt>
                <dd>{currency(Number(billPayForm.amount))}</dd>
                <dt>From</dt>
                <dd>
                  {selectedFunding?.institution} {selectedFunding?.name}
                </dd>
                <dt>Est. settlement</dt>
                <dd>2–3 business days</dd>
                <dt>Rewards preview</dt>
                <dd>+125 pts</dd>
              </dl>
              <label className="checkbox">
                <input type="checkbox" defaultChecked /> I authorize this payment
              </label>
              <div className="wizard-actions">
                <button type="button" className="btn-ghost" onClick={() => setStep(2)}>
                  Back
                </button>
                <button type="button" className="btn-primary" onClick={onSubmit} disabled={submitting}>
                  {submitting ? "Submitting…" : "Confirm payment"}
                </button>
              </div>
            </>
          )}

          {step === 4 && (
            <div className="success-panel">
              <h3>Payment submitted</h3>
              <p>Your bill pay intent is pending settlement.</p>
              {lastIntent && (
                <p className="muted">Intent: <strong>{lastIntent.intent_id}</strong></p>
              )}
              <button type="button" className="btn-primary" onClick={onBack}>
                Back to home
              </button>
            </div>
          )}
        </div>

        <aside className="card billpay-summary sticky">
          <h3>Summary</h3>
          <p>{selectedCard?.name || "—"}</p>
          <p className="summary-amount">{currency(Number(billPayForm.amount) || 0)}</p>
          <p className="muted">Fee $0.00</p>
          <hr />
          <h4>Recent intents</h4>
          <ul className="simple-list">
            {paymentIntents.slice(0, 3).map((i) => (
              <li key={i.intent_id}>
                <span>{currency(i.amount)}</span>
                <span className="badge">{i.status}</span>
              </li>
            ))}
          </ul>
          {lastIntent && (
            <div style={{ marginTop: 12 }}>
              <small className="muted">Last created: <strong>{lastIntent.intent_id}</strong></small>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
