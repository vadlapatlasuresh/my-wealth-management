import { useState, useMemo } from "react";
import { api } from "../api";

const FEATURES = [
  { icon: "ti ti-chart-line", title: "Complete net-worth picture", sub: "Bank, cards, investments & property in one view" },
  { icon: "ti ti-lock", title: "Bank-grade security", sub: "Read-only connections via Plaid — credentials never stored" },
  { icon: "ti ti-sparkles", title: "AI-powered guidance", sub: "Personalized insights and a finance assistant" },
];

// ── Validation helpers ────────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isEmail = (v) => EMAIL_RE.test((v || "").trim());

// Count password "strength" from length + character classes. Returns a small
// descriptor object the meter renders. We never log or transmit the raw value.
function scorePassword(pwd) {
  const p = pwd || "";
  if (!p) return { score: 0, label: "", color: "var(--tv-border)", pct: 0 };
  let score = 0;
  if (p.length >= 8) score++;
  if (p.length >= 12) score++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) score++;
  if (/\d/.test(p)) score++;
  if (/[^A-Za-z0-9]/.test(p)) score++;
  // Bucket the raw score into weak / fair / strong.
  if (score <= 2) return { score, label: "Weak", color: "var(--tv-negative)", pct: 33 };
  if (score === 3 || score === 4) return { score, label: "Fair", color: "var(--tv-warning)", pct: 66 };
  return { score, label: "Strong", color: "var(--tv-positive)", pct: 100 };
}

// Digits-only extraction, used for phone/SSN/EIN masking + length checks.
const digits = (v) => (v || "").replace(/\D/g, "");

// Mask SSN as 123-45-6789 while typing.
function maskSsn(v) {
  const d = digits(v).slice(0, 9);
  const a = d.slice(0, 3);
  const b = d.slice(3, 5);
  const c = d.slice(5, 9);
  return [a, b, c].filter(Boolean).join("-").replace(/^(\d{3})(\d)/, "$1-$2");
}

