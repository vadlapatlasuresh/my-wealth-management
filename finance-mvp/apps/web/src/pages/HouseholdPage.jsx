import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import HouseholdSharing from "../components/HouseholdSharing";

/* HouseholdPage — Shared Household (Phase 3a): create, invite, members, leave.
   NO financial data is shared here: a household grants access to household-owned objects
   only (shared goals & bills arrive in 3b). feature_key: individual.household (Plus).

   Owner-pays: creating a household is the gated action; joining and participating never are,
   otherwise an invited Free member couldn't see the household they joined. */

export default function HouseholdPage({ accounts = [] }) {
  const [state, setState] = useState(null); // null = loading
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [joinToken, setJoinToken] = useState("");

  const load = useCallback(async () => {
    try {
      setState(await api.getHousehold());
      setError("");
    } catch (e) {
      setError(e?.message || "Couldn't load your household.");
      setState({ inHousehold: false });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const run = async (fn) => {
    setBusy(true); setError("");
    try { await fn(); await load(); }
    catch (e) { setError(e?.message || "Something went wrong."); }
    finally { setBusy(false); }
  };

  if (state === null) {
    return <div className="page active"><Header /><div className="card" style={{ padding: 24 }}><div className="page-subtitle">Loading…</div></div></div>;
  }

  // ---------- not in a household yet ----------
  if (!state.inHousehold) {
    return (
      <div className="page active">
        <Header />
        {error && <ErrorBar text={error} />}

        <div className="card" style={{ padding: 22, marginBottom: 16 }}>
          <div className="page-title" style={{ fontSize: 17, marginBottom: 6 }}>Start a household</div>
          <div className="page-subtitle" style={{ marginBottom: 14 }}>
            Share goals and bills with a partner. Your accounts, transactions and personal goals
            stay private — a household never exposes them.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              className="form-input" style={{ flex: 1, minWidth: 200 }}
              placeholder="Household name (e.g. Our home)"
              value={name} onChange={(e) => setName(e.target.value)}
            />
            <button className="btn btn-primary" disabled={busy}
              onClick={() => run(() => api.createHousehold(name))}>
              <i className="ti ti-home-plus" /> Create
            </button>
          </div>
        </div>

        <div className="card" style={{ padding: 22 }}>
          <div className="page-title" style={{ fontSize: 17, marginBottom: 6 }}>Got an invite?</div>
          <div className="page-subtitle" style={{ marginBottom: 14 }}>
            Paste the invite code you were sent. It only works for the email it was sent to.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              className="form-input" style={{ flex: 1, minWidth: 200 }}
              placeholder="Invite code"
              value={joinToken} onChange={(e) => setJoinToken(e.target.value)}
            />
            <button className="btn btn-secondary" disabled={busy || !joinToken.trim()}
              onClick={() => run(() => api.acceptHouseholdInvite(joinToken.trim()))}>
              Join
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- in a household ----------
  const isOwner = state.role === "OWNER";
  return (
    <div className="page active">
      <Header />
      {error && <ErrorBar text={error} />}

      <div className="card" style={{ padding: 20, marginBottom: 16, display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ display: "inline-flex", width: 46, height: 46, alignItems: "center", justifyContent: "center", borderRadius: 12, background: "rgba(47,122,91,.10)", color: "var(--tv-forest, #2f7a5b)", flex: "0 0 auto" }}>
          <i className="ti ti-home-heart" style={{ fontSize: 22 }} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{state.name}</div>
          <div className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>
            {state.members?.length || 0} member{(state.members?.length || 0) === 1 ? "" : "s"} · you're the {isOwner ? "owner" : "a member"}
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => api.leaveHousehold())}>
          Leave
        </button>
      </div>

      {/* Members */}
      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div className="page-title" style={{ fontSize: 16, marginBottom: 10 }}>Members</div>
        {(state.members || []).map((m, i, arr) => (
          <div key={m.userId} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < arr.length - 1 ? "1px solid var(--tv-border, rgba(0,0,0,.06))" : "none" }}>
            <span style={{ display: "inline-flex", width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: "50%", background: "var(--tv-forest, #2f7a5b)", color: "#fff", fontWeight: 700, fontSize: 13, flex: "0 0 auto" }}>
              {(m.name || m.email || "?").slice(0, 1).toUpperCase()}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{m.name || m.email || `User ${m.userId}`}</div>
              <div className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>{m.role === "OWNER" ? "Owner" : "Member"}</div>
            </div>
            {isOwner && m.role !== "OWNER" && (
              <button className="btn btn-ghost btn-sm" disabled={busy}
                onClick={() => run(() => api.removeHouseholdMember(m.userId))}>
                Remove
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Invite (owner only) */}
      {isOwner && (
        <div className="card" style={{ padding: 18, marginBottom: 16 }}>
          <div className="page-title" style={{ fontSize: 16, marginBottom: 6 }}>Invite someone</div>
          <div className="page-subtitle" style={{ marginBottom: 12 }}>
            They'll need their own TerraVest login. The code is single-use, expires in 7 days,
            and only works for the email you enter.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              className="form-input" style={{ flex: 1, minWidth: 200 }}
              placeholder="their@email.com" type="email"
              value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
            />
            <button className="btn btn-primary" disabled={busy || !inviteEmail.trim()}
              onClick={() => run(async () => {
                const res = await api.inviteToHousehold(inviteEmail.trim());
                setInviteLink(res?.token || "");
                setInviteEmail("");
              })}>
              <i className="ti ti-send" /> Create invite
            </button>
          </div>

          {inviteLink && (
            <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: "rgba(201,151,58,.12)", border: "1px solid var(--tv-gold, #c9973a)" }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Share this code — it's shown once</div>
              <div style={{ fontSize: 12.5, wordBreak: "break-all", fontFamily: "monospace", marginBottom: 8 }}>{inviteLink}</div>
              <button className="btn btn-secondary btn-sm"
                onClick={() => navigator.clipboard?.writeText(inviteLink)}>
                <i className="ti ti-copy" /> Copy code
              </button>
            </div>
          )}

          {(state.pendingInvites || []).length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className="page-subtitle" style={{ fontSize: 12.5, marginBottom: 6 }}>Pending invites</div>
              {state.pendingInvites.map((inv) => (
                <div key={inv.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
                  <i className="ti ti-mail" style={{ color: "var(--tv-muted, #7a8a83)" }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5 }}>{inv.email}</span>
                  <button className="btn btn-ghost btn-sm" disabled={busy}
                    onClick={() => run(() => api.revokeHouseholdInvite(inv.id))}>
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Phase 3c — opt-in sharing. Default private: nothing here is on until you turn it on. */}
      <HouseholdSharing accounts={accounts} />

      <div className="page-subtitle" style={{ fontSize: 12 }}>
        Only the accounts you explicitly share above are visible to household members. Your
        transactions, properties and business data are <strong>never</strong> shared.
      </div>
    </div>
  );
}

function Header() {
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="page-title">Household</div>
      <div className="page-subtitle">Share goals and bills with a partner — without sharing everything.</div>
    </div>
  );
}

function ErrorBar({ text }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", marginBottom: 14, borderRadius: 10, background: "rgba(192,57,43,.10)", border: "1px solid var(--tv-red, #c0392b)" }}>
      <i className="ti ti-alert-circle" style={{ color: "var(--tv-red, #c0392b)" }} />
      <span style={{ fontSize: 13.5 }}>{text}</span>
    </div>
  );
}
