import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { currency } from "../utils/format";

/* HouseholdSharing — opt-in sharing of personal accounts with your household (Phase 3c).

   Default private: nothing is shared until the owner ticks an account here, and un-ticking it
   revokes access immediately. The registry stores only which account was shared and by whom —
   balances are never copied anywhere, which is why the "shared with me" list shows a label and
   an owner rather than a number. */

export default function HouseholdSharing({ accounts = [] }) {
  const [mine, setMine] = useState([]);
  const [sharedWithMe, setSharedWithMe] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.getHouseholdShares();
      setMine(res?.mine ?? []);
      setSharedWithMe(res?.sharedWithMe ?? []);
      setError("");
    } catch (e) {
      setError(e?.message || "Couldn't load sharing settings.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // resourceId is stored as a string server-side; compare loosely against account ids.
  const sharedIds = useMemo(
    () => new Set(mine.map((s) => String(s.resourceId))),
    [mine]
  );
  const shareIdFor = useCallback(
    (accountId) => mine.find((s) => String(s.resourceId) === String(accountId))?.id,
    [mine]
  );

  const toggle = async (acct) => {
    setBusy(true); setError("");
    try {
      const existing = shareIdFor(acct.id);
      if (existing) await api.unshareFromHousehold(existing);
      else await api.shareAccountWithHousehold(acct.id, acct.name || `Account ${acct.id}`);
      await load();
    } catch (e) {
      setError(e?.message || "Couldn't update sharing.");
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return null;

  return (
    <>
      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div className="page-title" style={{ fontSize: 16, marginBottom: 6 }}>Share an account</div>
        <div className="page-subtitle" style={{ marginBottom: 12 }}>
          Nothing is shared until you choose it here. Members see the account and its balance;
          they never see your other accounts, and you can stop sharing at any time.
        </div>

        {error && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", marginBottom: 12, borderRadius: 8, background: "rgba(192,57,43,.10)", border: "1px solid var(--tv-red, #c0392b)" }}>
            <i className="ti ti-alert-circle" style={{ color: "var(--tv-red, #c0392b)" }} />
            <span style={{ fontSize: 13 }}>{error}</span>
          </div>
        )}

        {accounts.length === 0 ? (
          <div className="page-subtitle" style={{ fontSize: 13 }}>Link an account first and it'll appear here.</div>
        ) : (
          accounts.map((a, i) => {
            const on = sharedIds.has(String(a.id));
            return (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < accounts.length - 1 ? "1px solid var(--tv-border, rgba(0,0,0,.06))" : "none" }}>
                <span style={{ display: "inline-flex", width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 9, background: on ? "rgba(47,122,91,.12)" : "rgba(0,0,0,.04)", color: on ? "var(--tv-forest, #2f7a5b)" : "var(--tv-muted, #7a8a83)", flex: "0 0 auto" }}>
                  <i className={on ? "ti ti-users-group" : "ti ti-lock"} style={{ fontSize: 17 }} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {a.name || `Account ${a.id}`}
                  </div>
                  <div className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>
                    {on ? "Shared with your household" : "Private"}
                    {a.currentBalance != null && ` · ${currency(Number(a.currentBalance) || 0)}`}
                  </div>
                </div>
                <button className={`btn btn-sm ${on ? "btn-ghost" : "btn-secondary"}`} disabled={busy}
                  onClick={() => toggle(a)}>
                  {on ? "Stop sharing" : "Share"}
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div className="page-title" style={{ fontSize: 16, marginBottom: 6 }}>Shared with you</div>
        {sharedWithMe.length === 0 ? (
          <div className="page-subtitle" style={{ fontSize: 13 }}>
            Nothing yet. Accounts other members share will appear here.
          </div>
        ) : (
          sharedWithMe.map((s, i, arr) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < arr.length - 1 ? "1px solid var(--tv-border, rgba(0,0,0,.06))" : "none" }}>
              <span style={{ display: "inline-flex", width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 9, background: "rgba(47,122,91,.12)", color: "var(--tv-forest, #2f7a5b)", flex: "0 0 auto" }}>
                <i className="ti ti-users-group" style={{ fontSize: 17 }} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{s.label || `Account ${s.resourceId}`}</div>
                <div className="page-subtitle" style={{ margin: 0, fontSize: 12.5 }}>Shared by {s.ownerName}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
