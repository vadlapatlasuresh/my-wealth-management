import { test, expect } from "@playwright/test";

// Browser E2E for TerraVest onboarding, written against the current web UI.
// Prereq: full backend stack running (deploy/start-local.sh) + dev flag
// otp.expose-dev-code=true so email/SMS/MFA codes render in the UI ("Dev code: …").
//
// See finance-mvp/docs/E2E_TEST_SCENARIOS.md for the full scenario catalog.

const uniqueEmail = () => `e2e+${Date.now()}-${Math.floor(Math.random() * 1e4)}@terravest.test`;
const PASSWORD = "Demo1234!";
const PHONE = "5125551234";

// Read the "Dev code: NNNNNN" hint of whichever OTP section is currently visible.
async function readDevCode(page) {
  const hint = page.getByText(/Dev code:/i);
  await expect(hint).toBeVisible();
  const code = (await hint.textContent())?.match(/(\d{6})/)?.[1];
  expect(code, "a 6-digit dev code should render").toBeTruthy();
  return code;
}

// Fill the visible 6-digit OTP input and click its adjacent "Verify" button.
// Targeting the sibling button avoids ambiguity with the "Verify email" send button.
async function enterOtpAndVerify(page, code) {
  const input = page.getByPlaceholder("Enter 6-digit code");
  await input.fill(code);
  await input.locator("xpath=following-sibling::button[1]").click();
}

/**
 * Full KYC signup: name, verified email, password, verified phone, DOB,
 * address and SSN — then accept terms and submit. Registration auto-logs-in,
 * so we land on the dashboard without a separate MFA step.
 */
test("new user can complete KYC signup and reach the dashboard", async ({ page }) => {
  const email = uniqueEmail();
  await page.goto("/");
  await page.getByRole("button", { name: "Create account" }).first().click();

  await page.getByPlaceholder("Alex").fill("E2E");
  await page.getByPlaceholder("Morgan").fill("Tester");

  // Email + verify
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByRole("button", { name: /Verify email/i }).click();
  await enterOtpAndVerify(page, await readDevCode(page));
  await expect(page.getByPlaceholder("you@example.com")).toBeDisabled();

  // Password
  await page.getByPlaceholder("At least 8 characters").fill(PASSWORD);
  await page.getByPlaceholder("Re-enter your password").fill(PASSWORD);

  // Phone + verify (email OTP section is gone now, so only the phone code shows)
  await page.getByPlaceholder("(555) 123-4567").fill(PHONE);
  await page.getByRole("button", { name: /Send code/i }).click();
  await enterOtpAndVerify(page, await readDevCode(page));
  await expect(page.getByPlaceholder("(555) 123-4567")).toBeDisabled();

  // KYC details
  await page.locator('input[type="date"]').fill("1990-01-01");
  await page.getByPlaceholder("123-45-6789").fill("123456789"); // SSN (individual)
  await page.getByPlaceholder("123 Main St").fill("1 Test St");
  await page.getByPlaceholder("San Francisco").fill("Austin");
  await page.getByPlaceholder("CA").fill("TX");
  await page.getByPlaceholder("94105").fill("78701");
  const country = page.getByPlaceholder("United States");
  if (await country.inputValue() === "") await country.fill("United States");

  // Terms + submit
  await page.getByText(/I agree to the/i).click();
  await page.locator('button[type="submit"]').click();

  await expect(page.getByText(/Good morning|Good afternoon|Good evening/i)).toBeVisible({
    timeout: 20_000,
  });
});

/**
 * Returning-user login with MFA. Pre-create the user via the API so we exercise
 * the *login* path specifically, then drive the two-step UI: password → emailed
 * code (read from the "Dev code" hint) → dashboard.
 */
test("returning user can log in with an MFA code", async ({ page, request }) => {
  const email = uniqueEmail();
  const apiBase = process.env.E2E_API_BASE || "http://localhost:8080";
  // Minimal API registration (auto-logs-in server-side, but we only need the account).
  const reg = await request.post(`${apiBase}/api/v1/auth/register`, {
    data: { email, password: PASSWORD, firstName: "Return", accountType: "INDIVIDUAL", mfaChannel: "EMAIL" },
  });
  expect(reg.ok()).toBeTruthy();

  await page.goto("/");
  await page.getByRole("button", { name: "Sign in" }).first().click();
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByPlaceholder("Your password").fill(PASSWORD);
  await page.locator('button[type="submit"]').click();

  // MFA challenge view: enter the emailed code (surfaced as the dev hint).
  await expect(page.getByText(/Verification code/i)).toBeVisible();
  await page.getByPlaceholder("Enter 6-digit code").fill(await readDevCode(page));
  await page.getByRole("button", { name: /Verify|Continue|Confirm/i }).click();

  await expect(page.getByText(/Good morning|Good afternoon|Good evening/i)).toBeVisible({
    timeout: 20_000,
  });
});
