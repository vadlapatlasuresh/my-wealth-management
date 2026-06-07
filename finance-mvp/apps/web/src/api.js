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
  return response.json();
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
  getTransactions: () => request("/api/v1/aggregation/transactions"), // Updated to use new service

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

  getDebts: () => request("/api/v1/planning/debt-scenarios"), // NEW
  addDebt: (payload) =>
    request("/api/v1/planning/debt-scenarios/add", {
      method: "POST",
      body: JSON.stringify(payload)
    }), // NEW
  // The planning service returns camelCase (debtFreeDate, totalInterestPaid, …) but the
  // Debt Lab cards read snake_case. Normalize so both shapes are present + a friendly date.
  runDebtScenario: async (payload) => {
    const r = await request("/api/v1/planning/debt-scenarios", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    if (!r || typeof r !== "object") return r;
    const rawDate = r.debtFreeDate ?? r.debt_free_date;
    let friendlyDate = rawDate;
    if (rawDate) {
      const d = new Date(rawDate);
      if (!Number.isNaN(d.getTime())) {
        friendlyDate = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
      }
    }
    return {
      ...r,
      months_to_debt_free: r.monthsToDebtFree ?? r.months_to_debt_free,
      total_interest_paid: r.totalInterestPaid ?? r.total_interest_paid,
      debt_free_date: friendlyDate,
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

  // AI Insights Service (Phase 5)
  getInsights: () => request("/api/v1/ai/insights"),
  refreshInsights: () => request("/api/v1/ai/insights/refresh", { method: "POST" }),
  chatWithAssistant: (message, history = []) =>
    request("/api/v1/ai/chat", { method: "POST", body: JSON.stringify({ message, history }) }),

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

  // Customer Care / Support (role-gated: CARE or ADMIN)
  supportSearchUsers: (query = "", page = 0, size = 25) =>
    request(`/api/v1/support/users?query=${encodeURIComponent(query)}&page=${page}&size=${size}`),
  supportGetUser: (id) => request(`/api/v1/support/users/${id}`),
  supportGetUserActivity: (id, onlyIssues = false, limit = 100) =>
    request(`/api/v1/support/users/${id}/activity?onlyIssues=${onlyIssues}&limit=${limit}`),
  supportChangeUserRole: (id, role, action) =>
    request(`/api/v1/support/users/${id}/roles`, {
      method: "POST",
      body: JSON.stringify({ role, action })
    }),

  // Legacy / internal (Node API — being retired)
  getAggregatorAccounts: () => request("/internal/fetch-aggregator-accounts"),
  createAggregationLinkSession: () => request("/v1/aggregation/link-sessions", { method: "POST" }),
  getAggregationItems: () => request("/v1/aggregation/items"),
  categorizeTransaction: (txId, category) =>
    request(`/v1/transactions/${txId}/category`, {
      method: "PATCH",
      body: JSON.stringify({ category })
    }),
};
