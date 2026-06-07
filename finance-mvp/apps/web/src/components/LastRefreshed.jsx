import React, { useEffect, useState } from "react";
import { timeAgo } from "../utils/format";

/*
 * A small "Updated <time ago>" indicator with an optional refresh button.
 * Drop into any page header so every screen shows when its data was last loaded.
 *
 * Props:
 *   at        - Date | iso string of the last load (defaults to mount time)
 *   onRefresh - optional async fn; shows a spinner while it runs and stamps `at` after
 *   label     - leading word (default "Updated")
 */
export default function LastRefreshed({ at, onRefresh, label = "Updated" }) {
  const [stamp, setStamp] = useState(() => (at ? new Date(at) : new Date()));
  const [, force] = useState(0);
  const [busy, setBusy] = useState(false);

  // Re-stamp whenever the parent supplies a newer `at`.
  useEffect(() => { if (at) setStamp(new Date(at)); }, [at]);

  // Tick every 30s so the relative time stays fresh.
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const handle = async () => {
    if (!onRefresh || busy) return;
    setBusy(true);
    try {
      await onRefresh();
      setStamp(new Date());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--tv-text-muted)" }}>
      <i className="ti ti-clock" style={{ fontSize: 13 }}></i>
      <span>{label} {timeAgo(stamp)}</span>
      {onRefresh && (
        <button
          className="icon-btn"
          title="Refresh data"
          onClick={handle}
          disabled={busy}
          style={{ width: 26, height: 26 }}
        >
          <i className={`ti ti-refresh ${busy ? "spin" : ""}`} style={{ fontSize: 14 }}></i>
        </button>
      )}
    </div>
  );
}
