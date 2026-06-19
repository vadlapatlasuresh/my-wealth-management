// swUpdateBanner.js — a tiny, dependency-free banner shown when the service
// worker has a newer build ready. Rendered as plain DOM (not React) because the
// SW is registered in main.jsx before React mounts, and we want the prompt to
// work even if the app shell itself failed to render from a stale cache.
//
// Why this exists: the app is an offline-first PWA. Without a visible update
// path, a client can stay pinned to an old cached bundle indefinitely (the
// classic "I cleared history but still see the old app"). This gives the user a
// one-click, non-destructive way to load the freshest deploy.

let shown = false;

/**
 * Show a fixed bottom banner offering to reload into the new version.
 * @param {() => void} onReload called when the user clicks "Reload" — should
 *   activate the waiting SW and refresh (i.e. updateSW(true)).
 */
export function showReloadBanner(onReload) {
  if (shown || typeof document === "undefined") return;
  shown = true;

  const bar = document.createElement("div");
  bar.setAttribute("role", "status");
  bar.style.cssText = [
    "position:fixed",
    "left:50%",
    "bottom:20px",
    "transform:translateX(-50%)",
    "z-index:9999",
    "display:flex",
    "align-items:center",
    "gap:14px",
    "max-width:92vw",
    "padding:12px 16px",
    "background:#1A4D3B",
    "color:#fff",
    "border:1px solid rgba(255,255,255,.18)",
    "border-radius:12px",
    "box-shadow:0 10px 30px rgba(0,0,0,.28)",
    "font:600 13px/1.3 'DM Sans',system-ui,sans-serif",
  ].join(";");

  const msg = document.createElement("span");
  msg.textContent = "A new version of TerraVest is available.";
  msg.style.cssText = "font-weight:600;";

  const reload = document.createElement("button");
  reload.textContent = "Reload";
  reload.style.cssText = [
    "cursor:pointer",
    "padding:7px 14px",
    "border:none",
    "border-radius:8px",
    "background:#C9973A",
    "color:#1A2E22",
    "font:700 13px 'DM Sans',system-ui,sans-serif",
  ].join(";");
  reload.onclick = () => {
    reload.disabled = true;
    reload.textContent = "Updating…";
    try {
      onReload();
    } catch {
      window.location.reload();
    }
  };

  const dismiss = document.createElement("button");
  dismiss.setAttribute("aria-label", "Dismiss");
  dismiss.textContent = "✕";
  dismiss.style.cssText =
    "cursor:pointer;background:transparent;border:none;color:rgba(255,255,255,.7);font-size:15px;line-height:1;padding:4px;";
  dismiss.onclick = () => {
    bar.remove();
    shown = false;
  };

  bar.append(msg, reload, dismiss);
  document.body.appendChild(bar);
}
