import { API_BASE } from "./config/apiBase"; // configurable gateway base (web/iOS/Android)
let authToken =
  localStorage.getItem("terravet_token") || localStorage.getItem("finance_token") || "";

// Ops-staff token, kept in a SEPARATE slot from the member token. Ops identity is a different
// account with a different login, and the backend mints it with a `typ=ops` claim that member
// routes refuse (and vice-versa). Holding one never implies the other: an agent can be signed
// into the ops portal while signed out of the member app, or both at once as different people.
let opsToken = localStorage.getItem("terravest_ops_token") || "";

// NOTE: the frontend always talks to the real backend. (The old USE_MOCK/MOCK
// fixtures were removed so mock data can never leak into the app.)

export function setAuthToken(token, email, name) {
  authToken = token;
  if (token) {
    localStorage.setItem("terravet_token", token);
    localStorage.removeItem("finance_token");
    if (email) localStorage.setItem("terravet_email", email);
    if (name) localStorage.setItem("terravet_name", name);
  } else {
    localStorage.removeItem("terravet_token");
    localStorage.removeItem("terravet_email");
    localStorage.removeItem("terravet_name");
    localStorage.removeItem("finance_token");
  }
}

// --- Ops-staff session -------------------------------------------------------------------
// Mirrors OpsTokens.OPS_PATH_PREFIXES on the backend. The client picks which token to send by
// the same rule the server uses to decide which it will accept, so the two can't drift into
// "the UI sent the wrong identity and got a confusing 403".
const OPS_PATH_PREFIXES = [
  "/api/v1/ops/",
  "/api/v1/support/",
  "/api/v1/aggregation/support/",
  "/api/v1/payments/support/",
  "/api/v1/deals/support/",
  "/api/v1/cpa/admin/",
  "/api/v1/audit/stats",
  "/api/v1/audit/health/"
];

function isOpsPath(path) {
  return OPS_PATH_PREFIXES.some((p) => path.startsWith(p));
}

/** The token to send for a given path: ops routes get the ops token, everything else the member one. */
function tokenFor(path) {
  return isOpsPath(path) ? opsToken : authToken;
}

export function setOpsToken(token, email, name) {
  opsToken = token || "";
  if (token) {
    localStorage.setItem("terravest_ops_token", token);
    if (email) localStorage.setItem("terravest_ops_email", email);
    if (name) localStorage.setItem("terravest_ops_name", name);
  } else {
    localStorage.removeItem("terravest_ops_token");
    localStorage.removeItem("terravest_ops_email");
    localStorage.removeItem("terravest_ops_name");
  }
}

export function getOpsEmail() {
  return localStorage.getItem("terravest_ops_email") || "";
}

export function getOpsName() {
  return localStorage.getItem("terravest_ops_name") || "";
}

/** Decode the ops JWT payload. Client-side display/gating only — the backend re-checks everything. */
function opsClaims() {
  try {
    const payload = (opsToken || "").split(".")[1];
    if (!payload) return null;
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

/** Ops roles (e.g. ["OPS_AGENT"]) from the ops token; empty when signed out. */
export function getOpsRoles() {
  const claims = opsClaims();
  const roles = claims?.roles || [];
  return Array.isArray(roles) ? roles.map((r) => String(r).toUpperCase()) : [];
}

/** The signed-in agent's permission keys (e.g. ["customer.view"]) from the ops token. */
export function getOpsPermissions() {
  const claims = opsClaims();
  const perms = claims?.perms || [];
  return Array.isArray(perms) ? perms.map(String) : [];
}

/**
 * Does the signed-in agent hold this permission?
 *
 * Display gating only — every endpoint re-checks with @PreAuthorize, so a tampered token buys
 * nothing but a UI that offers actions the server refuses. Hiding what someone cannot do is a
 * usability decision, not the security boundary.
 */
export function hasOpsPermission(permission) {
  return getOpsPermissions().includes(permission);
}

/** True while a non-expired ops session exists. Expiry is checked because ops tokens are short-lived
 *  (~60 min), so a stale one would otherwise render the portal shell and then 401 on every call. */
export function isOpsSignedIn() {
  const claims = opsClaims();
  if (!claims || claims.typ !== "ops") return false;
  return !claims.exp || claims.exp * 1000 > Date.now();
}

export function isOpsAdmin() {
  return getOpsRoles().includes("OPS_ADMIN");
}

/** The signed-in ops user's id (their ops_users id — NOT a customer id). */
export function getOpsUserId() {
  return opsClaims()?.sub || null;
}

export function getStoredEmail() {
  return localStorage.getItem("terravet_email") || "";
}

export function getStoredName() {
  return localStorage.getItem("terravet_name") || "";
}

// NOTE: getUserRoles()/getCurrentUserId()/isCareAgent()/isAdmin() are gone. They read roles and
// the subject off the *member* token to gate staff tooling — CARE/ADMIN no longer exist, and the
// ops portal reads its own session instead (isOpsSignedIn / getOpsRoles / getOpsUserId). Nothing
// about a member token can confer ops access any more.

async function request(path, options = {}) {
  const token = tokenFor(path);
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...options
  });

  if (!response.ok) {
    // A 401/403 means the stored token is missing, expired, or invalid. Clear it and
    // signal the app so it falls back to the login screen instead of every page erroring.
    // Ops and member sessions fail independently: an expired ops session must not sign the
    // member out of their own app, and vice-versa.
    if (response.status === 401 || response.status === 403) {
      if (isOpsPath(path)) {
        setOpsToken(null);
        if (typeof window !== "undefined") window.dispatchEvent(new Event("ops:unauthorized"));
      } else {
        setAuthToken(null);
        if (typeof window !== "undefined") window.dispatchEvent(new Event("auth:unauthorized"));
      }
    }
    const error = await response.json().catch(() => ({}));
    const message =
      error.message ||
      error.error ||
      (typeof error === "string" ? error : null) ||
      `Request failed (${response.status})`;
    throw new Error(message);
  }
  // 204 No Content (and other empty bodies, e.g. DELETEs) have nothing to parse —
  // calling response.json() on them throws "Unexpected end of JSON input".
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

// Multipart upload — do NOT set Content-Type so the browser adds the boundary.
async function uploadRequest(path, formData) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
    body: formData
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      setAuthToken(null);
      if (typeof window !== "undefined") window.dispatchEvent(new Event("auth:unauthorized"));
    }
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || `Upload failed (${response.status})`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

