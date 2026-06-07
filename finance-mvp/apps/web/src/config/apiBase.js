// apiBase.js — single source of truth for the API gateway base URL.
//
// Why this matters for cross-platform: on the web/iOS simulator, "localhost"
// reaches the dev machine. But on an Android emulator localhost is the emulator
// itself (the host is 10.0.2.2), and on a physical device you must use the
// machine's LAN IP. So the base must be configurable at build time rather than
// hardcoded.
//
// Resolution order:
//   1. VITE_API_BASE         — explicit build-time override (set in apps/web/.env)
//   2. 10.0.2.2 mapping      — when running inside an Android emulator
//   3. http://localhost:8080 — default for web + iOS simulator
//
// For a physical device, set VITE_API_BASE to e.g. http://192.168.1.50:8080
// (your machine's LAN IP) and rebuild + `npx cap sync`.

const ENV_BASE =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_BASE) ||
  "";

function detectBase() {
  if (ENV_BASE) return ENV_BASE.replace(/\/$/, "");
  // Android emulator exposes the host machine at 10.0.2.2.
  if (
    typeof navigator !== "undefined" &&
    /\bAndroid\b/.test(navigator.userAgent || "") &&
    typeof window !== "undefined" &&
    /^https?:\/\/(localhost|127\.0\.0\.1)/.test(window.location?.origin || "")
  ) {
    return "http://10.0.2.2:8080";
  }
  return "http://localhost:8080";
}

export const API_BASE = detectBase();
export default API_BASE;
