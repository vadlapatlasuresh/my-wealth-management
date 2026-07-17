import React from "react";
import ReactDOM from "react-dom/client";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import OpsPortal from "./components/OpsPortal.jsx";
import OpsLoginPage from "./pages/OpsLoginPage.jsx";
import { isOpsSignedIn, setOpsToken } from "./api";
import { applyTheme, getTheme } from "./theme";
import "./styles/terravest-theme.css";

/**
 * Entry point for the ops portal — its own bundle, its own origin (ops.terravest.app).
 *
 * WHY SEPARATE FROM THE MEMBER APP:
 *  - Different origin = different localStorage. An XSS in the member app cannot read an ops
 *    session that can move money. That is the whole reason this split exists, and it only
 *    became worth doing once ops gained refund powers. This is the property that matters.
 *  - No ops screens, components or permission logic in the member bundle. Not "route-guarded"
 *    or "tree-shaken" — a different build output directory that members never fetch.
 *
 * Being precise about what did NOT move: api.js is shared, so the member bundle still carries
 * the ops URL builders (opsLogin and friends) — the `api` object is a single literal, so those
 * properties survive tree-shaking. That is dead code in the member app, not a capability: the
 * endpoints require a typ=ops token no member can obtain, and they are discoverable from the
 * gateway regardless. Worth splitting if api.js is ever refactored; not worth pretending the
 * bundle is cleaner than it is.
 *
 * Deliberately NOT included from the member entry:
 *  - No service worker / PWA. An ops console that caches offline is one whose staff cannot
 *    tell whether they are looking at live data — on a tool that issues refunds, that is a
 *    way to make a real mistake.
 *  - No i18n / auto-translate. Ops is an internal English-language tool; machine-translating
 *    a customer's financial record is a way to misread it.
 *  - No router. The portal is a single shell with its own view switcher (see OpsPortal).
 */

applyTheme(getTheme());

/**
 * Sign-in until there is a valid ops session, the portal after.
 *
 * Listens for `ops:unauthorized` (dispatched by api.js on a 401/403) so an expired session
 * drops straight back to sign-in rather than leaving a shell that fails every call.
 */
function OpsRoot() {
  const [signedIn, setSignedIn] = React.useState(() => isOpsSignedIn());

  React.useEffect(() => {
    const onUnauthorized = () => setSignedIn(false);
    window.addEventListener("ops:unauthorized", onUnauthorized);
    return () => window.removeEventListener("ops:unauthorized", onUnauthorized);
  }, []);

  const signOut = React.useCallback(() => {
    setOpsToken(null);
    setSignedIn(false);
  }, []);

  if (!signedIn) return <OpsLoginPage onSignedIn={() => setSignedIn(true)} />;
  return <OpsPortal handleLogout={signOut} />;
}

// Any service worker registered while /ops lived on the member origin would still be
// controlling this page after the split. Unregister aggressively: a stale SW here could
// serve a cached ops bundle against a live backend, which on a money-moving tool is worse
// than a slow page.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations?.().then((rs) => rs.forEach((r) => r.unregister()));
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <OpsRoot />
    </ErrorBoundary>
  </React.StrictMode>
);