// Authenticated binary fetch → object URL (the download endpoint needs the Bearer
// token, so a plain <a href> can't be used). Caller should revokeObjectURL when done.
async function fetchObjectUrl(path) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) }
  });
  if (!response.ok) throw new Error(`Download failed (${response.status})`);
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

// Public document-share fetch (recipient has no account). Sends the optional passcode
// as a header, never a query param, and does NOT attach the Authorization token or
// clear it on 401 — a wrong passcode must not log a signed-in viewer out.
async function sharedRequest(path, passcode) {
  const headers = passcode ? { "X-Share-Passcode": passcode } : {};
  const response = await fetch(`${API_BASE}${path}`, { headers });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || `Request failed (${response.status})`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function sharedFileObjectUrl(path, passcode) {
  const headers = passcode ? { "X-Share-Passcode": passcode } : {};
  const response = await fetch(`${API_BASE}${path}`, { headers });
  if (!response.ok) throw new Error(`Download failed (${response.status})`);
  return URL.createObjectURL(await response.blob());
}

export const api = {
  getToken: () => authToken,
  register: (payload) =>
    request("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  login: (payload) =>
    request("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  // Password reset (forgot password): step 1 emails a code, step 2 sets the new password.
  forgotPassword: (email) =>
    request("/api/v1/auth/password/forgot", {
      method: "POST",
      body: JSON.stringify({ email })
    }),
  resetPassword: (payload) =>
    request("/api/v1/auth/password/reset", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  // Active password strength policy (drives the UI requirements checklist).
  getPasswordPolicy: () => request("/api/v1/auth/password/policy"),
  // Change the signed-in user's password (verifies the current one server-side).
  changePassword: (currentPassword, newPassword) =>
    request("/api/v1/auth/password/change", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword })
    }),
  // Consent ledger: record a ToS/Privacy acceptance (authenticated) + read the
  // signed-in user's full acceptance history.
  acceptDisclaimer: (key, version = 1) =>
    request("/api/v1/content/disclaimers/accept", {
      method: "POST",
      body: JSON.stringify({ key, version })
    }),
  getMyAcceptances: () => request("/api/v1/content/disclaimers/acceptances"),
  // Social sign-in: which providers are enabled (server-side, key-gated), and the
  // Google ID-token exchange for our own JWT.
  getOAuthConfig: () => request("/api/v1/auth/oauth/config"),
  oauthGoogle: (idToken) =>
    request("/api/v1/auth/oauth/google", {
      method: "POST",
      body: JSON.stringify({ idToken })
    }),
  // Permanently delete the signed-in user's account (identity/credentials).
  deleteAccount: () => request("/api/v1/auth/me", { method: "DELETE" }),
  // GDPR/CCPA data export — the user's full data bundle as JSON.
  exportMyData: () => request("/api/v1/me/export"),
  // SMS phone confirmation (signup). sendSmsCode returns { sent, devCode } in dev.
  sendSmsCode: (phone) =>
    request("/api/v1/auth/sms/send", {
      method: "POST",
      body: JSON.stringify({ phone })
    }),
  verifySmsCode: (phone, code) =>
    request("/api/v1/auth/sms/verify", {
      method: "POST",
      body: JSON.stringify({ phone, code })
    }),
  // MFA step 2: exchange the emailed/texted login code for a JWT.
  verifyMfa: (email, code) =>
    request("/api/v1/auth/mfa/verify", {
      method: "POST",
      body: JSON.stringify({ email, code })
    }),
  // Email verification (signup + profile). sendEmailCode returns { sent, devCode } in dev.
  sendEmailCode: (email) =>
    request("/api/v1/auth/email/send", {
      method: "POST",
      body: JSON.stringify({ email })
    }),
  verifyEmailCode: (email, code) =>
    request("/api/v1/auth/email/verify", {
      method: "POST",
      body: JSON.stringify({ email, code })
    }),
  // Full profile (SSN/EIN masked) + update.
  getProfile: () => request("/api/v1/auth/me"),
  updateProfile: (payload) =>
    request("/api/v1/auth/me", { method: "PUT", body: JSON.stringify(payload) }),
  // Plaid Aggregation Endpoints
  createPlaidLinkToken: () =>
    request("/api/v1/aggregation/link-token/create", {
      method: "POST",
    }),
  exchangePlaidPublicToken: (publicToken) =>
    request("/api/v1/aggregation/public-token/exchange", {
      method: "POST",
      body: JSON.stringify({ publicToken })
    }),
  getAccounts: () => request("/api/v1/aggregation/accounts"), // Updated to use new service
  // Unlink (disconnect) a Plaid connection — removes its accounts, transactions & holdings.
  unlinkItem: (plaidItemId) =>
    request(`/api/v1/aggregation/items/${encodeURIComponent(plaidItemId)}`, { method: "DELETE" }),
  // Brokerage positions + trade activity synced from Plaid Investments (Investments tab).
  getHoldings: () => request("/api/v1/aggregation/holdings"),
  // Re-pull holdings + investment activity from the brokers; returns refreshed holdings.
  refreshHoldings: () => request("/api/v1/aggregation/holdings/refresh", { method: "POST" }),
  getInvestmentTransactions: () => request("/api/v1/aggregation/investment-transactions"),
  getTransactions: () => request("/api/v1/aggregation/transactions"), // Updated to use new service
  // Pull-based transaction sync (linked accounts also auto-sync on a schedule + via webhook).
  syncTransactions: () =>
    request("/api/v1/aggregation/transactions/sync", { method: "POST" }),
  // Recurring bills/subscriptions detected from transaction history (upcoming first).
  getRecurringBills: () => request("/api/v1/aggregation/recurring-bills"),
  // Tax: educational federal estimate + the rule set (brackets/deductions) for a year.
  estimateTax: (payload) =>
    request("/api/v1/planning/tax/estimate", { method: "POST", body: JSON.stringify(payload) }),
  // What-if estimate that is NOT saved to history (used for MFJ-vs-MFS comparisons).
  estimateTaxPreview: (payload) =>
    request("/api/v1/planning/tax/estimate?record=false", { method: "POST", body: JSON.stringify(payload) }),
  getTaxRules: (year) => request(`/api/v1/planning/tax/rules${year ? `?year=${year}` : ""}`),
  getTaxYears: () => request("/api/v1/planning/tax/years"),
  // Phase 2: saved tax profile + income suggestion from linked accounts.
  getTaxProfile: () => request("/api/v1/planning/tax/profile"),
  saveTaxProfile: (payload) =>
    request("/api/v1/planning/tax/profile", { method: "PUT", body: JSON.stringify(payload) }),
  getTaxPrefill: () => request("/api/v1/planning/tax/prefill"),
  getTaxGuide: () => request("/api/v1/planning/tax/guide"),
  // Parse an uploaded/pasted W-2 / 1099 / 1098 into suggested figures (stateless; nothing stored).
  // Accepts a string (pasted text) or { text, contentBase64, contentType, filename } so the backend
  // can OCR the raw bytes with Textract when enabled, falling back to the text parser.
  parseTaxDocument: (payload) =>
    request("/api/v1/planning/tax/documents/parse", {
      method: "POST",
      body: JSON.stringify(typeof payload === "string" ? { text: payload } : payload),
    }),
  // Year-over-year estimate history (latest estimate per tax year, persisted on each calculate).
  getTaxHistory: () => request("/api/v1/planning/tax/estimates"),
  // CPA marketplace
  getCpas: (specialty, q) => {
    const p = new URLSearchParams();
    if (specialty) p.set("specialty", specialty);
    if (q) p.set("q", q);
    const qs = p.toString();
    return request(`/api/v1/cpa${qs ? `?${qs}` : ""}`);
  },
  getCpa: (id) => request(`/api/v1/cpa/${id}`),
  connectCpa: (id) => request(`/api/v1/cpa/${id}/connect`, { method: "POST" }),
  reviewCpa: (id, rating, comment) =>
    request(`/api/v1/cpa/${id}/reviews`, { method: "POST", body: JSON.stringify({ rating, comment }) }),
  // CPA self-registration (any logged-in user) + staff moderation (ADMIN/CARE).
  registerCpa: (payload) => request("/api/v1/cpa/register", { method: "POST", body: JSON.stringify(payload) }),
  getPendingCpas: () => request("/api/v1/cpa/admin/pending"),
  approveCpa: (id) => request(`/api/v1/cpa/admin/${id}/approve`, { method: "POST" }),
  rejectCpa: (id) => request(`/api/v1/cpa/admin/${id}/reject`, { method: "POST" }),
  verifyCpa: (id) => request(`/api/v1/cpa/admin/${id}/verify`, { method: "POST" }),
  // Persist a transaction's category (ownership-scoped on the backend).
  categorizeTransaction: (txId, category) =>
    request(`/api/v1/aggregation/transactions/${txId}/category`, {
      method: "PATCH",
      body: JSON.stringify({ category })
    }),

  // Financial Core Service Endpoints
  // The service returns camelCase (netWorth.total, components.creditCards, …) but the web pages
  // read snake_case (net_worth.total, credit_cards, …). Normalize here so both shapes are present.
  getSnapshot: async (range = "All") => {
    const s = await request(`/api/v1/me/snapshot?range=${encodeURIComponent(range)}`);
    if (s && s.netWorth && !s.net_worth) {
      s.net_worth = { total: s.netWorth.total, change_30d: s.netWorth.change30d };
    }
    if (s && s.components) {
      const c = s.components;
      s.components = {
        ...c,
        cash_change_30d: c.cashChange30d ?? c.cash_change_30d,
        investments_change_30d: c.investmentsChange30d ?? c.investments_change_30d,
        credit_cards: c.creditCards ?? c.credit_cards,
        credit_cards_change_30d: c.creditCardsChange30d ?? c.credit_cards_change_30d,
        real_estate_value: c.realEstateValue ?? c.real_estate_value,
        real_estate_value_change_30d: c.realEstateValueChange30d ?? c.real_estate_value_change_30d,
        real_estate_equity: c.realEstateEquity ?? c.real_estate_equity,
        real_estate_equity_change_30d: c.realEstateEquityChange30d ?? c.real_estate_equity_change_30d,
      };
    }
    return s;
  },
  getBudget: (month) => request(`/api/v1/planning/budgets/${month}`), // Updated to use new service
  putBudget: (month, lines) =>
    request(`/api/v1/planning/budgets/${month}`, {
      method: "PUT",
      body: JSON.stringify(lines) // backend expects a raw List<BudgetLineDto>
    }), // Updated to use new service
  // Goals (financial-core, planning)
  getGoals: () => request("/api/v1/planning/goals"),
  addGoal: (payload) =>
    request("/api/v1/planning/goals", { method: "POST", body: JSON.stringify(payload) }),
  updateGoal: (id, payload) =>
    request(`/api/v1/planning/goals/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteGoal: (id) =>
    request(`/api/v1/planning/goals/${id}`, { method: "DELETE" }),
  // Server-side account links (a goal's linked balances feed its auto-tracked progress).
  linkGoalAccount: (id, accountId) =>
    request(`/api/v1/planning/goals/${id}/links`, { method: "POST", body: JSON.stringify({ accountId }) }),
  unlinkGoalAccount: (id, accountId) =>
    request(`/api/v1/planning/goals/${id}/links/${accountId}`, { method: "DELETE" }),
  // Manual contribution ledger.
  getGoalContributions: (id) => request(`/api/v1/planning/goals/${id}/contributions`),
  addGoalContribution: (id, amount, note) =>
    request(`/api/v1/planning/goals/${id}/contributions`, { method: "POST", body: JSON.stringify({ amount, note }) }),

  // Alternative investments (financial-core). Real brokerage linking now goes through
  // Plaid (see getHoldings / getInvestmentTransactions above) rather than a manual flow.
  getAltInvestments: () => request("/api/v1/invest/alts"),
  createAltInvestment: (payload) =>
    request("/api/v1/invest/alts", { method: "POST", body: JSON.stringify(payload) }),
  updateAltInvestment: (id, payload) =>
    request(`/api/v1/invest/alts/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteAltInvestment: (id) =>
    request(`/api/v1/invest/alts/${id}`, { method: "DELETE" }),

  getDebts: () => request("/api/v1/planning/debt-scenarios"), // NEW
  addDebt: (payload) =>
    request("/api/v1/planning/debt-scenarios/add", {
      method: "POST",
      body: JSON.stringify(payload)
    }), // NEW
  // Update a tracked debt (e.g. refresh balance/APR/min from its linked account). Clears cached scenarios.
  updateDebt: (id, payload) =>
    request(`/api/v1/planning/debt-scenarios/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  // Remove a tracked debt (ownership-scoped on the backend). Also clears cached payoff scenarios.
  deleteDebt: (id) =>
    request(`/api/v1/planning/debt-scenarios/${encodeURIComponent(id)}`, { method: "DELETE" }),
  // The planning service returns camelCase (debtFreeDate, totalInterestPaid, …) but the
  // Debt Lab cards read snake_case. Normalize so both shapes are present + a friendly date.
  runDebtScenario: async (payload) => {
    const r = await request("/api/v1/planning/debt-scenarios", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    if (!r || typeof r !== "object") return r;
    const friendly = (raw) => {
      if (!raw) return raw;
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? raw : d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    };
    // Per-debt payoff timeline (camelCase from the service → snake_case + a friendly date).
    const perDebt = (r.perDebt ?? r.per_debt ?? []).map((d) => ({
      ...d,
      months_to_payoff: d.monthsToPayoff ?? d.months_to_payoff,
      payoff_date: friendly(d.payoffDate ?? d.payoff_date),
      total_interest: d.totalInterest ?? d.total_interest,
      total_paid: d.totalPaid ?? d.total_paid,
      starting_balance: d.startingBalance ?? d.starting_balance,
    }));
    return {
      ...r,
      months_to_debt_free: r.monthsToDebtFree ?? r.months_to_debt_free,
      total_interest_paid: r.totalInterestPaid ?? r.total_interest_paid,
      debt_free_date: friendly(r.debtFreeDate ?? r.debt_free_date),
      total_paid: r.totalPaid ?? r.total_paid,
      monthly_budget: r.monthlyBudget ?? r.monthly_budget,
      pays_off: r.paysOff ?? r.pays_off,
      per_debt: perDebt,
      liquidity: r.liquidity,
    };
  }, // Updated to use new service

  // Real Estate Service (Phase 3)
  getRealEstate: () => request("/api/v1/real-estate"),
  getRealEstateDetail: (id) => request(`/api/v1/real-estate/${id}`),
  addProperty: (payload) =>
    request("/api/v1/real-estate", { method: "POST", body: JSON.stringify(payload) }),
  updateProperty: (id, payload) =>
    request(`/api/v1/real-estate/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteProperty: (id) => request(`/api/v1/real-estate/${id}`, { method: "DELETE" }),
  revalueProperty: (id) => request(`/api/v1/real-estate/${id}/revalue`, { method: "POST" }),
  lookupProperty: (address) =>
    request("/api/v1/real-estate/lookup", { method: "POST", body: JSON.stringify({ address }) }),

  // Per-property expense tracking (nested under a property).
  listPropertyExpenses: (id, year) =>
    request(`/api/v1/real-estate/${id}/expenses${year ? `?year=${year}` : ""}`),
  getPropertyExpenseSummary: (id, year) =>
    request(`/api/v1/real-estate/${id}/expenses/summary${year ? `?year=${year}` : ""}`),
  getExpenseCategories: (id) => request(`/api/v1/real-estate/${id}/expenses/categories`),
  addPropertyExpense: (id, body) =>
    request(`/api/v1/real-estate/${id}/expenses`, { method: "POST", body: JSON.stringify(body) }),
  updatePropertyExpense: (id, expId, body) =>
    request(`/api/v1/real-estate/${id}/expenses/${expId}`, { method: "PUT", body: JSON.stringify(body) }),
  deletePropertyExpense: (id, expId) =>
    request(`/api/v1/real-estate/${id}/expenses/${expId}`, { method: "DELETE" }),

  // Deals — user-registered investment opportunities (real estate + other asset classes)
  getDeals: () => request("/api/v1/deals"),
  getDealTaxonomy: () => request("/api/v1/deals/taxonomy"),
  getMarketplace: (filters = {}) => {
    const qs = new URLSearchParams(
      Object.entries(filters).filter(([, v]) => v)
    ).toString();
    return request(`/api/v1/deals/marketplace${qs ? `?${qs}` : ""}`);
  },
  getMyInterests: () => request("/api/v1/deals/my-interests"),
  getWatchlist: () => request("/api/v1/deals/watchlist"),
  watchDeal: (id) => request(`/api/v1/deals/${id}/watch`, { method: "POST" }),
  unwatchDeal: (id) => request(`/api/v1/deals/${id}/watch`, { method: "DELETE" }),
  getDeal: (id) => request(`/api/v1/deals/${id}`),
  createDeal: (payload) =>
    request("/api/v1/deals", { method: "POST", body: JSON.stringify(payload) }),
  updateDeal: (id, payload) =>
    request(`/api/v1/deals/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteDeal: (id) => request(`/api/v1/deals/${id}`, { method: "DELETE" }),
  // Express interest in a deal — shares the investor's contact details with the deal owner.
  expressDealInterest: (id, payload) =>
    request(`/api/v1/deals/${id}/interests`, { method: "POST", body: JSON.stringify(payload) }),
  // Owner-only: the list of investors who expressed interest in a deal.
  getDealInterests: (id) => request(`/api/v1/deals/${id}/interests`),
  // Owner-only: update a lead's status (NEW/CONTACTED/COMMITTED/PASSED).
  updateLeadStatus: (dealId, interestId, status) =>
    request(`/api/v1/deals/${dealId}/interests/${interestId}/status`, { method: "PUT", body: JSON.stringify({ status }) }),
  // Sponsor track record (previous projects) shown on a deal's detail page.
  getDealSponsorProjects: (id) => request(`/api/v1/deals/${id}/sponsor-projects`),
  // Deal documents (link-based: PPM, financials, data room).
  getDealDocuments: (id) => request(`/api/v1/deals/${id}/documents`),
  addDealDocument: (id, payload) =>
    request(`/api/v1/deals/${id}/documents`, { method: "POST", body: JSON.stringify(payload) }),
  deleteDealDocument: (id, docId) =>
    request(`/api/v1/deals/${id}/documents/${docId}`, { method: "DELETE" }),

  // Sponsor track record management (the signed-in user's own previous projects)
  getMySponsorProjects: () => request("/api/v1/sponsor/projects"),
  createSponsorProject: (payload) =>
    request("/api/v1/sponsor/projects", { method: "POST", body: JSON.stringify(payload) }),
  updateSponsorProject: (id, payload) =>
    request(`/api/v1/sponsor/projects/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteSponsorProject: (id) => request(`/api/v1/sponsor/projects/${id}`, { method: "DELETE" }),

  // Business Financials Service (Phase 4)
  getBusinessConnection: () => request("/api/v1/business/connection"),
  getBusinessDashboard: () => request("/api/v1/business/dashboard"),
  getBusinessPnl: (period = "MTD") => request(`/api/v1/business/pnl?period=${encodeURIComponent(period)}`),
  getBusinessInvoices: () => request("/api/v1/business/invoices"),
  getBusinessExpenses: () => request("/api/v1/business/expenses"),
  connectBusiness: () => request("/api/v1/business/connect", { method: "POST" }),
  syncBusiness: () => request("/api/v1/business/sync", { method: "POST" }),

  // Manually-entered businesses + accounts (persisted server-side).
  getManualBusinesses: () => request("/api/v1/business/manual/businesses"),
  createManualBusiness: (payload) =>
    request("/api/v1/business/manual/businesses", { method: "POST", body: JSON.stringify(payload) }),
  updateManualBusiness: (id, payload) =>
    request(`/api/v1/business/manual/businesses/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteManualBusiness: (id) =>
    request(`/api/v1/business/manual/businesses/${id}`, { method: "DELETE" }),
  getBusinessAccounts: (businessId) =>
    request(`/api/v1/business/manual/businesses/${businessId}/accounts`),
  createBusinessAccount: (businessId, payload) =>
    request(`/api/v1/business/manual/businesses/${businessId}/accounts`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  deleteBusinessAccount: (id) =>
    request(`/api/v1/business/manual/accounts/${id}`, { method: "DELETE" }),

  // Which linked (aggregation) accounts are assigned to a business (so the
  // business page shows only business accounts, not the whole aggregation).
  getBusinessLinkedAccounts: (businessId) =>
    request(`/api/v1/business/manual/businesses/${businessId}/linked-accounts`),
  // Global one-to-one map: [{ accountId, businessId }] across all the user's businesses.
  getAllLinkedAccounts: () =>
    request(`/api/v1/business/manual/linked-accounts`),
  setBusinessLinkedAccounts: (businessId, accountIds) =>
    request(`/api/v1/business/manual/businesses/${businessId}/linked-accounts`, {
      method: "PUT",
      body: JSON.stringify({ accountIds }),
    }),

  // Per-account business transactions (persisted server-side).
  // Pass accountId to filter to a single account; omit for the unified list.
  getBusinessTransactions: (businessId, accountId) =>
    request(
      `/api/v1/business/manual/businesses/${businessId}/transactions` +
        (accountId ? `?accountId=${encodeURIComponent(accountId)}` : "")
    ),
  createBusinessTransaction: (businessId, payload) =>
    request(`/api/v1/business/manual/businesses/${businessId}/transactions`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteBusinessTransaction: (id) =>
    request(`/api/v1/business/manual/transactions/${id}`, { method: "DELETE" }),

  // Trackable business invoices (create / send / track + pending payments).
  getManualInvoices: (businessId) =>
    request(`/api/v1/business/manual/businesses/${businessId}/invoices`),
  createManualInvoice: (businessId, payload) =>
    request(`/api/v1/business/manual/businesses/${businessId}/invoices`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateManualInvoice: (id, payload) =>
    request(`/api/v1/business/manual/invoices/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteManualInvoice: (id) =>
    request(`/api/v1/business/manual/invoices/${id}`, { method: "DELETE" }),
  // Send an invoice to the customer by email/SMS. Returns { invoice, deliveryStatus,
  // channel, recipient, publicUrl, message } — message is a copy-to-send fallback.
  sendManualInvoice: (id, payload) =>
    request(`/api/v1/business/manual/invoices/${id}/send`, { method: "POST", body: JSON.stringify(payload) }),
  // Record a received payment + reconcile (optionally link a business transaction).
  recordInvoicePayment: (id, payload) =>
    request(`/api/v1/business/manual/invoices/${id}/payment`, { method: "POST", body: JSON.stringify(payload) }),
  // Public (unauthenticated) invoice view for the customer.
  getPublicInvoice: (token) =>
    request(`/api/v1/business/manual/invoices/public/${encodeURIComponent(token)}`),

  // Per-business document center (link-based). Pass invoiceId to scope to one invoice.
  getBusinessDocuments: (businessId, invoiceId, year) =>
    request(
      `/api/v1/business/manual/businesses/${businessId}/documents` +
        (invoiceId != null ? `?invoiceId=${encodeURIComponent(invoiceId)}` :
          year != null ? `?year=${encodeURIComponent(year)}` : "")
    ),
  createBusinessDocument: (businessId, payload) =>
    request(`/api/v1/business/manual/businesses/${businessId}/documents`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteBusinessDocument: (id) =>
    request(`/api/v1/business/manual/documents/${id}`, { method: "DELETE" }),
  // Whether file uploads are available (GCS configured on the backend).
  getBusinessDocumentConfig: () => request(`/api/v1/business/manual/documents/config`),
  // Upload a file/image to a business's document center. `fields` may include
  // label, docType, note, periodYear, periodMonth, invoiceId.
  uploadBusinessDocument: (businessId, file, fields = {}) => {
    const fd = new FormData();
    fd.append("file", file);
    Object.entries(fields).forEach(([k, v]) => { if (v != null && v !== "") fd.append(k, v); });
    return uploadRequest(`/api/v1/business/manual/businesses/${businessId}/documents/upload`, fd);
  },
  // Fetch an uploaded document as an object URL (authenticated); open/preview it.
  openBusinessDocument: (id) =>
    fetchObjectUrl(`/api/v1/business/manual/documents/${id}/download`),

  // ---------------- Personal Document Center (documents-service) ----------------
  // Folders + documents are per-user; the center is the single source of truth for
  // all of the user's files and the origin of every CPA share.
  getDocCenterConfig: () => request(`/api/v1/documents/config`),
  getDocCenterSummary: () => request(`/api/v1/documents/summary`),
  getDocFolders: () => request(`/api/v1/documents/folders`),
  createDocFolder: (name, parentId) =>
    request(`/api/v1/documents/folders`, { method: "POST", body: JSON.stringify({ name, parentId }) }),
  renameDocFolder: (id, name) =>
    request(`/api/v1/documents/folders/${id}`, { method: "PUT", body: JSON.stringify({ name }) }),
  deleteDocFolder: (id) => request(`/api/v1/documents/folders/${id}`, { method: "DELETE" }),
  // List documents. Pass a folderId to scope to a folder, or root:true for unfiled docs.
  getDocuments: ({ folderId, root } = {}) =>
    request(`/api/v1/documents` +
      (folderId != null ? `?folderId=${encodeURIComponent(folderId)}` : root ? `?root=true` : "")),
  addDocumentLink: (payload) =>
    request(`/api/v1/documents`, { method: "POST", body: JSON.stringify(payload) }),
  updateDocument: (id, payload) =>
    request(`/api/v1/documents/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteDocument: (id) => request(`/api/v1/documents/${id}`, { method: "DELETE" }),
  uploadDocument: (file, fields = {}) => {
    const fd = new FormData();
    fd.append("file", file);
    Object.entries(fields).forEach(([k, v]) => { if (v != null && v !== "") fd.append(k, v); });
    return uploadRequest(`/api/v1/documents/upload`, fd);
  },
  openDocument: (id) => fetchObjectUrl(`/api/v1/documents/${id}/download`),
  // Sharing (owner side).
  getDocShares: () => request(`/api/v1/documents/shares`),
  createDocShare: (payload) =>
    request(`/api/v1/documents/shares`, { method: "POST", body: JSON.stringify(payload) }),
  getDocShareAccess: (id) => request(`/api/v1/documents/shares/${id}/access`),
  revokeDocShare: (id) => request(`/api/v1/documents/shares/${id}/revoke`, { method: "POST" }),
  deleteDocShare: (id) => request(`/api/v1/documents/shares/${id}`, { method: "DELETE" }),
  // Public share access (recipient side, no auth). The token is in the path; the
  // passcode goes in the X-Share-Passcode header (never the URL) so it isn't written
  // to proxy/access logs or browser history.
  getSharedInfo: (token, passcode) =>
    sharedRequest(`/api/v1/documents/shared/${encodeURIComponent(token)}`, passcode),
  // Fetch a shared file's bytes → object URL (caller revokes when done).
  openSharedFile: (token, docId, passcode) =>
    sharedFileObjectUrl(
      `/api/v1/documents/shared/${encodeURIComponent(token)}/file?docId=${encodeURIComponent(docId)}`,
      passcode),

  // Ledger-derived, period-aware KPIs. `period` is THIS_MONTH | THIS_YEAR | T12M | CUSTOM.
  // For CUSTOM, pass from/to as ISO yyyy-MM-dd. Balances/AR are point-in-time (today);
  // revenue/expenses/profit are summed over the resolved range.
  getBusinessSummary: (businessId, period = "THIS_MONTH", from, to) =>
    request(
      `/api/v1/business/manual/businesses/${businessId}/summary?period=${encodeURIComponent(period)}` +
        (from ? `&from=${encodeURIComponent(from)}` : "") +
        (to ? `&to=${encodeURIComponent(to)}` : "")
    ),
  // Consolidated (all businesses) dashboard: per-business breakdown + rollup totals.
  getConsolidatedSummary: (period = "THIS_MONTH", from, to) =>
    request(
      `/api/v1/business/manual/summary?period=${encodeURIComponent(period)}` +
        (from ? `&from=${encodeURIComponent(from)}` : "") +
        (to ? `&to=${encodeURIComponent(to)}` : "")
    ),

  // Reconciliation flags (per-user) for linked or manual transactions, keyed by a
  // stable external id (e.g. "lin-<plaidTransactionId>" or "man-<id>").
  getReconciliations: () => request("/api/v1/business/manual/reconciliations"),
  addReconciliation: (externalId) =>
    request("/api/v1/business/manual/reconciliations", {
      method: "POST",
      body: JSON.stringify({ externalId }),
    }),
  removeReconciliation: (externalId) =>
    request(`/api/v1/business/manual/reconciliations/${encodeURIComponent(externalId)}`, {
      method: "DELETE",
    }),

  // Per-user transaction type/tag overrides, keyed by the same external id.
  getTxOverrides: () => request("/api/v1/business/manual/tx-overrides"),
  // payload: { type?: string|null, tags?: string[] }. Empty type + no tags clears it.
  setTxOverride: (externalId, payload) =>
    request(`/api/v1/business/manual/tx-overrides/${encodeURIComponent(externalId)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteTxOverride: (externalId) =>
    request(`/api/v1/business/manual/tx-overrides/${encodeURIComponent(externalId)}`, {
      method: "DELETE",
    }),

  // Per-business monthly category budgets, as [{ category, monthlyLimit }].
  getBusinessBudgets: (businessId) =>
    request(`/api/v1/business/manual/businesses/${businessId}/budgets`),
  // payload: { monthlyLimit: number }. A limit <= 0 removes the budget.
  setBusinessBudget: (businessId, category, payload) =>
    request(`/api/v1/business/manual/businesses/${businessId}/budgets/${encodeURIComponent(category)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteBusinessBudget: (businessId, category) =>
    request(`/api/v1/business/manual/businesses/${businessId}/budgets/${encodeURIComponent(category)}`, {
      method: "DELETE",
    }),

  // Per-business goals: { reserveTarget, taxRate, taxSetAside }.
  getBusinessGoals: (businessId) =>
    request(`/api/v1/business/manual/businesses/${businessId}/goals`),
  // Partial update: only the fields present in `payload` are changed.
  setBusinessGoals: (businessId, payload) =>
    request(`/api/v1/business/manual/businesses/${businessId}/goals`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  // Per-business vendor overlay: [{ vendorName, status, renewalDate, notes }].
  getBusinessVendors: (businessId) =>
    request(`/api/v1/business/manual/businesses/${businessId}/vendors`),
  // payload: { status?, renewalDate?: 'yyyy-MM-dd'|null, notes? }.
  setBusinessVendor: (businessId, vendorName, payload) =>
    request(`/api/v1/business/manual/businesses/${businessId}/vendors/${encodeURIComponent(vendorName)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteBusinessVendor: (businessId, vendorName) =>
    request(`/api/v1/business/manual/businesses/${businessId}/vendors/${encodeURIComponent(vendorName)}`, {
      method: "DELETE",
    }),

  // AI Insights Service (Phase 5)
  getInsights: () => request("/api/v1/ai/insights"),
  refreshInsights: () => request("/api/v1/ai/insights/refresh", { method: "POST" }),
  chatWithAssistant: (message, history = [], model = "auto") =>
    request("/api/v1/ai/chat", { method: "POST", body: JSON.stringify({ message, history, model }) }),

  // Payment Service (Phase 6)
  getPaymentIntents: () => request("/api/v1/payments/bill-pay-intents"),
  createBillPayIntent: (payload) =>
    request("/api/v1/payments/bill-pay-intents", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  cancelBillPayIntent: (id) =>
    request(`/api/v1/payments/bill-pay-intents/${id}/cancel`, { method: "POST" }),

  // Subscriptions (payment-service). Plan catalog + entitlements come straight from the
  // DB config layer, so a price/trial/feature-flag change reflects on the next fetch.
  getSubscriptionPlans: () => request("/api/v1/subscriptions/plans"),
  getSubscriptionPlan: (planKey) => request(`/api/v1/subscriptions/plans/${encodeURIComponent(planKey)}`),
  getMySubscription: () => request("/api/v1/subscriptions/me"),
  getEntitlements: () => request("/api/v1/subscriptions/entitlements"),
  startTrial: (planKey) =>
    request("/api/v1/subscriptions/trial", { method: "POST", body: JSON.stringify({ planKey }) }),
  // Checkout: collect payment + activate. billingCycle = MONTHLY | ANNUAL.
  // paymentToken starting with "fail" simulates a declined card (payment-failure handling).
  activateSubscription: (payload) =>
    request("/api/v1/subscriptions/activate", { method: "POST", body: JSON.stringify(payload) }),
  changeSubscription: (payload) =>
    request("/api/v1/subscriptions/change", { method: "POST", body: JSON.stringify(payload) }),
  cancelSubscription: () => request("/api/v1/subscriptions/cancel", { method: "POST" }),

  // Notification Service (Phase 7)
  // Signed-in user's real account activity (logins, registrations, etc.) from audit-service.
  getMyActivity: (size = 20) => request(`/api/v1/audit/me?size=${size}`),
  // Admin KPI dashboard (ADMIN/CARE only — backend enforces the role).
  getAuditStats: (days = 30) => request(`/api/v1/audit/stats?days=${days}`),
  getNotifications: () => request("/api/v1/notifications"),
  getNotificationPreferences: () => request("/api/v1/notifications/preferences"),
  putNotificationPreferences: (payload) =>
    request("/api/v1/notifications/preferences", { method: "PUT", body: JSON.stringify(payload) }),
  testNotification: () => request("/api/v1/notifications/test", { method: "POST" }),
  markNotificationRead: (id) => request(`/api/v1/notifications/${id}/read`, { method: "POST" }),
  // Push: server-side config (is push live + the public web-push config) + device
  // token register/unregister for this device.
  getPushConfig: () => request("/api/v1/notifications/push/config"),
  registerDevice: (token, platform = "web") =>
    request("/api/v1/notifications/devices", { method: "POST", body: JSON.stringify({ token, platform }) }),
  unregisterDevice: (token) =>
    request("/api/v1/notifications/devices", { method: "DELETE", body: JSON.stringify({ token }) }),

  // --- Ops-staff auth (separate accounts, separate login, typ=ops token) -------------------
  // Two-step like the member flow: login sends an MFA code, mfa/verify exchanges it for a token.
  // MFA is not skippable here, so opsLogin never returns a token.
  opsLogin: (email, password) =>
    request("/api/v1/ops/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  opsMfaVerify: (email, code) =>
    request("/api/v1/ops/auth/mfa/verify", { method: "POST", body: JSON.stringify({ email, code }) }),
  opsMe: () => request("/api/v1/ops/auth/me"),
  // The agent's own audited trail. NOT supportGetUserActivity — that resolves a customer id,
  // and an ops user is not a customer.
  opsMyActivity: (limit = 50) => request(`/api/v1/ops/auth/me/activity?limit=${limit}`),

  // --- Ops audit trail (needs audit.query) -------------------------------------------------
  // Who accessed this CUSTOMER, by anyone. The counterpart to supportGetUserActivity, which
  // returns what the customer themselves did.
  opsAuditTarget: (userId, limit = 100) =>
    request(`/api/v1/ops/audit/target/${userId}?limit=${limit}`),
  // What a given ops user did, across all customers (+ how many distinct ones they touched).
  opsAuditActor: (opsUserId, days = 30, limit = 100) =>
    request(`/api/v1/ops/audit/actor/${opsUserId}?days=${days}&limit=${limit}`),

  // --- Ops administration (needs ops.user.manage) ------------------------------------------
  opsListPermissions: () => request("/api/v1/ops/admin/permissions"),
  opsListRoles: () => request("/api/v1/ops/admin/roles"),
  opsSetRolePermissions: (roleKey, permissions) =>
    request(`/api/v1/ops/admin/roles/${roleKey}/permissions`, {
      method: "PUT",
      body: JSON.stringify({ permissions })
    }),
  opsListUsers: () => request("/api/v1/ops/admin/users"),
  opsCreateUser: (payload) =>
    request("/api/v1/ops/admin/users", { method: "POST", body: JSON.stringify(payload) }),
  opsSetUserRoles: (id, roles) =>
    request(`/api/v1/ops/admin/users/${id}/roles`, { method: "PUT", body: JSON.stringify({ roles }) }),
  opsSetUserActive: (id, active) =>
    request(`/api/v1/ops/admin/users/${id}/active`, { method: "POST", body: JSON.stringify({ active }) }),

  // Unmask a customer's SSN/EIN last-4. Requires customer.pii.reveal AND a written reason AND the
  // CALLER verified to the PII tier — the server enforces all three. Not part of the 360 view.
  supportRevealPii: (id, reason) =>
    request(`/api/v1/support/users/${id}/pii?reason=${encodeURIComponent(reason)}`),

  // --- Caller verification: prove the person on the phone is the customer -------------------
  // Where the caller stands (tier + attempt timeline). Called when the record opens.
  opsVerifyStatus: (customerId) => request(`/api/v1/ops/verify/${customerId}`),
  // OTP to the customer's REGISTERED device (never one supplied on the call) -> Tier 2.
  opsVerifySendOtp: (customerId) =>
    request(`/api/v1/ops/verify/${customerId}/otp/send`, { method: "POST" }),
  opsVerifyConfirmOtp: (customerId, code) =>
    request(`/api/v1/ops/verify/${customerId}/otp/confirm`, { method: "POST", body: JSON.stringify({ code }) }),
  // A knowledge question to ask, with the expected answer for the agent to compare -> Tier 1.
  opsVerifyKba: (customerId) => request(`/api/v1/ops/verify/${customerId}/kba`),
  opsVerifyConfirmKba: (customerId, factKey, passed) =>
    request(`/api/v1/ops/verify/${customerId}/kba/confirm`, {
      method: "POST",
      body: JSON.stringify({ factKey, passed })
    }),
  // Freeze disclosure + raise a fraud signal — the "can't verify" button.
  opsVerifySuspicious: (customerId, note) =>
    request(`/api/v1/ops/verify/${customerId}/suspicious`, { method: "POST", body: JSON.stringify({ note }) }),

  // --- Notes & escalations (customer.note.write / customer.escalate) -----------------------
  opsListNotes: (userId) => request(`/api/v1/ops/cases/customers/${userId}/notes`),
  opsAddNote: (userId, body, pinned = false) =>
    request(`/api/v1/ops/cases/customers/${userId}/notes`, {
      method: "POST",
      body: JSON.stringify({ body, pinned })
    }),
  opsListEscalations: (userId) => request(`/api/v1/ops/cases/customers/${userId}/escalations`),
  opsEscalationQueue: () => request("/api/v1/ops/cases/escalations"),
  opsRaiseEscalation: (userId, payload) =>
    request(`/api/v1/ops/cases/customers/${userId}/escalations`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  opsResolveEscalation: (id, resolution) =>
    request(`/api/v1/ops/cases/escalations/${id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ resolution })
    }),

  // --- Financial ops (finance.* permissions) ------------------------------------------------
  // A customer's money history + the adjustments against it.
  opsCustomerLedger: (userId) => request(`/api/v1/payments/ops/customers/${userId}/ledger`),
  // What can be proposed + the threshold above which a second approver is required.
  opsAdjustmentOptions: () => request("/api/v1/payments/ops/adjustments/options"),
  opsProposeAdjustment: (payload) =>
    request("/api/v1/payments/ops/adjustments", { method: "POST", body: JSON.stringify(payload) }),
  // The approval queue — everything waiting on a second pair of eyes.
  opsAdjustmentQueue: () => request("/api/v1/payments/ops/adjustments/queue"),
  opsApproveAdjustment: (id, decisionNote) =>
    request(`/api/v1/payments/ops/adjustments/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({ decisionNote })
    }),
  opsRejectAdjustment: (id, decisionNote) =>
    request(`/api/v1/payments/ops/adjustments/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ decisionNote })
    }),
  opsAnomalies: () => request("/api/v1/payments/ops/anomalies"),
  opsDecideAnomaly: (id, decision, decisionNote) =>
    request(`/api/v1/payments/ops/anomalies/${id}/decide`, {
      method: "POST",
      body: JSON.stringify({ decision, decisionNote })
    }),

  // Customer Care / Support (ops-token only; backend enforces the ops roles)
  // Accepts either a string (free-text query) or an object with any of
  // {query, first, last, email, phone, page, size} for the multi-field help-desk search.
  supportSearchUsers: (params = "", page = 0, size = 25) => {
    const p = typeof params === "string" ? { query: params, page, size } : { page, size, ...params };
    const qs = new URLSearchParams();
    ["query", "first", "last", "email", "phone"].forEach((k) => {
      if (p[k] != null && String(p[k]).trim() !== "") qs.set(k, String(p[k]).trim());
    });
    qs.set("page", p.page ?? 0);
    qs.set("size", p.size ?? 25);
    return request(`/api/v1/support/users?${qs.toString()}`);
  },
  supportGetUser: (id) => request(`/api/v1/support/users/${id}`),
  supportGetUserActivity: (id, onlyIssues = false, limit = 100) =>
    request(`/api/v1/support/users/${id}/activity?onlyIssues=${onlyIssues}&limit=${limit}`),
  // supportChangeUserRole is gone: it granted CARE/ADMIN onto a customer row, which is exactly
  // what made an ops agent a member with a platform-wide token. Ops accounts are managed as ops
  // accounts (Phase 2), never from a customer's record.
  // Customer-care READ-ONLY views of a member's data (CARE/ADMIN, audited).
  supportGetAccounts: (id) => request(`/api/v1/aggregation/support/${id}/accounts`),
  supportGetTransactions: (id) => request(`/api/v1/aggregation/support/${id}/transactions`),
  supportGetPayments: (id) => request(`/api/v1/payments/support/${id}/bill-pay-intents`),
  supportGetDeals: (id) => request(`/api/v1/deals/support/${id}`),

  // Legacy / internal (Node API — being retired)
  getAggregatorAccounts: () => request("/internal/fetch-aggregator-accounts"),
  createAggregationLinkSession: () => request("/v1/aggregation/link-sessions", { method: "POST" }),
  getAggregationItems: () => request("/v1/aggregation/items"),
};
