import { defineConfig, devices } from "@playwright/test";

// Browser E2E for the TerraVest web app.
//
// Two modes:
//  • Local full-stack (default): assumes the backend is running
//    (bash deploy/start-local.sh) and reuses a Vite dev server on 5173. This is
//    what onboarding.spec.js needs (live API + OTP dev codes).
//    Run:  npm run e2e        (headless)
//          npm run e2e:headed (watch it click through)
//
//  • CI smoke (E2E_PREVIEW=1): no backend. Serves the *built* SPA with
//    `vite preview` on 4173 and runs the backend-free smoke.spec.js. Used by the
//    GitHub Actions "Web smoke (Playwright)" job.
//    Run:  E2E_PREVIEW=1 npm run e2e -- smoke.spec.js
const PREVIEW = process.env.E2E_PREVIEW === "1";
const PORT = PREVIEW ? 4173 : 5173;
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Preview serves the production build (no HMR, no backend); dev reuses a
    // running server when present.
    command: PREVIEW ? `npm run preview -- --port ${PORT} --strictPort` : "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !PREVIEW,
    timeout: 120_000,
  },
});
