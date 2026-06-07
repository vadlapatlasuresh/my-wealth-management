const API_BASE = "http://localhost:8080"; // Changed to API Gateway port
let authToken =
  localStorage.getItem("terravet_token") || localStorage.getItem("finance_token") || "";

// MOCK MODE: set to false to use local API; can be toggled to true for frontend-only dev.
const USE_MOCK = false; // Set to false to use the real backend

function timeout(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

const MOCK = {
  snapshot: {
    computed_at: new Date().toISOString(),
    net_worth: { total: 128430, change_30d: 2140 },
    components: { cash: 10450, investments: 110000, credit_cards: -22020 },
    // simple timeseries (most recent last) for chart rendering
    series: [110000, 112500, 113200, 114800, 116000, 118500, 120000, 121500, 124000, 128430],
    holdings: [
      { symbol: "VTI", name: "Vanguard Total Stock", qty: 120, price: 248.2, dayChg: 0.82 },
      { symbol: "VXUS", name: "Vanguard Intl Stock", qty: 85, price: 62.4, dayChg: -0.31 },
      { symbol: "BND", name: "Vanguard Bond", qty: 200, price: 72.1, dayChg: 0.12 },
      { symbol: "CASH", name: "Brokerage Cash", qty: 1, price: 12400, dayChg: 0 }
    ]
  },
  accounts: {
    items: [
      { id: "acc_1", name: "Primary Checking", institution: "Acme Bank", type: "CHECKING", balance: 8450, available: 8450, lastSynced: new Date().toISOString(), status: "OK" },
      { id: "acc_2", name: "Savings", institution: "Acme Bank", type: "SAVINGS", balance: 2000, available: 2000, lastSynced: new Date().toISOString(), status: "OK" },
      { id: "card_1", name: "Visa Gold", institution: "BankCard", type: "CREDIT_CARD", balance: 1200, creditLimit: 8000, dueDate: "2026-06-05" , lastSynced: new Date().toISOString(), status: "OK" },
      { id: "card_2", name: "Amex", institution: "PremiumBank", type: "CREDIT_CARD", balance: 20820, creditLimit: 25000, dueDate: "2026-06-12", lastSynced: new Date().toISOString(), status: "OK" }
    ]
  },
  transactions: {
    items: [
      { id: "t1", description: "Paycheck", category: "Income", amount: 4500, date: "2026-05-15" },
      { id: "t2", description: "Acme Grocery", category: "Groceries", amount: -120.5, date: "2026-05-20" },
      { id: "t3", description: "Spotify", category: "Subscriptions", amount: -9.99, date: "2026-05-18" },
      { id: "t4", description: "Rent", category: "Housing", amount: -1600, date: "2026-05-01" }
    ]
  },
  insights: {
    insights: [
      { id: "i1", title: "High credit utilization on Amex", reason: "Your Amex is at 83% utilization.", severity: "actionable", suggested_action: "Pay down balance on Amex to reduce utilization.", created_at: new Date().toISOString() },
      { id: "i2", title: "Emergency fund low", reason: "Cash buffer is below 1 month of expenses.", severity: "warning", suggested_action: "Consider moving $1,000 to savings.", created_at: new Date().toISOString() }
    ]
  },
  paymentIntents: {
    items: [
      { intent_id: "pi_1", amount: 250, currency: "USD", status: "COMPLETED", created_at: new Date().toISOString() }
    ]
  },
  realEstate: {
    items: [
      { id: "re1", address: "123 Main St", value: 350000, mortgage: 200000, equity: 150000, type: "PRIMARY_RESIDENCE" },
      { id: "re2", address: "456 Oak Ave", value: 200000, mortgage: 100000, equity: 100000, type: "RENTAL_PROPERTY" }
    ]
  }
};

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

async function request(path, options = {}) {
  if (USE_MOCK) {
    // small simulated delay
    await timeout(220 + Math.random() * 180);
    if (path === "/v1/me/snapshot") return MOCK.snapshot;
    if (path === "/v1/accounts") return MOCK.accounts;
    if (path === "/v1/transactions") return MOCK.transactions;
    if (path === "/v1/ai/insights") return MOCK.insights;
    if (path === "/v1/payments/bill-pay-intents") {
      if (options.method === "POST") {
        // create a new mock intent
        const body = JSON.parse(options.body || "{}");
        const newIntent = { intent_id: `pi_${Date.now()}`, amount: body.amount || 0, currency: body.currency || "USD", status: "PENDING", created_at: new Date().toISOString() };
        MOCK.paymentIntents.items.unshift(newIntent);
        return newIntent;
      }
      return MOCK.paymentIntents;
    }
    if (path === "/v1/planning/debt-scenarios") {
      // simple mocked response for debt scenario
      return {
        months_to_debt_free: 24,
        total_interest_paid: 4200,
        projection: Array.from({ length: 24 }).map((_, i) => ({ month: i + 1, balance: Math.max(0, 22000 - (i + 1) * 900) }))
      };
    }
    if (path === "/v1/real-estate") return MOCK.realEstate;
    return {};
  }

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
  getToken: () => authToken || (USE_MOCK ? "demo-token" : ""),
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
  getNotifications: () => request("/api/v1/notifications"),
  getNotificationPreferences: () => request("/api/v1/notifications/preferences"),
  putNotificationPreferences: (payload) =>
    request("/api/v1/notifications/preferences", { method: "PUT", body: JSON.stringify(payload) }),
  testNotification: () => request("/api/v1/notifications/test", { method: "POST" }),
  markNotificationRead: (id) => request(`/api/v1/notifications/${id}/read`, { method: "POST" }),

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
