import { test, expect } from "@playwright/test";

// Backend-free smoke test. Unlike onboarding.spec.js (which drives the full KYC
// flow against a live API), this only asserts the SPA boots and renders the
// login screen. It runs in CI where no backend is available, so it must NOT
// make any authenticated API calls — App.jsx renders <AuthPage> whenever there
// is no token, and AuthPage renders without contacting the server.
test("app boots and renders the login screen with no page errors", async ({ page }) => {
  // Collect uncaught exceptions + console errors so we can fail on a broken boot.
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") pageErrors.push(`console.error: ${msg.text()}`);
  });

  await page.goto("/");

  // Brand is present in the left panel (rendered as an aria-labelled SVG).
  await expect(page.getByLabel("TerraVest").first()).toBeVisible();

  // Login card renders its stable copy.
  await expect(page.getByText("Welcome back")).toBeVisible();
  await expect(page.getByText(/Sign in to continue to your dashboard/i)).toBeVisible();

  // The sign-in / create-account segmented control is interactive.
  await expect(page.getByRole("button", { name: "Sign in" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Create account" }).first()).toBeVisible();

  // No uncaught errors during boot. Ignore network failures from the optional
  // SocialLogin probe / any /api call, which are expected without a backend.
  const fatal = pageErrors.filter(
    (e) => !/Failed to load resource|net::ERR|fetch|Load failed|NetworkError|api\//i.test(e)
  );
  expect(fatal, `unexpected page errors:\n${fatal.join("\n")}`).toEqual([]);
});
