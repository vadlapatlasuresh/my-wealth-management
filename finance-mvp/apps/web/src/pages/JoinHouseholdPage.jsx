import { useEffect, useState } from "react";
import { api } from "../api";

/* ---------------------------------------------------------------------------
   Public household-invite landing page (/join/:token). Rendered by App.jsx
   BEFORE the auth gate, so someone who was invited can open the link the owner
   shared and see who invited them — whether or not they already have an account.

   - Already signed in: accept the invite and drop them straight into Household.
   - Not signed in: stash the token (and invited email) and send them to sign
     in / sign up. App.jsx finishes the join right after they authenticate, so
     the whole thing is one click even for a brand-new user. The invited email
     is prefilled at signup, which is what makes the server's exact-email match
     succeed instead of 403-ing a first-time user who typed a different address.
--------------------------------------------------------------------------- */

const JOIN_KEY = "tv_join"; // { token, email } consumed by App.jsx after auth

function tokenFromPath() {
  const m = window.location.pathname.match(/\/join\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

export default function JoinHouseholdPage() {
  const token = tokenFromPath();
  const [info, setInfo] = useState(null); // null = loading
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) { setError("This invite link is not valid."); setInfo({ valid: false }); return; }
      try {
        const data = await api.getHouseholdInvitePreview(token);
        if (cancelled) return;
        setInfo(data || { valid: false });
        // Already signed in? Finish it now and go straight to the household.
        if (data?.valid && api.getToken()) {
          setBusy(true);
          try {
            await api.acceptHouseholdInvite(token);
            window.location.assign("/household");
          } catch (e) {
            setBusy(false);
            setError(e?.message || "We couldn't add you to this household. It may have been for a different email.");
          }
        }
      } catch (e) {
        if (!cancelled) { setError(e?.message || "This invite link is not valid."); setInfo({ valid: false }); }
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  // Hand off to the auth screen, carrying the token so App.jsx can finish the join.
  const continueToAuth = (mode) => {
    try {
      sessionStorage.setItem(JOIN_KEY, JSON.stringify({ token, email: info?.invitedEmail || "", mode }));
    } catch { /* private mode — copy-code fallback still works from the Household page */ }
    window.location.assign("/");
  };

  const wrap = {
    minHeight: "100vh", background: "var(--tv-bg, #f5f6f4)", color: "var(--tv-text, #1a2420)",
    display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 16px",
  };
  const panel = { width: "100%", maxWidth: 520 };

  return (
    <div style={wrap}>
      <div style={panel}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <i className="ti ti-leaf" style={{ fontSize: 26, color: "var(--tv-forest, #2d5a3d)" }} />
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.2 }}>TerraVest</span>
        </div>

        {info === null && (
          <div className="card" style={{ padding: 28, textAlign: "center" }}>
            <div className="page-subtitle">Checking your invite…</div>
          </div>
        )}

        {info && !info.valid && (
          <div className="card" style={{ padding: 28, textAlign: "center" }}>
            <i className="ti ti-mail-off" style={{ fontSize: 34, color: "var(--tv-muted, #7a8a83)" }} />
            <div className="page-title" style={{ fontSize: 18, marginTop: 10 }}>This invite link isn't valid</div>
            <div className="page-subtitle" style={{ marginBottom: 18 }}>
              {error || "It may have already been used, been revoked, or expired. Ask whoever invited you to send a fresh one."}
            </div>
            <button className="btn btn-secondary" onClick={() => window.location.assign("/")}>
              Go to TerraVest
            </button>
          </div>
        )}

        {info && info.valid && (
          <div className="card" style={{ padding: 26 }}>
            <span style={{
              display: "inline-flex", width: 52, height: 52, alignItems: "center", justifyContent: "center",
              borderRadius: 14, background: "var(--tv-positive-bg)", color: "var(--tv-forest, #2f7a5b)", marginBottom: 14,
            }}>
              <i className="ti ti-home-heart" style={{ fontSize: 26 }} />
            </span>
            <div className="page-title" style={{ fontSize: 20, marginBottom: 6 }}>
              You've been invited to join {info.householdName}
            </div>
            <div className="page-subtitle" style={{ marginBottom: 16 }}>
              <strong>{info.invitedByName}</strong> invited <strong>{info.invitedEmail}</strong> to share goals
              and bills on TerraVest. Your own accounts, transactions and personal goals stay private — a
              household never exposes them.
            </div>

            {error && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", marginBottom: 14, borderRadius: 10, background: "var(--tv-negative-bg)", border: "1px solid var(--tv-red, #c0392b)" }}>
                <i className="ti ti-alert-circle" style={{ color: "var(--tv-red, #c0392b)" }} />
                <span style={{ fontSize: 13.5 }}>{error}</span>
              </div>
            )}

            {api.getToken() ? (
              <button className="btn btn-primary" disabled={busy} style={{ width: "100%" }}
                onClick={async () => {
                  setBusy(true); setError("");
                  try { await api.acceptHouseholdInvite(token); window.location.assign("/household"); }
                  catch (e) { setBusy(false); setError(e?.message || "Couldn't join. This invite may be for a different email."); }
                }}>
                {busy ? "Joining…" : "Join this household"}
              </button>
            ) : (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn btn-primary" style={{ flex: 1, minWidth: 160 }}
                  onClick={() => continueToAuth("register")}>
                  <i className="ti ti-user-plus" /> Create account &amp; join
                </button>
                <button className="btn btn-secondary" style={{ flex: 1, minWidth: 140 }}
                  onClick={() => continueToAuth("login")}>
                  I already have an account
                </button>
              </div>
            )}

            <div className="page-subtitle" style={{ fontSize: 12, marginTop: 14 }}>
              Sign up with <strong>{info.invitedEmail}</strong> — the invite only works for that address.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
