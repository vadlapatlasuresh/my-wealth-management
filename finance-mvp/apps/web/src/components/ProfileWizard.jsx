import { useMemo, useState } from "react";
import { api } from "../api";

/**
 * ProfileWizard — progressive profiling / KYC onboarding.
 *
 * A non-blocking, skippable multi-step modal that collects the identity fields
 * the app needs over time rather than all-at-once at signup:
 *   1. Personal   — first/last name + date of birth
 *   2. Address    — mailing address
 *   3. Identity   — SSN (write-once; skipped entirely once one is on file)
 *   4. Alerts     — notification preferences (email / push / weekly summary)
 *
 * Each step persists on "Continue" (api.updateProfile / putNotificationPreferences)
 * so partial progress is never lost if the user drops off. Existing data is never
 * overwritten blindly — fields are pre-filled from the loaded profile.
 *
 * Props:
 *   profile     initial ProfileResponse (may be partially filled)
 *   onComplete  (updatedProfile) => void  — called after the final step
 *   onClose     () => void                — called on "Skip / close"
 */
export default function ProfileWizard({ profile, onComplete, onClose }) {
  const ssnOnFile = !!profile?.ssnMasked;

  // The steps that actually apply to this user (Identity is dropped if SSN is set).
  const steps = useMemo(() => {
    const base = [
      { id: "personal", label: "Personal", icon: "ti ti-user" },
      { id: "address", label: "Address", icon: "ti ti-map-pin" },
    ];
    if (!ssnOnFile) base.push({ id: "identity", label: "Identity", icon: "ti ti-shield-lock" });
    base.push({ id: "alerts", label: "Alerts", icon: "ti ti-bell" });
    return base;
  }, [ssnOnFile]);

  const [stepIdx, setStepIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const [form, setForm] = useState({
    firstName: profile?.firstName || "",
    lastName: profile?.lastName || "",
    dateOfBirth: profile?.dateOfBirth || "",
    addressLine1: profile?.addressLine1 || "",
    addressLine2: profile?.addressLine2 || "",
    city: profile?.city || "",
    state: profile?.state || "",
    postalCode: profile?.postalCode || "",
    country: profile?.country || "US",
    ssn: "",
  });
  const [prefs, setPrefs] = useState({
    emailEnabled: true,
    pushEnabled: false,
    weeklySummary: true,
  });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const togglePref = (k) => () => setPrefs((p) => ({ ...p, [k]: !p[k] }));

  const current = steps[stepIdx];
  const isLast = stepIdx === steps.length - 1;
  const pct = Math.round(((stepIdx + 1) / steps.length) * 100);

  // Persist only the fields relevant to the current step, then advance.
  async function saveAndNext() {
    setErr("");

    // Per-step validation (light — everything here is skippable, but if provided
    // it should be sane).
    if (current.id === "identity" && form.ssn) {
      const digits = form.ssn.replace(/\D/g, "");
      if (digits.length !== 9) {
        setErr("Please enter a valid 9-digit SSN, or skip this step.");
        return;
      }
    }

    setSaving(true);
    try {
      let updated = profile;
      if (current.id === "personal") {
        updated = await api.updateProfile({
          firstName: form.firstName,
          lastName: form.lastName,
          dateOfBirth: form.dateOfBirth || null,
        });
      } else if (current.id === "address") {
        updated = await api.updateProfile({
          addressLine1: form.addressLine1,
          addressLine2: form.addressLine2,
          city: form.city,
          state: form.state,
          postalCode: form.postalCode,
          country: form.country,
        });
      } else if (current.id === "identity") {
        if (form.ssn) updated = await api.updateProfile({ ssn: form.ssn });
      } else if (current.id === "alerts") {
        await api.putNotificationPreferences(prefs);
      }

      if (isLast) {
        onComplete?.(updated || profile);
      } else {
        setStepIdx((i) => i + 1);
      }
    } catch (e) {
      setErr("Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const overlay = {
    position: "fixed", inset: 0, zIndex: 1000,
    background: "rgba(17,29,23,.55)", backdropFilter: "blur(2px)",
    display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
  };
  const panel = {
    width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto",
    background: "var(--tv-white)", borderRadius: "var(--radius-lg)",
    boxShadow: "var(--shadow-lg)", padding: "26px 26px 22px",
  };

  return (
    <div style={overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div style={panel} role="dialog" aria-modal="true" aria-label="Complete your profile">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <h2 className="page-title" style={{ fontSize: 22, margin: 0 }}>Complete your profile</h2>
          <button className="icon-btn" title="Skip for now" onClick={onClose}><i className="ti ti-x"></i></button>
        </div>
        <p style={{ color: "var(--tv-text-secondary)", fontSize: 13, marginBottom: 18 }}>
          A few quick details unlock payments, real-estate deals, and tailored insights. You can skip any step.
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

        {/* Step body */}
        {current.id === "personal" && (
          <div className="wizard-grid">
            <Field label="First name"><input className="form-input" value={form.firstName} onChange={set("firstName")} placeholder="Jordan" /></Field>
            <Field label="Last name"><input className="form-input" value={form.lastName} onChange={set("lastName")} placeholder="Rivera" /></Field>
            <Field label="Date of birth" full>
              <input className="form-input" type="date" value={form.dateOfBirth} onChange={set("dateOfBirth")} max="2010-01-01" />
            </Field>
          </div>
        )}

        {current.id === "address" && (
          <div className="wizard-grid">
            <Field label="Address line 1" full><input className="form-input" value={form.addressLine1} onChange={set("addressLine1")} placeholder="123 Main St" /></Field>
            <Field label="Address line 2" full><input className="form-input" value={form.addressLine2} onChange={set("addressLine2")} placeholder="Apt 4B (optional)" /></Field>
            <Field label="City"><input className="form-input" value={form.city} onChange={set("city")} placeholder="Austin" /></Field>
            <Field label="State"><input className="form-input" value={form.state} onChange={set("state")} placeholder="TX" /></Field>
            <Field label="ZIP / Postal code"><input className="form-input" value={form.postalCode} onChange={set("postalCode")} placeholder="78701" /></Field>
            <Field label="Country">
              <select className="form-select" value={form.country} onChange={set("country")}>
                <option value="US">United States</option>
                <option value="CA">Canada</option>
                <option value="GB">United Kingdom</option>
                <option value="IN">India</option>
                <option value="AU">Australia</option>
              </select>
            </Field>
          </div>
        )}

        {current.id === "identity" && (
          <div className="wizard-grid">
            <Field label="Social Security Number" full>
              <input
                className="form-input"
                inputMode="numeric"
                autoComplete="off"
                value={form.ssn}
                onChange={set("ssn")}
                placeholder="123-45-6789"
              />
            </Field>
            <p style={{ gridColumn: "1 / -1", fontSize: 12, color: "var(--tv-text-muted)", display: "flex", gap: 6, alignItems: "flex-start" }}>
              <i className="ti ti-lock" style={{ marginTop: 1 }}></i>
              Encrypted at rest (AES-256). We only ever display the last 4 digits, and it can't be changed once saved. Optional — skip if you prefer.
            </p>
          </div>
        )}

        {current.id === "alerts" && (
          <div>
            <PrefRow on={prefs.emailEnabled} onClick={togglePref("emailEnabled")}
              icon="ti ti-mail" title="Email alerts" sub="Payment reminders, deal events, security notices." />
            <PrefRow on={prefs.weeklySummary} onClick={togglePref("weeklySummary")}
              icon="ti ti-calendar-stats" title="Weekly summary" sub="A Monday digest of your net worth & activity." />
            <PrefRow on={prefs.pushEnabled} onClick={togglePref("pushEnabled")}
              icon="ti ti-device-mobile" title="Push notifications" sub="Real-time alerts on your devices." />
          </div>
        )}

        {err && <p className="error" style={{ color: "var(--tv-negative)", fontSize: 13, marginTop: 12 }}>{err}</p>}

        {/* Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 22 }}>
          {stepIdx > 0 && (
            <button className="btn btn-secondary" disabled={saving} onClick={() => { setErr(""); setStepIdx((i) => i - 1); }}>
              <i className="ti ti-arrow-left"></i> Back
            </button>
          )}
          <button className="btn btn-secondary" disabled={saving} onClick={onClose} style={{ marginLeft: stepIdx > 0 ? 0 : "auto" }}>
            Skip for now
          </button>
          <button className="btn btn-primary" disabled={saving} onClick={saveAndNext} style={{ marginLeft: "auto" }}>
            {saving ? "Saving…" : isLast ? "Finish" : "Continue"} {!saving && !isLast && <i className="ti ti-arrow-right"></i>}
          </button>
        </div>
      </div>
    </div>
  );
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
      {!last && <div className="step-line"></div>}
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
