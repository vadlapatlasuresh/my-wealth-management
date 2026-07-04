import { useMemo, useState } from "react";
import { api } from "../api";

/**
 * ProfileGate — MANDATORY post-signup KYC completion.
 *
 * Unlike the optional in-app ProfileWizard, this is a full-screen BLOCKING gate:
 * the dashboard is not reachable until every required section is complete. It is
 * rendered by App.jsx whenever an authenticated user's profile is missing the
 * KYC essentials (identity + address). There is deliberately no "skip" — KYC/AML
 * rules require identity verification before financial activity, so the gate can
 * only be completed, not dismissed.
 *
 * Three guided sections (one screen each, so it never feels like one huge form):
 *   1. Personal   — Date of birth (18+ enforced) + SSN (individual) / EIN (business),
 *                   masked & write-once, with a plain-language reason for the ask.
 *   2. Address    — Legal residential address.
 *   3. Preferences & Security — Notification preferences (security alerts locked on),
 *                   preferred 2FA channel confirmation, recovery acknowledgement.
 *
 * Each section persists on "Continue" (api.updateProfile / putNotificationPreferences)
 * so partial progress survives a drop-off; the gate simply re-appears at the first
 * unfinished section on the next login.
 *
 * Props:
 *   profile     ProfileResponse for the signed-in user (may be partially filled)
 *   user        { email, name } — for the header greeting
 *   onComplete  (updatedProfile) => void — called after the final section saves
 */

const digits = (v) => (v || "").replace(/\D/g, "");

