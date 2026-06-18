import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./styles/terravest-theme.css"; // Import the new theme
import "./i18n"; // Initialize i18n (auto-detects language) before first render
import { registerSW } from "virtual:pwa-register";
import { applyTheme, getTheme } from "./theme";
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
  registerSW({ immediate: true });
}

// Apply the saved theme (light/dark/glass) before first paint.
applyTheme(getTheme());

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
