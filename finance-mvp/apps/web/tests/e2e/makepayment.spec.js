// End-to-end coverage for the Make Payment flow: the legacy /billpay redirect,
// category grouping (including that empty categories stay hidden), and the
// pre-filled payment-entry screen. The API is fully stubbed so this is
// deterministic and needs no backend.
import { test, expect } from "@playwright/test";

const ACCOUNTS = [
  { id: 1, name: "Quicksilver", officialName: "Capital One", mask: "4321",
    type: "credit", subtype: "credit card", currentBalance: 1284,
    minimumPayment: 35, lastStatementBalance: 1200, nextPaymentDueDate: "2026-08-05" },
  { id: 2, name: "Home Loan", officialName: "Rocket Mortgage", mask: "9012",
    type: "loan", subtype: "mortgage", currentBalance: 412000,
    minimumPayment: 2148, nextPaymentDueDate: "2026-08-10" },
  { id: 3, name: "Grad Unsubsidized", officialName: "Nelnet", mask: "5540",
    type: "loan", subtype: "student", currentBalance: 28400,
    minimumPayment: 310, nextPaymentDueDate: "2026-08-17" },
  // Mirrors real production data: the backend only reads Plaid's credit liabilities,
  // and Plaid has none for auto loans at all, so these fields are null in prod.
  { id: 5, name: "Auto Loan", officialName: "Toyota Financial", mask: "2277",
    type: "loan", subtype: "auto", currentBalance: 18600,
    minimumPayment: null, nextPaymentDueDate: null },
  // No auto loan on purpose — that section must be hidden.
  { id: 4, name: "Everyday Checking", officialName: "Chase", mask: "2841",
    type: "depository", subtype: "checking", currentBalance: 8420, availableBalance: 8420 },
];

const PROFILE = {
  email: "t@example.com", firstName: "T", lastName: "User",
  accountType: "INDIVIDUAL", ssnMasked: "***-**-1234", dateOfBirth: "1990-01-01",
  addressLine1: "1 Main St", city: "Austin", state: "TX",
  postalCode: "78701", country: "United States",
};

async function stub(page) {
  await page.addInitScript(() => {
    localStorage.setItem("terravet_token", "test-token");
    localStorage.setItem("terravet_email", "t@example.com");
  });
  await page.route("**/api/v1/**", async (route) => {
    const url = route.request().url();
    const json = (body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (url.includes("/auth/me")) return json(PROFILE);
    if (url.includes("/aggregation/accounts")) return json(ACCOUNTS);
    if (url.includes("/bill-pay-intents")) return json({ items: [] });
    if (url.includes("/real-estate")) return json({ items: [] });
    if (url.includes("/ai/insights")) return json({ insights: [] });
    return json({ items: [] });
  });
}

test("legacy /billpay deep link redirects to /make-payment", async ({ page }) => {
  await stub(page);
  await page.goto("/billpay");
  await expect(page).toHaveURL(/\/make-payment$/);
});

test("payee list groups by category and hides empty ones", async ({ page }) => {
  await stub(page);
  await page.goto("/make-payment");

  await expect(page.getByText("Who are you paying?")).toBeVisible();

  // Populated categories render.
  await expect(page.locator(".payee-section-header", { hasText: "Credit Cards" })).toBeVisible();
  await expect(page.locator(".payee-section-header", { hasText: "Mortgage" })).toBeVisible();
  await expect(page.locator(".payee-section-header", { hasText: "Student Loans" })).toBeVisible();

  // Empty category is hidden, not rendered empty.
  await expect(page.locator(".payee-section-header", { hasText: "Other Linked Accounts" })).toHaveCount(0);

  // A loan with no Plaid liability detail must not caption its full principal as a
  // "Next payment" — it falls back to labelling the figure as the balance.
  const autoRow = page.locator(".payee-row", { hasText: "Auto Loan" });
  await expect(autoRow).toContainText("Balance");
  await expect(autoRow).not.toContainText("Next payment");
  await expect(autoRow).toContainText("$18,600");

  // Funding account must not appear as a payee.
  await expect(page.locator(".payee-row", { hasText: "Everyday Checking" })).toHaveCount(0);

  // Lender + next payment amount surface on a loan row.
  const mortgageRow = page.locator(".payee-row", { hasText: "Home Loan" });
  await expect(mortgageRow).toContainText("Rocket Mortgage");
  await expect(mortgageRow).toContainText("$2,148");
});

test("tapping a payee pre-fills the entry screen with its suggested amount", async ({ page }) => {
  await stub(page);
  await page.goto("/make-payment");
  // The stubbed subscription state triggers the trial modal — dismiss it first.
  await page.getByRole("button", { name: "Maybe later" }).click();
  await page.locator(".payee-row", { hasText: "Quicksilver" }).click();

  await expect(page.getByText("Payment details")).toBeVisible();
  await expect(page.locator('input[type="number"]')).toHaveValue("35"); // minimum due
  await expect(page.getByText("Pay from")).toBeVisible();
  await expect(page.getByText("When?")).toBeVisible();
});

test("'Pay a credit card' shortcut is present above the list", async ({ page }) => {
  await stub(page);
  await page.goto("/make-payment");
  await expect(page.getByRole("button", { name: /Pay a credit card/i })).toBeVisible();
});
