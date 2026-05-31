const API_BASE = "http://localhost:4000";
let authToken =
  localStorage.getItem("terravet_token") || localStorage.getItem("finance_token") || "";

// MOCK MODE: set to false to use local API; can be toggled to true for frontend-only dev.
const USE_MOCK = false;

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
  }
};

export function setAuthToken(token) {
  authToken = token;
  if (token) {
    localStorage.setItem("terravet_token", token);
    localStorage.removeItem("finance_token");
  } else {
    localStorage.removeItem("terravet_token");
    localStorage.removeItem("finance_token");
  }
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
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Request failed");
  }
  return response.json();
}

export const api = {
  getToken: () => authToken || (USE_MOCK ? "demo-token" : ""),
  register: (payload) =>
    request("/v1/auth/register", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  login: (payload) =>
    request("/v1/auth/login", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  // range: '1M' | '3M' | '1Y' | 'All'
  getSnapshot: (range = "All") => request(`/v1/me/snapshot?range=${encodeURIComponent(range)}`),
  getAccounts: () => request("/v1/accounts"),
  // fetch aggregator accounts via backend integrator proxy
  getAggregatorAccounts: () => request("/internal/fetch-aggregator-accounts"),
  // real estate endpoints
  getRealEstate: () => request("/v1/real-estate"),
  getRealEstateDetail: (id) => request(`/v1/real-estate/${encodeURIComponent(id)}`),
  getTransactions: () => request("/v1/transactions"),
  getInsights: () => request("/v1/ai/insights"),
  getPaymentIntents: () => request("/v1/payments/bill-pay-intents"),
  createBillPayIntent: (payload) =>
    request("/v1/payments/bill-pay-intents", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  runDebtScenario: (payload) =>
    request("/v1/planning/debt-scenarios", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  // Wave 3 additions
  createAggregationLinkSession: () => request("/v1/aggregation/link-sessions", { method: "POST" }),
  getAggregationItems: () => request("/v1/aggregation/items"),
  categorizeTransaction: (txId, category) =>
    request(`/v1/transactions/${txId}/category`, {
      method: "PATCH",
      body: JSON.stringify({ category })
    }),
  getBudget: (month) => request(`/v1/planning/budgets/${month}`),
  putBudget: (month, lines) =>
    request(`/v1/planning/budgets/${month}`, {
      method: "PUT",
      body: JSON.stringify({ lines })
    })
};
