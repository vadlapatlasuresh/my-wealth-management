import { useState } from "react";
import { api } from "../api";

/**
 * Secure share of documents with a CPA or other trusted party.
 *
 * Extracted from DocumentCenterPage so every surface that shares files uses one
 * implementation — this flow carries the passcode, expiry and access-log semantics, and a
 * second copy of it would inevitably drift from them.
 *
 * `target` is one of:
 *   - { set: true, documentIds: [...], count }  — a multi-file set
 *   - { folder: true, id, name }                — a whole folder
 *   - { id, label }                             — a single document
 */

function fmtDate(s) {
  if (!s) return "";
  try { return new Date(s).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); }
  catch { return s; }
}

function ToggleBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} className={`btn btn-sm ${active ? "btn-primary" : "btn-secondary"}`} style={{ flex: 1 }}>
      {children}
    </button>
  );
}

const labelStyle = { display: "block", fontSize: 13, fontWeight: 600, margin: "10px 0 4px" };
const inputStyle = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--tv-border, rgba(0,0,0,.15))", fontSize: 14, background: "var(--tv-input-bg, #fff)", color: "inherit" };

const overlayStyle = {
  position: "fixed", inset: 0, zIndex: 1000, background: "rgba(17,29,23,.55)",
  display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
};

function Modal({ title, subtitle, onClose, children, maxWidth = 520 }) {
  return (
    <div style={overlayStyle} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card" style={{ width: "100%", maxWidth, maxHeight: "88vh", overflowY: "auto", padding: 24 }} role="dialog" aria-modal="true">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <h2 className="page-title" style={{ fontSize: 20, margin: 0 }}>{title}</h2>
            {subtitle && <div className="item-sub" style={{ color: "var(--tv-text-muted)", fontSize: 13 }}>{subtitle}</div>}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}><i className="ti ti-x"></i></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ShareModal({ target, onClose, onCreated }) {
  const isFolder = !!target.folder;
  const isSet = !!target.set;
  const [scope, setScope] = useState("VIEW");
  const [granteeKind, setGranteeKind] = useState("CPA");
  const [granteeRef, setGranteeRef] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("14");
  const [passcode, setPasscode] = useState("");
  const [message, setMessage] = useState("");
  const [sendEmail, setSendEmail] = useState(false);
  const [includePasscode, setIncludePasscode] = useState(true);
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!passcode.trim()) { setErr("A passcode is required to share."); return; }
    setBusy(true); setErr("");
    try {
      const payload = {
        scope, granteeKind, granteeRef, message,
        passcode: passcode.trim(),
        expiresInDays: expiresInDays ? Number(expiresInDays) : undefined,
        sendEmail: sendEmail && !!granteeRef.trim(),
        includePasscode,
        ...(isSet ? { documentIds: target.documentIds }
          : isFolder ? { folderId: target.id }
          : { documentId: target.id }),
      };
      const s = await api.createDocShare(payload);
      setCreated(s);
      onCreated?.();
    } catch (e) { setErr(e?.message || "Could not create the share."); }
    finally { setBusy(false); }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(created.link); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { /* clipboard may be blocked; the link is shown for manual copy */ }
  };

  const title = isSet ? `Share ${target.count} document${target.count === 1 ? "" : "s"}`
    : isFolder ? `Share folder “${target.name}”`
    : `Share “${target.label}”`;

  if (created) {
    return (
      <Modal title="Share link ready" subtitle="Send this to your CPA or trusted party" onClose={onClose}>
        <div className="card" style={{ padding: 12, wordBreak: "break-all", fontSize: 13, background: "var(--tv-forest-tint, rgba(45,90,61,.06))" }}>{created.link}</div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button className="btn btn-primary btn-sm" onClick={copy}><i className="ti ti-copy"></i> {copied ? "Copied!" : "Copy link"}</button>
        </div>
        <ul style={{ fontSize: 13, color: "var(--tv-text-muted)", marginTop: 14, paddingLeft: 18, lineHeight: 1.7 }}>
          <li>Access: <strong>{created.scope === "DOWNLOAD" ? "View + download" : "View-only"}</strong></li>
          {created.expiresAt && <li>Expires: <strong>{fmtDate(created.expiresAt)}</strong></li>}
          {created.hasPasscode && <li>Passcode required{created.emailStatus ? "" : " — share it separately from the link"}</li>}
          {created.emailStatus === "SENT" && <li style={{ color: "var(--tv-forest)" }}><i className="ti ti-mail-check"></i> Emailed to <strong>{created.emailedTo}</strong></li>}
          {created.emailStatus && created.emailStatus !== "SENT" && (
            <li style={{ color: "var(--tv-gold, #b8860b)" }}>Email not sent ({String(created.emailStatus).toLowerCase()}) — copy the link and send it yourself.</li>
          )}
          <li>Every open is logged, and you can revoke anytime from <strong>Shared</strong>.</li>
        </ul>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={title} subtitle="A secure, revocable link — you control who sees it and for how long" onClose={onClose}>
      <label style={labelStyle}>Who is this for?</label>
      <div style={{ display: "flex", gap: 8 }}>
        <ToggleBtn active={granteeKind === "CPA"} onClick={() => setGranteeKind("CPA")}>A CPA / accountant</ToggleBtn>
        <ToggleBtn active={granteeKind === "LINK"} onClick={() => setGranteeKind("LINK")}>Anyone with the link</ToggleBtn>
      </div>
      <label style={labelStyle}>{granteeKind === "CPA" ? "CPA email (for your records)" : "Recipient email (optional)"}</label>
      <input style={inputStyle} value={granteeRef} onChange={(e) => setGranteeRef(e.target.value)} placeholder="cpa@firm.com" />

      <label style={labelStyle}>Access level</label>
      <div style={{ display: "flex", gap: 8 }}>
        <ToggleBtn active={scope === "VIEW"} onClick={() => setScope("VIEW")}>View only</ToggleBtn>
        <ToggleBtn active={scope === "DOWNLOAD"} onClick={() => setScope("DOWNLOAD")}>Allow download</ToggleBtn>
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Expires in</label>
          <select style={inputStyle} value={expiresInDays} onChange={(e) => setExpiresInDays(e.target.value)}>
            <option value="1">1 day</option>
            <option value="7">7 days</option>
            <option value="14">14 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="">No expiry</option>
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Passcode <span style={{ color: "var(--tv-negative)" }}>*</span></label>
          <input style={inputStyle} value={passcode} onChange={(e) => setPasscode(e.target.value)} placeholder="required — e.g. 4821" />
        </div>
      </div>
      <div style={{ fontSize: 12, color: "var(--tv-text-muted)", marginTop: 4 }}>
        <i className="ti ti-shield-lock"></i> A passcode is required. Share it with the recipient separately from the link.
      </div>

      <label style={labelStyle}>Message (optional)</label>
      <input style={inputStyle} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. For my 2023 filing" />

      <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: "var(--tv-forest-tint, rgba(45,90,61,.06))" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14 }}>
          <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)}
                 style={{ width: 16, height: 16, accentColor: "var(--tv-forest)" }} />
          <span><i className="ti ti-mail"></i> Email this link to the recipient</span>
        </label>
        {sendEmail && (
          <>
            {!granteeRef.trim() && (
              <div style={{ fontSize: 12, color: "var(--tv-negative)", marginTop: 6 }}>Enter the recipient email above to send it.</div>
            )}
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, marginTop: 8, paddingLeft: 24 }}>
              <input type="checkbox" checked={includePasscode} onChange={(e) => setIncludePasscode(e.target.checked)}
                     style={{ width: 15, height: 15, accentColor: "var(--tv-forest)" }} />
              <span>Include the passcode in the email <span style={{ color: "var(--tv-text-muted)" }}>(convenient, less secure)</span></span>
            </label>
          </>
        )}
      </div>

      {err && <div style={{ color: "var(--tv-negative)", fontSize: 13, marginTop: 8 }}>{err}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy || !passcode.trim()}>{busy ? "Creating…" : "Create share link"}</button>
      </div>
    </Modal>
  );
}

export { Modal, overlayStyle, labelStyle, inputStyle };
export default ShareModal;