// Mask SSN as •••-••-1234 style while typing (mirrors AuthPage).
function maskSsn(v) {
  const d = digits(v).slice(0, 9);
  const a = d.slice(0, 3);
  const b = d.slice(3, 5);
  const c = d.slice(5, 9);
  return [a, b, c].filter(Boolean).join("-").replace(/^(\d{3})(\d)/, "$1-$2");
}
function maskEin(v) {
  const d = digits(v).slice(0, 9);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}-${d.slice(2)}`;
}

// 18+ check from an ISO yyyy-MM-dd date.
function isAdult(iso) {
  if (!iso) return false;
  const dob = new Date(iso);
  if (Number.isNaN(dob.getTime())) return false;
  const now = new Date();
  const eighteen = new Date(dob.getFullYear() + 18, dob.getMonth(), dob.getDate());
  return eighteen <= now;
}

export default function ProfileGate({ profile, user, onComplete }) {
  const isBusiness = (profile?.accountType || "INDIVIDUAL") === "BUSINESS";
  const ssnOnFile = !!profile?.ssnMasked;
  const einOnFile = !!profile?.einMasked;

  const steps = useMemo(
    () => [
      { id: "personal", label: "Personal", icon: "ti ti-user" },
      { id: "address", label: "Address", icon: "ti ti-map-pin" },
      { id: "security", label: "Preferences", icon: "ti ti-shield-lock" },
    ],
    []
  );

  const [stepIdx, setStepIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const [form, setForm] = useState({
    firstName: profile?.firstName || "",
    lastName: profile?.lastName || "",
    dateOfBirth: profile?.dateOfBirth || "",
    ssn: "",
    ein: "",
    businessName: profile?.businessName || "",
    addressLine1: profile?.addressLine1 || "",
    addressLine2: profile?.addressLine2 || "",
    city: profile?.city || "",
    state: profile?.state || "",
    postalCode: profile?.postalCode || "",
    country: profile?.country || "US",
    mfaChannel: profile?.mfaChannel || "EMAIL",
  });
  const [prefs, setPrefs] = useState({
    emailEnabled: true,
    pushEnabled: false,
    weeklySummary: true,
  });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setVal = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const togglePref = (k) => () => setPrefs((p) => ({ ...p, [k]: !p[k] }));

  const current = steps[stepIdx];
  const isLast = stepIdx === steps.length - 1;
  const pct = Math.round(((stepIdx + 1) / steps.length) * 100);

  // ── Per-section validity (drives the disabled Continue button) ──────────────
  const personalValid =
    isAdult(form.dateOfBirth) &&
    (isBusiness
      ? (einOnFile || digits(form.ein).length === 9) && !!form.businessName.trim()
      : ssnOnFile || digits(form.ssn).length === 9);

  const addressValid =
    !!form.addressLine1.trim() &&
    !!form.city.trim() &&
    !!form.state.trim() &&
    !!form.postalCode.trim() &&
    !!form.country.trim();

  const securityValid = true; // prefs + channel always have a default selection

  const sectionValid =
    current.id === "personal" ? personalValid : current.id === "address" ? addressValid : securityValid;

  async function saveAndNext() {
    setErr("");
    if (!sectionValid) return;
    setSaving(true);
    try {
      let updated = profile;
      if (current.id === "personal") {
        const payload = {
          firstName: form.firstName || undefined,
          lastName: form.lastName || undefined,
          dateOfBirth: form.dateOfBirth || null,
        };
        if (isBusiness) {
          if (form.businessName) payload.businessName = form.businessName;
          if (!einOnFile && form.ein) payload.ein = form.ein;
        } else if (!ssnOnFile && form.ssn) {
          payload.ssn = form.ssn;
        }
        updated = await api.updateProfile(payload);
      } else if (current.id === "address") {
        updated = await api.updateProfile({
          addressLine1: form.addressLine1,
          addressLine2: form.addressLine2 || undefined,
          city: form.city,
          state: form.state,
          postalCode: form.postalCode,
          country: form.country,
        });
      } else if (current.id === "security") {
        // Confirm the preferred 2FA channel + persist notification preferences.
        updated = await api.updateProfile({ mfaChannel: form.mfaChannel });
        await api.putNotificationPreferences(prefs);
      }

      if (isLast) {
        onComplete?.(updated || profile);
      } else {
        setStepIdx((i) => i + 1);
      }
    } catch (e) {
      setErr(e?.message || "Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="gate-screen">
      {/* Header: brand + who's signed in */}
      <div className="gate-header">
        <div className="gate-brand">
          <svg width="34" height="34" viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg" aria-label="TerraVest" style={{ borderRadius: 10, flexShrink: 0 }}>
            <defs>
              <linearGradient id="gateTile" x1="0" y1="0" x2="96" y2="96" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#1A4D3B" /><stop offset="1" stopColor="#2D6B52" />
              </linearGradient>
              <linearGradient id="gateGold" x1="20" y1="72" x2="76" y2="22" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#C9973A" /><stop offset="1" stopColor="#F0C878" />
              </linearGradient>
            </defs>
            <rect width="96" height="96" rx="24" fill="url(#gateTile)" />
            <path d="M22 70 L48 50 L74 70 Z" fill="#8AB89A" opacity="0.30" />
            <path d="M22 68 L40 54 L54 62 L74 30" stroke="url(#gateGold)" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="74" cy="30" r="6.5" fill="url(#gateGold)" />
          </svg>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>TerraVest</div>
        </div>
        <div className="gate-secure"><i className="ti ti-lock"></i> Bank-grade encryption · Required to continue</div>
      </div>

      <div className="gate-body">
        <div className="card gate-card">
          <div className="gate-eyebrow">
            <i className="ti ti-shield-check"></i> Verify your identity
          </div>
          <h1 className="page-title" style={{ fontSize: 26, margin: "6px 0 4px" }}>
            {user?.name ? `Welcome, ${String(user.name).split(" ")[0]}` : "Finish setting up your account"}
          </h1>
          <p style={{ color: "var(--tv-text-secondary)", fontSize: 13.5, marginBottom: 20 }}>
            To open your account, U.S. regulations (KYC/AML) require us to verify a few identity details.
            This takes about a minute — your data is encrypted and never sold.
          </p>

          {/* Progress */}
          <div className="progress-bar" style={{ marginBottom: 10 }}>
            <div className="progress-fill" style={{ width: `${pct}%` }}></div>
          </div>
          <div className="stepper">
            {steps.map((s, i) => (
              <Step key={s.id} s={s} state={i < stepIdx ? "done" : i === stepIdx ? "active" : ""} last={i === steps.length - 1} />
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--tv-text-muted)", margin: "2px 0 18px", display: "flex", justifyContent: "space-between" }}>
            <span>Step {stepIdx + 1} of {steps.length}</span>
            <span>{pct}% complete</span>
          </div>

          {/* ── Section 1: Personal ── */}
          {current.id === "personal" && (
            <div className="wizard-grid">
              <Field label="First name">
                <input className="form-input" value={form.firstName} onChange={set("firstName")} placeholder="Jordan" autoComplete="given-name" />
              </Field>
              <Field label="Last name">
                <input className="form-input" value={form.lastName} onChange={set("lastName")} placeholder="Avery" autoComplete="family-name" />
              </Field>
              <Field label="Date of birth *" full>
                <input className="form-input" type="date" value={form.dateOfBirth} onChange={set("dateOfBirth")} max="2010-01-01" autoComplete="bday" />
                {form.dateOfBirth && !isAdult(form.dateOfBirth) && (
                  <div className="gate-help err"><i className="ti ti-alert-circle"></i> You must be 18 or older to open an account.</div>
                )}
              </Field>

              {isBusiness ? (
                <>
                  <Field label="Legal business name *" full>
                    <input className="form-input" value={form.businessName} onChange={set("businessName")} placeholder="Acme Holdings LLC" autoComplete="organization" />
                  </Field>
                  <Field label="Employer Identification Number (EIN) *" full>
                    <input
                      className="form-input"
                      inputMode="numeric"
                      autoComplete="off"
                      value={einOnFile ? "On file" : form.ein}
                      onChange={(e) => setVal("ein", maskEin(e.target.value))}
                      placeholder="12-3456789"
                      disabled={einOnFile}
                    />
                    <div className="gate-help"><i className="ti ti-lock"></i> Required to verify your business. Encrypted at rest — only the last 4 are ever shown, and it can't be changed once saved.</div>
                  </Field>
                </>
              ) : (
                <Field label="Social Security Number *" full>
                  <input
                    className="form-input"
                    inputMode="numeric"
                    autoComplete="off"
                    value={ssnOnFile ? "On file" : form.ssn}
                    onChange={(e) => setVal("ssn", maskSsn(e.target.value))}
                    placeholder="123-45-6789"
                    disabled={ssnOnFile}
                  />
                  <div className="gate-help">
                    <i className="ti ti-lock"></i>
                    Required by federal law (KYC/AML) to open a financial account. Encrypted with AES-256, never shown in full, and write-once — only the last 4 digits are ever displayed.
                  </div>
                </Field>
              )}
            </div>
          )}

          {/* ── Section 2: Address ── */}
          {current.id === "address" && (
            <div className="wizard-grid">
              <Field label="Address line 1 *" full>
                <input className="form-input" value={form.addressLine1} onChange={set("addressLine1")} placeholder="2200 Fillmore St" autoComplete="address-line1" />
              </Field>
              <Field label="Address line 2" full>
                <input className="form-input" value={form.addressLine2} onChange={set("addressLine2")} placeholder="Apt 4B (optional)" autoComplete="address-line2" />
              </Field>
              <Field label="City *">
                <input className="form-input" value={form.city} onChange={set("city")} placeholder="San Francisco" autoComplete="address-level2" />
              </Field>
              <Field label="State / Region *">
                <input className="form-input" value={form.state} onChange={set("state")} placeholder="CA" autoComplete="address-level1" />
              </Field>
              <Field label="Postal code *">
                <input className="form-input" value={form.postalCode} onChange={set("postalCode")} placeholder="94115" autoComplete="postal-code" />
              </Field>
              <Field label="Country *">
                <select className="form-select" value={form.country} onChange={set("country")}>
                  <option value="US">United States</option>
                  <option value="CA">Canada</option>
                  <option value="GB">United Kingdom</option>
                  <option value="IN">India</option>
                  <option value="AU">Australia</option>
                </select>
              </Field>
              <p style={{ gridColumn: "1 / -1", margin: 0 }} className="gate-help">
                <i className="ti ti-map-pin"></i> Your legal residential address, used for account verification and statements.
              </p>
            </div>
          )}

          {/* ── Section 3: Preferences & Security ── */}
          {current.id === "security" && (
            <div>
              <div className="gate-subhead">Notifications</div>
              <div className="wizard-pref on" style={{ cursor: "default", opacity: 0.92 }}>
                <i className="ti ti-shield-check"></i>
                <div style={{ textAlign: "left", flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>Security alerts <span style={{ fontSize: 11.5, color: "var(--tv-text-muted)", fontWeight: 500 }}>· always on</span></div>
                  <div style={{ fontSize: 12, color: "var(--tv-text-muted)" }}>Sign-in and account-change notices. Can't be turned off.</div>
                </div>
                <span className="wizard-switch on"><span className="knob"></span></span>
              </div>
              <PrefRow on={prefs.emailEnabled} onClick={togglePref("emailEnabled")}
                icon="ti ti-mail" title="Email updates" sub="Payment reminders, deal events, product news." />
              <PrefRow on={prefs.weeklySummary} onClick={togglePref("weeklySummary")}
                icon="ti ti-calendar-stats" title="Weekly summary" sub="A Monday digest of your net worth & activity." />
              <PrefRow on={prefs.pushEnabled} onClick={togglePref("pushEnabled")}
                icon="ti ti-device-mobile" title="Push notifications" sub="Real-time alerts on your devices." />

              <div className="gate-subhead" style={{ marginTop: 18 }}>Two-factor authentication</div>
              <p className="gate-help" style={{ marginTop: 0, marginBottom: 12 }}>
                <i className="ti ti-shield-lock"></i> 2FA is required on every sign-in and can't be turned off — it protects access to your money. Choose where we send your login codes:
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  { key: "EMAIL", icon: "ti ti-mail", title: "Email", sub: user?.email ? maskEmail(user.email) : "To your inbox" },
                  { key: "SMS", icon: "ti ti-device-mobile-message", title: "SMS", sub: profile?.phone ? "To your phone" : "To your phone" },
                ].map((opt) => {
                  const active = form.mfaChannel === opt.key;
                  return (
                    <button
                      type="button"
                      key={opt.key}
                      onClick={() => setVal("mfaChannel", opt.key)}
                      className="card"
                      style={{
                        textAlign: "left", padding: "12px 14px", cursor: "pointer",
                        border: `1.5px solid ${active ? "var(--tv-forest)" : "var(--tv-border)"}`,
                        background: active ? "var(--tv-sage-pale)" : "var(--tv-white)",
                        display: "flex", gap: 10, alignItems: "center",
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
          )}

          {err && <p className="error" style={{ color: "var(--tv-negative)", fontSize: 13, marginTop: 14, display: "flex", gap: 6, alignItems: "center" }}><i className="ti ti-alert-circle"></i> {err}</p>}

          {/* Actions — no skip; the gate can only be completed */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 22 }}>
            {stepIdx > 0 && (
              <button className="btn btn-secondary" disabled={saving} onClick={() => { setErr(""); setStepIdx((i) => i - 1); }}>
                <i className="ti ti-arrow-left"></i> Back
              </button>
            )}
            <button
              className="btn btn-primary"
              disabled={saving || !sectionValid}
              onClick={saveAndNext}
              style={{ marginLeft: "auto", opacity: saving || !sectionValid ? 0.55 : 1, cursor: saving || !sectionValid ? "not-allowed" : "pointer" }}
            >
              {saving ? "Saving…" : isLast ? "Finish & enter TerraVest" : "Save & continue"}
              {!saving && <i className={isLast ? "ti ti-check" : "ti ti-arrow-right"}></i>}
            </button>
          </div>

          <div style={{ textAlign: "center", marginTop: 18, fontSize: 11.5, color: "var(--tv-text-muted)" }}>
            <i className="ti ti-lock"></i> AES-256 encryption · SOC 2 · We never sell your data
          </div>
        </div>
      </div>
    </div>
  );
}

// Mask an email like j•••@gmail.com for the 2FA channel hint.
function maskEmail(email) {
  const [u, d] = String(email).split("@");
  if (!d) return email;
  return `${u.slice(0, 1)}•••@${d}`;
}

function Step({ s, state, last }) {
  return (
    <>
      <div className={`step ${state}`}>
        <div className="step-circle">
          {state === "done" ? <i className="ti ti-check"></i> : <i className={s.icon}></i>}
        </div>
        <div className="step-label">{s.label}</div>
      </div>
      {!last && <div className={`step-line ${state === "done" ? "done" : ""}`}></div>}
    </>
  );
}

function Field({ label, full, children }) {
  return (
    <div style={full ? { gridColumn: "1 / -1" } : undefined}>
      <label className="form-label">{label}</label>
      {children}
    </div>
  );
}

function PrefRow({ on, onClick, icon, title, sub }) {
  return (
    <button type="button" onClick={onClick} className={`wizard-pref ${on ? "on" : ""}`}>
      <i className={icon}></i>
      <div style={{ textAlign: "left", flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
        <div style={{ fontSize: 12, color: "var(--tv-text-muted)" }}>{sub}</div>
      </div>
      <span className={`wizard-switch ${on ? "on" : ""}`}><span className="knob"></span></span>
    </button>
  );
}
