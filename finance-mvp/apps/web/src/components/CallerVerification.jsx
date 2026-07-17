import React, { useEffect, useState } from 'react';
import { api } from '../api';

/**
 * The caller-verification banner — the gate on disclosure.
 *
 * Sits at the very top of a customer record. Until the caller is verified, the agent shouldn't read
 * anything back; the sensitive surfaces (PII reveal, financials) are gated on the tier reached, not
 * just the agent's permission. Verification is per-call — it starts cold every time the record is
 * opened. Design: DOCUMENTATION/proposals/ops-caller-verification.md.
 *
 * `onTierChange(tier)` lets the parent re-gate its own controls (e.g. the PII reveal button).
 */
const TIER = {
  0: { label: 'Not verified', cls: 't0', icon: 'ti-shield-x', help: 'Do not read any account information back to the caller.' },
  1: { label: 'Identity confirmed', cls: 't1', icon: 'ti-shield-half', help: 'Can discuss account status — not balances or PII.' },
  2: { label: 'Verified', cls: 't2', icon: 'ti-shield-check', help: 'Balances, transactions and PII last-4 may be disclosed.' },
  3: { label: 'Step-up verified', cls: 't3', icon: 'ti-shield-check', help: 'Cleared for high-risk actions.' }
};

export default function CallerVerification({ customerId, phone, onTierChange }) {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [otpPrompt, setOtpPrompt] = useState(null); // { destination, devCode }
  const [otpCode, setOtpCode] = useState('');
  const [kba, setKba] = useState(null); // { factKey, prompt, expected }

  function apply(s) {
    setState(s);
    onTierChange?.(s?.tier ?? 0);
  }

  async function load() {
    setError('');
    try {
      apply(await api.opsVerifyStatus(customerId));
    } catch (e) {
      setError(e.message || 'Could not load verification status');
    }
  }
  // Re-fetch whenever the customer changes — a verified caller is per-call, so opening a new
  // record must never inherit the last one's tier.
  useEffect(() => { setOtpPrompt(null); setKba(null); setOtpCode(''); load(); /* eslint-disable-next-line */ }, [customerId]);

  async function sendOtp() {
    setBusy('otp'); setError('');
    try {
      const r = await api.opsVerifySendOtp(customerId);
      setOtpPrompt({ destination: r.destination, devCode: r.devCode });
    } catch (e) { setError(e.message || 'Could not send the code'); }
    finally { setBusy(''); }
  }

  async function confirmOtp() {
    setBusy('otp-confirm'); setError('');
    try {
      apply(await api.opsVerifyConfirmOtp(customerId, otpCode.trim()));
      setOtpPrompt(null); setOtpCode('');
    } catch (e) { setError(e.message || 'That code was wrong or expired'); }
    finally { setBusy(''); }
  }

  async function askKba() {
    setBusy('kba'); setError('');
    try {
      setKba(await api.opsVerifyKba(customerId));
    } catch (e) { setError(e.message || 'No knowledge facts on file — use an OTP'); }
    finally { setBusy(''); }
  }

  async function confirmKba(passed) {
    setBusy('kba-confirm'); setError('');
    try {
      apply(await api.opsVerifyConfirmKba(customerId, kba.factKey, passed));
      setKba(null);
    } catch (e) { setError(e.message || 'Knowledge check failed'); await load(); }
    finally { setBusy(''); }
  }

  async function suspicious() {
    const note = window.prompt('Flag this caller as unverifiable? This freezes disclosure for the call and raises a fraud escalation. Add a note:');
    if (note === null) return;
    setBusy('suspicious');
    try {
      apply(await api.opsVerifySuspicious(customerId, note));
    } catch (e) { setError(e.message || 'Could not flag'); }
    finally { setBusy(''); }
  }

  if (state === null) return null;
  const tier = state.tier ?? 0;
  const t = TIER[tier] || TIER[0];
  const frozen = state.frozen;

  return (
    <div className={`caller-verify ${t.cls}`}>
      <div className="caller-verify-row">
        <i className={`ti ${t.icon}`}></i>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600 }}>
            Caller: {t.label}
            {frozen && <span className="badge badge-red" style={{ marginLeft: 8 }}>Frozen — flagged suspicious</span>}
          </div>
          <div className="caller-verify-help">{t.help}</div>
        </div>
        {tier >= 2 && !frozen && (
          <span className="caller-verify-lock"><i className="ti ti-clock"></i> verified this call</span>
        )}
      </div>

      {error && <div className="caller-verify-help" style={{ color: 'var(--tv-negative)' }}><i className="ti ti-alert-triangle"></i> {error}</div>}

      {/* OTP entry */}
      {otpPrompt && (
        <div className="caller-verify-action">
          <div className="caller-verify-help">Code sent to <strong>{otpPrompt.destination}</strong> — ask the caller to read it back.</div>
          {otpPrompt.devCode && <div className="caller-verify-help">Dev code: <code>{otpPrompt.devCode}</code></div>}
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <input className="form-input" style={{ maxWidth: 140 }} placeholder="Code" inputMode="numeric"
              value={otpCode} onChange={(e) => setOtpCode(e.target.value)} autoFocus />
            <button className="btn btn-primary btn-sm" disabled={busy === 'otp-confirm' || !otpCode.trim()} onClick={confirmOtp}>Confirm</button>
            <button className="btn btn-secondary btn-sm" onClick={() => { setOtpPrompt(null); setOtpCode(''); }}>Cancel</button>
          </div>
        </div>
      )}

      {/* KBA challenge */}
      {kba && (
        <div className="caller-verify-action">
          <div style={{ fontWeight: 600 }}>{kba.prompt}</div>
          <div className="caller-verify-help">Expected: <strong>{kba.expected}</strong> — compare to what they say, don't read it out.</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button className="btn btn-primary btn-sm" disabled={busy === 'kba-confirm'} onClick={() => confirmKba(true)}>They got it right</button>
            <button className="btn btn-danger btn-sm" disabled={busy === 'kba-confirm'} onClick={() => confirmKba(false)}>Wrong</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setKba(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Actions — hidden once at T2+, since there's nothing more to prove for routine disclosure */}
      {!otpPrompt && !kba && !frozen && tier < 2 && (
        <div className="caller-verify-actions">
          <button className="btn btn-primary btn-sm" disabled={busy === 'otp'} onClick={sendOtp}>
            <i className="ti ti-message-dots"></i> Send OTP{phone ? '' : ' to email'}
          </button>
          <button className="btn btn-secondary btn-sm" disabled={busy === 'kba'} onClick={askKba}>
            <i className="ti ti-help-circle"></i> Ask a question
          </button>
          <button className="btn btn-danger btn-sm" disabled={busy === 'suspicious'} onClick={suspicious}>
            <i className="ti ti-alert-triangle"></i> Can't verify
          </button>
        </div>
      )}

      {/* The attempt timeline — "step by step, how this caller was verified" */}
      {(state.attempts || []).length > 0 && (
        <div className="caller-verify-timeline">
          {state.attempts.map((a, i) => (
            <span key={i} className={`badge ${a.outcome === 'PASS' ? 'badge-forest' : 'badge-red'}`}>
              {a.method} {a.outcome === 'PASS' ? '✓' : '✗'}{a.detail ? ` (${a.detail})` : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
