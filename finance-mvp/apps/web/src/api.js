import { API_BASE } from "./config/apiBase"; // configurable gateway base (web/iOS/Android)
let authToken =
  localStorage.getItem("terravet_token") || localStorage.getItem("finance_token") || "";

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

export function getStoredEmail() {
  return localStorage.getItem("terravet_email") || "";
}

export function getStoredName() {
  return localStorage.getItem("terravet_name") || "";
}

// Decode the (already-trusted) JWT payload to read the user's roles. Client-side gating only —
// the backend still enforces role checks on every support endpoint.
export function getUserRoles() {
  try {
    const token = authToken || localStorage.getItem("terravet_token") || "";
    const payload = token.split(".")[1];
    if (!payload) return [];
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    const roles = json.roles || [];
    return Array.isArray(roles) ? roles.map((r) => String(r).toUpperCase()) : [];
  } catch {
    return [];
  }
}

// True if the signed-in user is a customer-care agent or admin.
export function isCareAgent() {
  const roles = getUserRoles();
  return roles.includes("CARE") || roles.includes("ADMIN");
}

// True if the signed-in user is an admin (can grant/revoke roles).
export function isAdmin() {
  return getUserRoles().includes("ADMIN");
}

// The signed-in user's id (JWT subject), or null. Used by the Ops portal to show
// the agent their own audited session activity.
export function getCurrentUserId() {
  try {
    const token = authToken || localStorage.getItem("terravet_token") || "";
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return json.sub || null;
  } catch {
    return null;
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
    },
    ...options
  });

  if (!response.ok) {
    // A 401/403 means the stored token is missing, expired, or invalid. Clear it and
    // signal the app so it falls back to the login screen instead of every page erroring.
    if (response.status === 401 || response.status === 403) {
      setAuthToken(null);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("auth:unauthorized"));
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

  // Customer Care / Support (role-gated: CARE or ADMIN)
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
  supportChangeUserRole: (id, role, action) =>
    request(`/api/v1/support/users/${id}/roles`, {
      method: "POST",
      body: JSON.stringify({ role, action })
    }),
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
