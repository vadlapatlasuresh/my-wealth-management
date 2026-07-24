// Client runtime feature flags — for integration/provider toggles, kept separate from
// subscription entitlements (config/subscription.jsx). Everything here is OFF by default.
//
// Enable a flag in either of two ways:
//   • build-time env:   VITE_FLAG_<NAME>=1        (e.g. VITE_FLAG_CREDIT_MONITORING=1)
//   • runtime override: localStorage 'tv_flag_<name>' = '1' | '0'   (then reload)
//
// The runtime override wins over the env default, so QA / demos can flip a flag without a
// rebuild. This mirrors the app-wide "config flag + mock fallback" integration pattern.

const truthy = (v) => v === true || v === 1 || v === "1" || v === "true" || v === "on";

export function isFlagEnabled(name, fallback = false) {
  try {
    const ls = typeof localStorage !== "undefined" ? localStorage.getItem(`tv_flag_${name}`) : null;
    if (ls != null) return truthy(ls);
  } catch { /* no localStorage (tests / SSR) */ }
  try {
    const env = import.meta?.env?.[`VITE_FLAG_${name.toUpperCase()}`];
    if (env != null) return truthy(env);
  } catch { /* import.meta unavailable */ }
  return fallback;
}

export function setFlag(name, on) {
  try { localStorage.setItem(`tv_flag_${name}`, on ? "1" : "0"); } catch { /* ignore */ }
}

// Named flags used across the app.
export const FLAGS = {
  // Show the Credit Score / monitoring feature (nav + route content). Off by default.
  CREDIT_MONITORING: "credit_monitoring",
  // Use a REAL bureau provider instead of the built-in demo data. Off ⇒ mock fallback.
  CREDIT_MONITORING_LIVE: "credit_monitoring_live",

  // Show the Benchmarks feature (nav + route content). Off by default.
  BENCHMARKS: "benchmarks",
  // Fetch PEER percentiles from the backend. Off ⇒ the page shows the user's own real figures
  // only. NOTE: unlike the credit flags, "off" here does NOT mean "show sample data" — there is
  // no demo peer dataset anywhere in the app, deliberately. See utils/benchmarks.js.
  BENCHMARKS_LIVE: "benchmarks_live",

  // Show Family / kids mode (nav + route content). Off by default until the guardian data
  // model has been exercised in staging.
  FAMILY_MODE: "family_mode",

  // Offer the Premium "Priority AI" toggle in the assistant. The entitlement is still what
  // grants it — this flag only controls whether the control is surfaced at all.
  PRIORITY_AI: "priority_ai",
};
