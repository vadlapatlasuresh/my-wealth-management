import React from "react";
import { currency } from "../utils/format";

const STEPS_NEW = [
  { label: "Select card", icon: "1" },
  { label: "Amount", icon: "2" },
  { label: "Funding", icon: "3" },
  { label: "Review", icon: "4" },
  { label: "Done", icon: "5" },
];

export default function BillPayPage({
  step, // Current step from App.jsx state
  setStep, // Function to update step
  creditCards,
  fundingAccounts,
  billPayForm,
  setBillPayForm,
  paymentIntents,
  onSubmit,
  onBack, // This might need to be a router navigation call
  submitting = false,
  lastIntent = null,
  formatDate // Passed from AppLayout
}) {
  const selectedCard = creditCards.find((c) => c.id === billPayForm.card_account_id);
  const selectedFunding = fundingAccounts.find((f) => f.id === billPayForm.funding_account_id);

  const paymentAmount = Number(billPayForm.amount) || 0;
  const estimatedRewards = Math.round(paymentAmount * 0.1); // Example calculation

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Pay a Bill</div>
          <div className="page-subtitle">Review and confirm your payment</div>
        </div>
      </div>

      {/* Stepper */}
      <div className="stepper" style={{ maxWidth: '600px' }}>
        {STEPS_NEW.map((s, idx) => (
          <React.Fragment key={idx}>
            <div className={`step ${idx < step ? 'done' : ''} ${idx === step ? 'active' : ''}`}>
              <div className="step-circle">
                {idx < step ? <i className="ti ti-check" style={{ fontSize: '14px' }}></i> : s.icon}
              </div>
              <div className="step-label">{s.label}</div>
            </div>
            {idx < STEPS_NEW.length - 1 && (
              <div className={`step-line ${idx < step ? 'done' : ''}`}></div>
            )}
          </React.Fragment>
        ))}
      </div>

      {step === 3 && ( // Review step
        <div className="grid-2">
          {/* Review details */}
          <div className="card">
            <div className="section-title">Review your payment</div>
            <p style={{ fontSize: '13px', color: 'var(--tv-text-muted)', marginBottom: '16px' }}>Please review details before confirming.</p>

            <div className="list-item">
              <div className="item-icon icon-blue" style={{ width: '40px', height: '40px', fontSize: '20px' }}><i className="ti ti-credit-card"></i></div>
              <div className="item-main"><div className="item-name">Pay from</div><div className="item-sub">Card</div></div>
              <div className="item-right"><div style={{ fontSize: '14px', fontWeight: '600' }}>{selectedCard?.institution} ···· {selectedCard?.account_number?.slice(-4)}</div></div>
            </div>
            <div className="list-item">
              <div className="item-icon icon-green" style={{ width: '40px', height: '40px', fontSize: '20px' }}><i className="ti ti-currency-dollar"></i></div>
              <div className="item-main"><div className="item-name">Payment amount</div></div>
              <div className="item-right"><div style={{ fontSize: '18px', fontWeight: '600', fontFamily: 'var(--font-display)' }}>{currency(paymentAmount)}</div></div>
            </div>
            <div className="list-item">
              <div className="item-icon icon-forest" style={{ width: '40px', height: '40px', fontSize: '20px' }}><i className="ti ti-building-bank"></i></div>
              <div className="item-main"><div className="item-name">Fund from</div><div className="item-sub">Available: {currency(selectedFunding?.balance ?? 0)}</div></div>
              <div className="item-right"><div style={{ fontSize: '14px', fontWeight: '600' }}>{selectedFunding?.institution} {selectedFunding?.name} ···· {selectedFunding?.account_number?.slice(-4)}</div></div>
            </div>
            <div className="list-item">
              <div className="item-icon icon-purple" style={{ width: '40px', height: '40px', fontSize: '20px' }}><i className="ti ti-calendar"></i></div>
              <div className="item-main"><div className="item-name">Estimated settlement</div><div className="item-sub">By {formatDate(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000))}</div></div> {/* 3 days from now */}
              <div className="item-right"><div style={{ fontSize: '14px', fontWeight: '600' }}>3 business days</div></div>
            </div>
            <div className="list-item">
              <div className="item-icon icon-amber" style={{ width: '40px', height: '40px', fontSize: '20px' }}><i className="ti ti-tag"></i></div>
              <div className="item-main"><div className="item-name">Payment fee</div></div>
              <div className="item-right"><div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--tv-positive)' }}>$0.00</div></div>
            </div>
            <div className="list-item">
              <div className="item-icon" style={{ width: '40px', height: '40px', fontSize: '20px', background: 'var(--tv-gold-pale)', color: 'var(--tv-gold)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="ti ti-star"></i></div>
              <div className="item-main"><div className="item-name">Estimated rewards</div><div className="item-sub">Rewards preview</div></div>
              <div className="item-right"><div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--tv-gold)' }}>+{estimatedRewards} pts</div></div>
            </div>
            <hr className="divider" />
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', paddingTop: '2px' }}>
              <div className="tv-checkbox checked"><i className="ti ti-check"></i></div> {/* Assuming checked by default for review */}
              <p style={{ fontSize: '12.5px', color: 'var(--tv-text-muted)', lineHeight: '1.6' }}>I authorize this payment and agree to the <a style={{ color: 'var(--tv-forest-light)', fontWeight: '500' }}>Terms of Service</a> and authorize the bank to debit my account on the settlement date.</p>
            </div>
          </div>

          {/* Summary sidebar */}
          <div>
            <div className="card" style={{ marginBottom: '12px' }}>
              <div className="section-title">Payment summary</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px', padding: '7px 0', borderBottom: '1px solid var(--tv-border-light)' }}>
                <span style={{ color: 'var(--tv-text-muted)' }}>Pay from</span>
                <div style={{ textAlign: 'right' }}><div style={{ fontWeight: '500' }}>{selectedCard?.institution} ···· {selectedCard?.account_number?.slice(-4)}</div></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px', padding: '7px 0', borderBottom: '1px solid var(--tv-border-light)' }}>
                <span style={{ color: 'var(--tv-text-muted)' }}>Payment amount</span>
                <span style={{ fontWeight: '500' }}>{currency(paymentAmount)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px', padding: '7px 0', borderBottom: '1px solid var(--tv-border-light)' }}>
                <span style={{ color: 'var(--tv-text-muted)' }}>Payment fee</span>
                <span style={{ fontWeight: '500', color: 'var(--tv-positive)' }}>$0.00</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: '700', padding: '10px 0', borderBottom: '1px solid var(--tv-border-light)' }}>
                <span>Total payment</span>
                <span style={{ color: 'var(--tv-forest)', fontFamily: 'var(--font-display)' }}>{currency(paymentAmount)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '7px 0' }}>
                <span style={{ color: 'var(--tv-text-muted)' }}>Est. settlement</span>
                <span>3 business days</span>
              </div>
              <div style={{ background: 'var(--tv-gold-pale)', border: '1px solid var(--tv-gold-light)', borderRadius: 'var(--radius-md)', padding: '12px', display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
                <i className="ti ti-star" style={{ color: 'var(--tv-gold)', fontSize: '20px', flexShrink: 0 }}></i>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--tv-text-muted)' }}>You'll earn</div>
                  <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--tv-gold)', fontFamily: 'var(--font-display)' }}>+{estimatedRewards} pts</div>
                  <div style={{ fontSize: '11.5px', color: 'var(--tv-text-muted)' }}>Once your payment settles.</div>
                </div>
              </div>
            </div>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '13px', fontSize: '15px', borderRadius: 'var(--radius-md)' }} onClick={onSubmit} disabled={submitting}><i className="ti ti-lock"></i> Confirm Payment</button>
            <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '14px', marginTop: '8px', borderRadius: 'var(--radius-md)' }} onClick={onBack}>Cancel</button>
            <div style={{ textAlign: 'center', marginTop: '12px', fontSize: '12px', color: 'var(--tv-text-muted)' }}><i className="ti ti-shield-check" style={{ color: 'var(--tv-positive)', verticalAlign: 'middle', marginRight: '4px' }}></i>Your security is our priority. <a style={{ color: 'var(--tv-forest-light)', cursor: 'pointer' }}>Learn more</a></div>
          </div>
        </div>
      )}

      {step === 4 && ( // Done step
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-check-circle" style={{color: 'var(--tv-positive)'}}></i>
            <p style={{fontSize: '16px', fontWeight: '600', marginBottom: '8px'}}>Payment submitted successfully!</p>
            <p>Your bill pay intent is pending settlement.</p>
            {lastIntent && (
              <p className="muted">Intent ID: <strong>{lastIntent.intent_id}</strong></p>
            )}
            <button className="btn btn-primary" style={{marginTop: '20px'}} onClick={onBack}>Back to Home</button>
          </div>
        </div>
      )}
    </>
  );
}
