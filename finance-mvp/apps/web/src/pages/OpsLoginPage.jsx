import React, { useState } from 'react';
import { api, setOpsToken } from '../api';

/**
 * Ops-staff sign-in. Deliberately its own screen and its own credential — an ops account is not
 * a customer account with extra roles, and signing into the member app grants nothing here.
 *
 * Two steps, mirroring the member flow: password → MFA code → token. MFA cannot be turned off
 * for ops accounts, so step 1 never yields a token.
 */
export default function OpsLoginPage({ onSignedIn }) {
  const [step, setStep] = useState('password'); // password | mfa
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [destination, setDestination] = useState('');
  const [devCode, setDevCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submitPassword(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.opsLogin(email.trim(), password);
      setDestination(res?.destination || '');
      setDevCode(res?.devCode || '');
      setStep('mfa');
    } catch (err) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.opsMfaVerify(email.trim(), code.trim());
      setOpsToken(res.token, res.email, res.name);
      onSignedIn?.();
    } catch (err) {
      setError(err.message || 'Invalid or expired code');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ops-login">
      <div className="ops-login-card">
        <div className="ops-login-brand">
          <div className="ops-mark"><i className="ti ti-headset"></i></div>
          <div>
            <div className="ops-login-title">TerraVest</div>
            <div className="ops-brand-tag">Ops Portal</div>
          </div>
        </div>

        <p className="ops-login-intro">
          Staff sign-in. This is a separate account from your TerraVest member login.
        </p>

        {error && (
          <div className="ops-login-error" role="alert">
            <i className="ti ti-alert-triangle"></i> {error}
          </div>
        )}

        {step === 'password' ? (
          <form onSubmit={submitPassword} className="ops-login-form">
            <label className="form-label" htmlFor="ops-email">Work email</label>
            <input
              id="ops-email"
              className="form-input"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
            <label className="form-label" htmlFor="ops-password">Password</label>
            <input
              id="ops-password"
              className="form-input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? <><i className="ti ti-loader spin"></i> Checking…</> : <>Continue</>}
            </button>
          </form>
        ) : (
          <form onSubmit={submitCode} className="ops-login-form">
            <p className="ops-login-intro">
              We sent a verification code to <strong>{destination || 'your registered contact'}</strong>.
            </p>
            <label className="form-label" htmlFor="ops-code">Verification code</label>
            <input
              id="ops-code"
              className="form-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              autoFocus
            />
            {/* Only ever present in local dev (ops.otp.expose-dev-code), never in production. */}
            {devCode && <div className="ops-login-devcode">Dev code: <code>{devCode}</code></div>}
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? <><i className="ti ti-loader spin"></i> Verifying…</> : <>Sign in</>}
            </button>
            <button
              className="btn btn-secondary btn-sm"
              type="button"
              onClick={() => { setStep('password'); setCode(''); setError(''); }}
            >
              Back
            </button>
          </form>
        )}

        <div className="ops-login-foot">
          <i className="ti ti-shield-check"></i> Everything you do in this portal is recorded and
          attributed to your account.
        </div>
      </div>
    </div>
  );
}
