import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./styles/terravest-theme.css"; // Import the new theme
import "./i18n"; // Initialize i18n (auto-detects language) before first render
import { registerSW } from "virtual:pwa-register";
import { showReloadBanner } from "./swUpdateBanner";
import { applyTheme, getTheme, applyBg, getBg } from "./theme";
import { loadRemoteConfig } from "./config/remoteConfig";

// Service worker: register it for the WEB/PWA only. Inside the native Capacitor
// app the assets are already bundled locally, and a service worker would
// intercept (and, under the https://localhost WebView, block) API calls — so we
// must NOT register it there, and we unregister any that slipped through.
const isNative =
  typeof window !== "undefined" &&
  window.Capacitor &&
  typeof window.Capacitor.isNativePlatform === "function" &&
  window.Capacitor.isNativePlatform();

if (isNative) {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations?.().then((rs) =>
      rs.forEach((r) => r.unregister())
    );
  }
} else {
  // PWA update flow: when a newer build is cached, show a one-click reload
  // banner instead of silently stranding the client on an old bundle (or
  // surprise-reloading mid-form). Also re-checks for new deploys hourly so
  // long-lived tabs don't go stale. See swUpdateBanner.js + vite.config.js
  // (registerType: "prompt").
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      // Apply the new service worker immediately (skipWaiting, NO forced reload),
      // so the client is never stranded waiting on a banner click — the next
      // natural page load serves the fresh build. We still surface the banner as
      // a one-click "reload now" for users who want it right away.
      updateSW(false).catch(() => {});
      showReloadBanner(() => updateSW(true));
    },
    onRegisteredSW(_swUrl, reg) {
      if (reg) {
        setInterval(() => {
          reg.update().catch(() => {});
        }, 60 * 60 * 1000);
      }
    },
  });
}

// Apply the saved theme (mode + background canvas) before first paint so there's no flash.
applyTheme(getTheme());
applyBg(getBg());

// Warm the remote config cache early (non-blocking). loadRemoteConfig never
// throws; on failure it leaves the cache/DEFAULT in place so the app keeps
// working exactly as before.
loadRemoteConfig();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
