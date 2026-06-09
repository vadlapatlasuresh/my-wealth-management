import { defineConfig, devices } from "@playwright/test";

// Browser E2E for the TerraVest web app. Assumes the full backend stack is
// already running (bash deploy/start-local.sh) and reuses a dev server on 5173.
// Run:  npm run e2e        (headless)
//       npm run e2e:headed (watch it click through)
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Reuse the already-running Vite dev server; start one if absent.
  webServer: {
    command: "npm run dev",
    url: process.env.E2E_BASE_URL || "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