// Mask EIN as 12-3456789 while typing.
function maskEin(v) {
  const d = digits(v).slice(0, 9);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}-${d.slice(2)}`;
}

// Pretty phone formatting for US-style 10-digit numbers: (123) 456-7890.
function maskPhone(v) {
  const d = digits(v).slice(0, 10);
  const a = d.slice(0, 3);
  const b = d.slice(3, 6);
  const c = d.slice(6, 10);
  if (d.length > 6) return `(${a}) ${b}-${c}`;
  if (d.length > 3) return `(${a}) ${b}`;
  if (d.length > 0) return `(${a}`;
  return "";
}

export default function AuthPage({ authMode, setAuthMode, authForm, setAuthForm, error, onSubmit }) {
  const isLogin = authMode === "login";

  // Local UI-only state (not part of the submitted form).
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmPwd, setConfirmPwd] = useState("");

  // SMS verification flow state.
  const [otpSending, setOtpSending] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [devCode, setDevCode] = useState(""); // dev-only OTP hint

  const setField = (k, v) => setAuthForm((p) => ({ ...p, [k]: v }));

  // First/last name also feed a combined `name` so the parent App can show a
  // display name immediately after register (it reads authForm.name as a fallback).
  const setNamePart = (k, v) =>
    setAuthForm((p) => {
      const next = { ...p, [k]: v };
      next.name = `${next.firstName || ""} ${next.lastName || ""}`.trim();
      return next;
    });

  const accountType = authForm.accountType || "INDIVIDUAL";
  const isBusiness = accountType === "BUSINESS";
  const phoneVerified = !!authForm.phoneVerified;
  const phoneDigits = digits(authForm.phone);

  const strength = useMemo(() => scorePassword(authForm.password), [authForm.password]);

  // When the phone number changes we must invalidate any prior verification so a
  // user can't verify one number and submit a different one.
  const handlePhoneChange = (raw) => {
    setField("phone", maskPhone(raw));
    if (phoneVerified) setField("phoneVerified", false);
    setOtpSent(false);
    setOtpCode("");
    setOtpError("");
    setDevCode("");
  };

  const handleSendCode = async () => {
    setOtpError("");
    setOtpSending(true);
    try {
      // Send the normalized digits, not the formatted display value.
      const res = await api.sendSmsCode(phoneDigits);
      setOtpSent(true);
      if (res && res.devCode) setDevCode(String(res.devCode));
    } catch (err) {
      setOtpError(err?.message || "Could not send code. Try again.");
    } finally {
      setOtpSending(false);
    }
  };

  const handleVerifyCode = async () => {
    setOtpError("");
    setOtpVerifying(true);
    try {
      const res = await api.verifySmsCode(phoneDigits, otpCode.trim());
      if (res && res.verified) {
        setField("phoneVerified", true);
      } else {
        setOtpError("That code didn't match. Please try again.");
      }
    } catch (err) {
      setOtpError(err?.message || "Verification failed. Try again.");
    } finally {
      setOtpVerifying(false);
    }
  };

  // ── Submit gating ──────────────────────────────────────────────────────────
  // Login only needs a valid email + a password.
  const loginValid = isEmail(authForm.email) && !!authForm.password;

  // Signup requires the full, validated field set for the chosen account type.
  const signupValid =
    !!(authForm.firstName || "").trim() &&
    !!(authForm.lastName || "").trim() &&
    isEmail(authForm.email) &&
    (authForm.password || "").length >= 8 &&
    confirmPwd === authForm.password &&
    !!authForm.agreedToTerms &&
    phoneVerified && // phone verification is REQUIRED in this flow
    (isBusiness ? !!(authForm.businessName || "").trim() : true);

  const canSubmit = isLogin ? loginValid : signupValid;

  // Inline confirm-password mismatch hint (only once the user has typed).
  const confirmMismatch = !isLogin && confirmPwd.length > 0 && confirmPwd !== authForm.password;

  return (
    <div className="auth-screen">
      {/* Left brand panel (unchanged — keep it elegant) */}
      <div className="auth-brand-panel">
        <div className="auth-brand-logo">
          <svg width="44" height="44" viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg" aria-label="TerraVest" style={{ borderRadius: 12, flexShrink: 0 }}>
            <defs>
              <linearGradient id="authTile" x1="0" y1="0" x2="96" y2="96" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#1A4D3B"/><stop offset="1" stopColor="#2D6B52"/>
              </linearGradient>
              <linearGradient id="authGold" x1="20" y1="72" x2="76" y2="22" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#C9973A"/><stop offset="1" stopColor="#F0C878"/>
              </linearGradient>
            </defs>
            <rect width="96" height="96" rx="24" fill="url(#authTile)"/>
            <path d="M22 70 L48 50 L74 70 Z" fill="#8AB89A" opacity="0.30"/>
            <path d="M22 68 L40 54 L54 62 L74 30" stroke="url(#authGold)" strokeWidth="6"
                  fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="74" cy="30" r="6.5" fill="url(#authGold)"/>
          </svg>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22 }}>TerraVest</div>
            <div style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--tv-sage-light)" }}>
              All your wealth · One place
            </div>
          </div>
        </div>

        <div>
          <h1 className="auth-headline">Build and manage your wealth with confidence.</h1>
          <p className="auth-sub">
            One elegant place for your accounts, budgets, investments, real estate, and business —
            with AI guidance every step of the way.
          </p>
          <div className="auth-features">
            {FEATURES.map((f) => (
              <div className="auth-feature" key={f.title}>
                <div className="fi"><i className={f.icon}></i></div>
                <div>
                  <div className="auth-feature-title">{f.title}</div>
                  <div className="auth-feature-sub">{f.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="auth-brand-foot">© 2026 TerraVest · Your data is encrypted in transit and at rest.</div>
      </div>

      {/* Right form panel */}
      <div className="auth-form-panel">
        <div className="auth-card">
          <div className="auth-card-title">{isLogin ? "Welcome back" : "Create your account"}</div>
          <div className="page-subtitle" style={{ marginBottom: 22 }}>
            {isLogin ? "Sign in to continue to your dashboard." : "Start tracking your wealth in minutes."}
          </div>

          {/* Sign in / Create account toggle */}
          <div className="auth-segmented">
            <button type="button" className={isLogin ? "active" : ""} onClick={() => setAuthMode("login")}>Sign in</button>
            <button type="button" className={!isLogin ? "active" : ""} onClick={() => setAuthMode("register")}>Create account</button>
          </div>

          {error && (
            <div className="badge badge-red" style={{ display: "flex", width: "100%", padding: "10px 12px", borderRadius: "var(--radius-md)", marginBottom: 16 }}>
              <i className="ti ti-alert-circle"></i> {error}
            </div>
          )}

          <form onSubmit={onSubmit}>
            {/* ───────────────────────── SIGNUP-ONLY FIELDS ───────────────────────── */}
            {!isLogin && (
              <>
                {/* Account type selector — two selectable cards */}
                <div className="form-group">
                  <label className="form-label">Account type</label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {[
                      { key: "INDIVIDUAL", icon: "ti ti-user", title: "Individual", sub: "Personal finances" },
                      { key: "BUSINESS", icon: "ti ti-building", title: "Business", sub: "Company finances" },
                    ].map((opt) => {
                      const active = accountType === opt.key;
                      return (
                        <button
                          type="button"
                          key={opt.key}
                          onClick={() => setField("accountType", opt.key)}
                          className="card"
                          style={{
                            textAlign: "left",
                            padding: "12px 14px",
                            cursor: "pointer",
                            border: `1.5px solid ${active ? "var(--tv-forest)" : "var(--tv-border)"}`,
                            background: active ? "var(--tv-sage-pale)" : "var(--tv-white)",
                            display: "flex",
                            gap: 10,
                            alignItems: "center",
                          }}
                        >
                          <div className="item-icon" style={{ color: active ? "var(--tv-forest)" : "var(--tv-text-muted)" }}>
                            <i className={opt.icon}></i>
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--tv-text-primary)" }}>{opt.title}</div>
                            <div style={{ fontSize: 11.5, color: "var(--tv-text-muted)" }}>{opt.sub}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* First + last name */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">First name</label>
                    <input
                      className="form-input"
                      type="text"
                      placeholder="Alex"
                      autoComplete="given-name"
                      value={authForm.firstName || ""}
                      onChange={(e) => setNamePart("firstName", e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Last name</label>
                    <input
                      className="form-input"
                      type="text"
                      placeholder="Morgan"
                      autoComplete="family-name"
                      value={authForm.lastName || ""}
                      onChange={(e) => setNamePart("lastName", e.target.value)}
                      required
                    />
                  </div>
                </div>
              </>
            )}

            {/* ───────────────────────── EMAIL (both modes) ───────────────────────── */}
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                className="form-input"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                value={authForm.email}
                onChange={(e) => setField("email", e.target.value)}
                required
              />
              {!isLogin && authForm.email && !isEmail(authForm.email) && (
                <div style={{ fontSize: 11.5, color: "var(--tv-negative)", marginTop: 6 }}>
                  Enter a valid email address.
                </div>
              )}
            </div>

            {/* ───────────────────────── PASSWORD (both modes) ───────────────────────── */}
            <div className="form-group">
              <label className="form-label">Password</label>
              <div className="auth-pwd-wrap">
                <input
                  className="form-input"
                  type={showPwd ? "text" : "password"}
                  placeholder={isLogin ? "Your password" : "At least 8 characters"}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  value={authForm.password}
                  onChange={(e) => setField("password", e.target.value)}
                  minLength={isLogin ? undefined : 8}
                  required
                  style={{ paddingRight: 40 }}
                />
                <button type="button" className="auth-pwd-toggle" onClick={() => setShowPwd((s) => !s)} title={showPwd ? "Hide" : "Show"}>
                  <i className={showPwd ? "ti ti-eye-off" : "ti ti-eye"}></i>
                </button>
              </div>

              {/* Strength meter (signup only) */}
              {!isLogin && authForm.password && (
                <div style={{ marginTop: 8 }}>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${strength.pct}%`, background: strength.color }} />
                  </div>
                  <div style={{ fontSize: 11.5, marginTop: 4, color: strength.color, fontWeight: 600 }}>
                    {strength.label} password
                  </div>
                </div>
              )}

              {isLogin && (
                <div style={{ textAlign: "right", marginTop: 8 }}>
                  <span style={{ fontSize: 12.5, color: "var(--tv-forest-light)", cursor: "pointer", fontWeight: 500 }}>Forgot password?</span>
                </div>
              )}
            </div>

            {/* ───────────────────────── CONFIRM PASSWORD (signup) ───────────────────────── */}
            {!isLogin && (
              <div className="form-group">
                <label className="form-label">Confirm password</label>
                <div className="auth-pwd-wrap">
                  <input
                    className="form-input"
                    type={showConfirm ? "text" : "password"}
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                    value={confirmPwd}
                    onChange={(e) => setConfirmPwd(e.target.value)}
                    required
                    style={{ paddingRight: 40 }}
                  />
                  <button type="button" className="auth-pwd-toggle" onClick={() => setShowConfirm((s) => !s)} title={showConfirm ? "Hide" : "Show"}>
                    <i className={showConfirm ? "ti ti-eye-off" : "ti ti-eye"}></i>
                  </button>
                </div>
                {confirmMismatch && (
                  <div style={{ fontSize: 11.5, color: "var(--tv-negative)", marginTop: 6 }}>
                    Passwords don't match.
                  </div>
                )}
                {!confirmMismatch && confirmPwd && confirmPwd === authForm.password && (
                  <div style={{ fontSize: 11.5, color: "var(--tv-positive)", marginTop: 6 }}>
                    <i className="ti ti-check"></i> Passwords match.
                  </div>
                )}
              </div>
            )}

            {/* ───────────────────────── PHONE + SMS VERIFICATION (signup) ───────────────────────── */}
            {!isLogin && (
              <div className="form-group">
                <label className="form-label">
                  Phone number
                  {phoneVerified && (
                    <span className="badge badge-green" style={{ marginLeft: 8 }}>
                      <i className="ti ti-shield-check"></i> Phone verified
                    </span>
                  )}
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    className="form-input"
                    type="tel"
                    inputMode="tel"
                    placeholder="(555) 123-4567"
                    autoComplete="tel"
                    value={authForm.phone || ""}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    disabled={phoneVerified}
                    style={{ flex: 1 }}
                  />
                  {!phoneVerified && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={handleSendCode}
                      disabled={phoneDigits.length < 10 || otpSending}
                      style={{ whiteSpace: "nowrap" }}
                    >
                      <i className="ti ti-send"></i>
                      {otpSending ? "Sending…" : otpSent ? "Resend" : "Send code"}
                    </button>
                  )}
                </div>

                {/* OTP entry — appears after a code is sent and not yet verified */}
                {otpSent && !phoneVerified && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        className="form-input"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="Enter 6-digit code"
                        value={otpCode}
                        onChange={(e) => setOtpCode(digits(e.target.value).slice(0, 6))}
                        style={{ flex: 1, letterSpacing: "0.2em" }}
                      />
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={handleVerifyCode}
                        disabled={otpCode.length < 4 || otpVerifying}
                        style={{ whiteSpace: "nowrap" }}
                      >
                        <i className="ti ti-shield-check"></i>
                        {otpVerifying ? "Verifying…" : "Verify"}
                      </button>
                    </div>
                    {/* Dev-only hint so the flow is testable without a real SMS. */}
                    {devCode && (
                      <div style={{ fontSize: 11.5, color: "var(--tv-text-muted)", marginTop: 6 }}>
                        Dev code: {devCode}
                      </div>
                    )}
                  </div>
                )}

                {otpError && (
                  <div style={{ fontSize: 11.5, color: "var(--tv-negative)", marginTop: 6 }}>{otpError}</div>
                )}
                {!phoneVerified && !otpSent && (
                  <div style={{ fontSize: 11.5, color: "var(--tv-text-muted)", marginTop: 6 }}>
                    We'll text a one-time code to confirm your number. Verification is required.
                  </div>
                )}
              </div>
            )}

            {/* ───────────────────────── INDIVIDUAL: SSN ───────────────────────── */}
            {!isLogin && !isBusiness && (
              <div className="form-group">
                <label className="form-label">Social Security Number</label>
                <input
                  className="form-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="123-45-6789"
                  value={authForm.ssn || ""}
                  onChange={(e) => setField("ssn", maskSsn(e.target.value))}
                />
                <div style={{ fontSize: 11.5, color: "var(--tv-text-muted)", marginTop: 6 }}>
                  <i className="ti ti-id"></i> Only the last 4 digits are stored.
                </div>
              </div>
            )}

            {/* ───────────────────────── BUSINESS: NAME + EIN ───────────────────────── */}
            {!isLogin && isBusiness && (
              <>
                <div className="form-group">
                  <label className="form-label">Business name</label>
                  <input
                    className="form-input"
                    type="text"
                    autoComplete="organization"
                    placeholder="Acme Holdings LLC"
                    value={authForm.businessName || ""}
                    onChange={(e) => setField("businessName", e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">EIN</label>
                  <input
                    className="form-input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="12-3456789"
                    value={authForm.ein || ""}
                    onChange={(e) => setField("ein", maskEin(e.target.value))}
                  />
                  <div style={{ fontSize: 11.5, color: "var(--tv-text-muted)", marginTop: 6 }}>
                    <i className="ti ti-building-bank"></i> Used to link & verify your business.
                  </div>
                </div>
              </>
            )}

            {/* ───────────────────────── TERMS AGREEMENT (signup) ───────────────────────── */}
            {!isLogin && (
              <div className="form-group">
                <div
                  style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}
                  onClick={() => setField("agreedToTerms", !authForm.agreedToTerms)}
                >
                  <div className={`tv-checkbox ${authForm.agreedToTerms ? "checked" : ""}`}>
                    {authForm.agreedToTerms && <i className="ti ti-check"></i>}
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--tv-text-secondary)", lineHeight: 1.4 }}>
                    I agree to the{" "}
                    <span style={{ color: "var(--tv-forest-light)", fontWeight: 600 }}>Terms of Service</span> and{" "}
                    <span style={{ color: "var(--tv-forest-light)", fontWeight: 600 }}>Privacy Policy</span>.
                  </div>
                </div>
              </div>
            )}

            {/* ───────────────────────── SUBMIT ───────────────────────── */}
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!canSubmit}
              style={{ width: "100%", justifyContent: "center", marginTop: 4, opacity: canSubmit ? 1 : 0.55, cursor: canSubmit ? "pointer" : "not-allowed" }}
            >
              <i className={isLogin ? "ti ti-login" : "ti ti-user-plus"}></i>
              {isLogin ? "Sign in" : "Create account"}
            </button>
          </form>

          <div style={{ textAlign: "center", marginTop: 18, fontSize: 13, color: "var(--tv-text-muted)" }}>
            {isLogin ? "New to TerraVest? " : "Already have an account? "}
            <button
              type="button"
              onClick={() => setAuthMode(isLogin ? "register" : "login")}
              style={{ background: "none", color: "var(--tv-forest-light)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
            >
              {isLogin ? "Create one" : "Sign in"}
            </button>
          </div>

          <div style={{ textAlign: "center", marginTop: 22, fontSize: 11.5, color: "var(--tv-text-muted)" }}>
            <i className="ti ti-shield-lock"></i> Protected by bank-grade encryption · Powered by Plaid
          </div>
        </div>
      </div>
    </div>
  );
}
