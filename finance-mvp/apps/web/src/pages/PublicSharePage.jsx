import { useEffect, useState } from "react";
import { api } from "../api";

/* ---------------------------------------------------------------------------
   Public share landing page (no login).
   A CPA or trusted party opens the secure link the owner sent (/shared/:token).
   Access is gated by the opaque token plus an optional passcode; every open is
   logged server-side. This page is rendered by App.jsx BEFORE the auth gate, so
   recipients never need a TerraVest account.
--------------------------------------------------------------------------- */

const docTypeLabel = (t) => ({
  W2: "W-2", "1099": "1099", TAX_RETURN: "Tax return", STATEMENT: "Statement",
  ID: "ID / KYC", CONTRACT: "Contract", RECEIPT: "Receipt", OTHER: "Document",
}[t] || "Document");

function tokenFromPath() {
  const m = window.location.pathname.match(/\/shared\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

export default function PublicSharePage() {
  const token = tokenFromPath();
  const [info, setInfo] = useState(null);
  const [passcode, setPasscode] = useState("");
  const [submittedPass, setSubmittedPass] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchInfo = async (pass) => {
    setLoading(true); setError("");
    try {
      const data = await api.getSharedInfo(token, pass);
      setInfo(data);
      if (pass) setSubmittedPass(pass);
    } catch (e) {
      setError(e?.message || "This link is not valid.");
      setInfo(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (token) fetchInfo(""); else { setError("This link is not valid."); setLoading(false); } /* eslint-disable-next-line */ }, []);

  const openFile = async (f) => {
    if (!f.isFile) {
      if (f.url) window.open(f.url, "_blank", "noopener");
      return;
    }
    try {
      const objUrl = await api.openSharedFile(token, f.docId, submittedPass);
      window.open(objUrl, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(objUrl), 60000);
    } catch {
      setError("Could not open that file. The link may have expired or the passcode is required.");
    }
  };

  const wrap = {
    minHeight: "100vh", background: "var(--tv-bg, #f5f6f4)", color: "var(--tv-text, #1a2420)",
    display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 16px",
  };
  const panel = { width: "100%", maxWidth: 620 };

  return (
    <div style={wrap}>
      <div style={panel}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <i className="ti ti-leaf" style={{ fontSize: 26, color: "var(--tv-forest, #2d5a3d)" }}></i>
          <strong style={{ fontSize: 20 }}>TerraVest</strong>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--tv-text-muted, #64726b)" }}>Secure document share</span>
        </div>

        {loading ? (
          <div className="card" style={{ textAlign: "center", padding: 40 }}>
            <i className="ti ti-loader spin" style={{ fontSize: 24 }}></i>
            <p style={{ color: "var(--tv-text-muted)" }}>Opening secure share…</p>
          </div>
        ) : error ? (
          <StateCard icon="ti-alert-triangle" tone="var(--tv-negative, #c0392b)" title="Link unavailable" body={error} />
        ) : !info?.active ? (
          <StateCard icon="ti-lock" tone="var(--tv-gold, #b8860b)"
                     title={info?.status === "revoked" ? "Access revoked" : "Link expired"}
                     body={info?.status === "revoked"
                       ? "The owner has revoked access to these documents."
                       : "This share link has expired. Ask the owner to send a new one."} />
        ) : info.requiresPasscode && !info.passcodeOk ? (
          <div className="card" style={{ padding: 24 }}>
            <i className="ti ti-lock" style={{ fontSize: 28, color: "var(--tv-forest)" }}></i>
            <h2 style={{ margin: "8px 0 4px" }}>Passcode required</h2>
            <p style={{ color: "var(--tv-text-muted)", fontSize: 14 }}>
              This share is protected. Enter the passcode the owner gave you.
            </p>
            <input
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--tv-border, rgba(0,0,0,.15))", fontSize: 15, marginTop: 8 }}
              type="password" value={passcode} onChange={(e) => setPasscode(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") fetchInfo(passcode); }} placeholder="Passcode" autoFocus />
            {info.passcodeOk === false && submittedPass !== "" && (
              <div style={{ color: "var(--tv-negative)", fontSize: 13, marginTop: 6 }}>That passcode didn’t match. Try again.</div>
            )}
            <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => fetchInfo(passcode)} disabled={!passcode}>
              Unlock
            </button>
          </div>
        ) : (
          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span className="badge" style={{ background: "var(--tv-forest-tint, rgba(45,90,61,.12))", color: "var(--tv-forest)" }}>
                {info.scope === "DOWNLOAD" ? "View + download" : "View-only"}
              </span>
            </div>
            <h2 style={{ margin: "2px 0 4px" }}>Documents shared with you</h2>
            {info.message && <p style={{ color: "var(--tv-text-muted)", fontSize: 14, margin: "0 0 12px" }}>“{info.message}”</p>}

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              {(info.files || []).length === 0 && <div style={{ color: "var(--tv-text-muted)", fontSize: 14 }}>No documents in this share.</div>}
              {(info.files || []).map((f) => (
                <div key={f.docId} className="card" style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 12, margin: 0 }}>
                  <i className={`ti ${f.isFile ? "ti-file-text" : "ti-link"}`} style={{ fontSize: 22, color: "var(--tv-forest)" }}></i>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{f.label}</div>
                    <div style={{ fontSize: 12, color: "var(--tv-text-muted)" }}>{docTypeLabel(f.docType)}{f.filename ? ` · ${f.filename}` : ""}</div>
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={() => openFile(f)}>
                    <i className={`ti ${info.scope === "DOWNLOAD" ? "ti-download" : "ti-eye"}`}></i> {info.scope === "DOWNLOAD" ? "Download" : "View"}
                  </button>
                </div>
              ))}
            </div>

            <p style={{ fontSize: 12, color: "var(--tv-text-muted)", marginTop: 16 }}>
              <i className="ti ti-shield-check"></i> This is a private, logged share. Please don’t forward the link.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function StateCard({ icon, tone, title, body }) {
  return (
    <div className="card" style={{ padding: 32, textAlign: "center" }}>
      <i className={`ti ${icon}`} style={{ fontSize: 30, color: tone }}></i>
      <h2 style={{ margin: "10px 0 6px" }}>{title}</h2>
      <p style={{ color: "var(--tv-text-muted)", fontSize: 14 }}>{body}</p>
    </div>
  );
}
