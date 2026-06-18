import { useState } from "react";
import { api } from "../api";

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1rem",
  zIndex: 1000,
};

const btn = (primary) => ({
  padding: "0.55rem 1.1rem",
  border: primary ? "none" : "1px solid var(--tv-border, #d1d5db)",
  borderRadius: "0.5rem",
  background: primary ? "var(--tv-primary, #047857)" : "transparent",
  color: primary ? "#fff" : "inherit",
  fontSize: "0.95rem",
  cursor: "pointer",
});

/**
 * Two-step password reset: (1) email a code, (2) verify the code + set a new password.
 * Self-contained modal so it doesn't entangle the large AuthPage. No account enumeration —
 * step 1 always reports "sent".
 */
export default function ForgotPassword({ onClose }) {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function requestCode(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.forgotPassword(email.trim());
      setStep(2);
    } catch {
      setError("Could not send the code. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitReset(e) {
    e.preventDefault();
    setError("");
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.resetPassword({ email: email.trim(), code: code.trim(), newPassword });
      if (res && res.reset) setDone(true);
      else setError((res && res.message) || "That code is invalid or has expired.");
    } catch (err) {
      setError((err && err.message) || "That code is invalid or has expired.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Reset password" style={overlayStyle}>
      <div className="card" style={{ maxWidth: 420, width: "100%" }}>
        <div className="card-title">Reset your password</div>

        {done ? (
          <>
            <p className="setting-help">Your password has been updated. You can now sign in with it.</p>
            <button type="button" style={btn(true)} onClick={onClose}>Back to sign in</button>
          </>
        ) : step === 1 ? (
          <form onSubmit={requestCode}>
            <p className="setting-help">Enter your email and we'll send a reset code.</p>
            <div className="form-group">
              <label className="form-label" htmlFor="fp-email">Email</label>
              <input id="fp-email" className="form-input" type="email" required
                value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            </div>
            {error && <div className="setting-help" role="alert" style={{ color: "var(--tv-negative, #dc2626)" }}>{error}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button type="submit" style={btn(true)} disabled={busy}>{busy ? "Sending…" : "Send code"}</button>
              <button type="button" style={btn(false)} onClick={onClose}>Cancel</button>
            </div>
          </form>
        ) : (
          <form onSubmit={submitReset}>
            <p className="setting-help">We sent a code to {email}. Enter it and choose a new password.</p>
            <div className="form-group">
              <label className="form-label" htmlFor="fp-code">Reset code</label>
              <input id="fp-code" className="form-input" inputMode="numeric" required
                value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="fp-pwd">New password (min 8 chars)</label>
              <input id="fp-pwd" className="form-input" type="password" required minLength={8}
                value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            {error && <div className="setting-help" role="alert" style={{ color: "var(--tv-negative, #dc2626)" }}>{error}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button type="submit" style={btn(true)} disabled={busy}>{busy ? "Resetting…" : "Reset password"}</button>
              <button type="button" style={btn(false)} onClick={() => setStep(1)}>Back</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
