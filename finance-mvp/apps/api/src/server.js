import express from "express";
import cors from "cors";
import { z } from "zod";
import { prisma } from "./db.js";
import { authMiddleware, comparePassword, hashPassword, signToken } from "./auth.js";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "finance-mvp-api" });
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const loginSchema = registerSchema;

app.post("/v1/auth/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error_code: "VALIDATION_ERROR", message: "Invalid payload" });
  }

  const { email, password } = parsed.data;
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    return res.status(409).json({ error_code: "CONFLICT", message: "Email already exists" });
  }

  const user = await prisma.user.create({
    data: { email, passwordHash: await hashPassword(password) }
  });
  const token = signToken(user);
  return res.status(201).json({ token, user: { id: user.id, email: user.email } });
});

app.post("/v1/auth/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error_code: "VALIDATION_ERROR", message: "Invalid payload" });
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(401).json({ error_code: "UNAUTHORIZED", message: "Invalid credentials" });
  }

  const ok = await comparePassword(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ error_code: "UNAUTHORIZED", message: "Invalid credentials" });
  }

  const token = signToken(user);
  return res.json({ token, user: { id: user.id, email: user.email } });
});

app.get("/v1/me/snapshot", authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const accounts = await prisma.account.findMany({ where: { userId } });
  const properties = await prisma.realEstate.findMany({ where: { userId } });

  const cash = accounts
    .filter((a) => a.type === "CHECKING" || a.type === "SAVINGS")
    .reduce((sum, a) => sum + a.balance, 0);
  const investments = 181029; // Mock value
  const creditCards = accounts
    .filter((a) => a.type === "CREDIT_CARD")
    .reduce((sum, a) => sum + a.balance, 0);
  const loans = 45629; // Mock value for other loans

  // Real estate totals
  const realEstateValue = properties.reduce((sum, p) => sum + (p.currentValue || 0), 0);
  const realEstateEquity = properties.reduce((sum, p) => sum + ((p.currentValue || 0) - (p.loanBalance || 0)), 0);

  const total = cash + investments + realEstateEquity - creditCards - loans;

  // Mock 30-day changes
  const change_30d_net_worth = 15732;
  const change_30d_cash = 2320;
  const change_30d_investments = 10450;
  const change_30d_real_estate_value = 8500;
  const change_30d_real_estate_equity = 1800;
  const change_30d_credit_cards = 1038; // Increase in debt

  // generate a synthetic time series for the snapshot
  function generateSeriesPoints(baseValue, points = 10) {
    // simple upward trend with small noise
    const arr = [];
    for (let i = 0; i < points; i++) {
      const noise = (Math.sin(i * 1.3) + (Math.random() - 0.5) * 0.4) * baseValue * 0.005;
      const value = Math.round((baseValue - (points - 1 - i) * (baseValue * 0.01) + noise) * 100) / 100;
      // timestamp monthly backwards from now
      const ts = new Date();
      ts.setMonth(ts.getMonth() - (points - 1 - i));
      arr.push({ ts: ts.toISOString(), value });
    }
    return arr;
  }

  const range = String(req.query.range || "All");
  let points = 10;
  if (range === "1M") points = 3;
  else if (range === "3M") points = 6;
  else if (range === "1Y") points = 12;

  const series = generateSeriesPoints(total, points);

  return res.json({
    user_id: userId,
    computed_at: new Date().toISOString(),
    net_worth: {
      total: Number(total.toFixed(2)),
      change_30d: change_30d_net_worth
    },
    components: {
      cash: Number(cash.toFixed(2)),
      cash_change_30d: change_30d_cash,
      investments: Number(investments.toFixed(2)),
      investments_change_30d: change_30d_investments,
      credit_cards: Number(creditCards.toFixed(2)),
      credit_cards_change_30d: change_30d_credit_cards,
      loans: Number(loans.toFixed(2)),
      real_estate_value: Number(realEstateValue.toFixed(2)),
      real_estate_value_change_30d: change_30d_real_estate_value,
      real_estate_equity: Number(realEstateEquity.toFixed(2)),
      real_estate_equity_change_30d: change_30d_real_estate_equity,
    },
    series // array of {ts, value}
  });
});

app.get("/v1/accounts", authMiddleware, async (req, res) => {
  const { type } = req.query;
  const items = await prisma.account.findMany({
    where: {
      userId: req.user.id,
      ...(type ? { type: String(type) } : {})
    },
    orderBy: { createdAt: "asc" }
  });
  return res.json({ items });
});

app.get("/v1/transactions", authMiddleware, async (req, res) => {
  const { account_id } = req.query;
  const items = await prisma.transaction.findMany({
    where: {
      userId: req.user.id,
      ...(account_id ? { accountId: String(account_id) } : {})
    },
    orderBy: { createdAt: "desc" }
  });
  return res.json({ items });
});

app.get("/v1/ai/insights", authMiddleware, async (req, res) => {
  // Mocked insights data matching the new UI's expectation
  const insights = [
    {
      id: 'insight_1',
      title: 'Grow your emergency fund',
      description: 'You have $8,250 saved. Aim for $12,600 (3 months) for stronger security.',
      type: 'positive',
      link: '#',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'insight_2',
      title: 'Pay down high-interest debt',
      description: 'You could save $1,248 in interest by paying off your Visa balance of $2,980.',
      type: 'negative',
      link: '#',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'insight_3',
      title: 'Review your subscriptions',
      description: 'You spent $120 on subscriptions last month. Consider canceling unused ones.',
      type: 'neutral',
      link: '#',
      createdAt: new Date().toISOString(),
    },
  ];
  // In a real app, you'd fetch from prisma.aiInsight or generate dynamically
  return res.json({ insights });
});

// Mock API for My Business Dashboard
app.get("/v1/my-business/dashboard", authMiddleware, async (req, res) => {
  const businessValuation = 1200000;
  const valuationChange30d = 100000;
  const totalLoans = 350000;
  const loansChange30d = -7000;
  const netProfit = 85000;
  const netProfitChange30d = 11000;
  const growthPct = 0.12;
  const growthPctChange30d = 0.01;

  const businessLoans = [
    { id: 'loan1', name: 'Business Loan A', balance: 200000, apr: 6.5, monthlyPayment: 2500, type: 'Term Loan' },
    { id: 'loan2', name: 'Business Loan B', balance: 150000, apr: 8.0, monthlyPayment: 1800, type: 'Line of Credit' },
  ];

  const profitLossSummary = {
    revenue: 150000,
    expenses: 65000,
    netProfit: 85000,
  };

  const aiInsight = {
    title: "Profit Margin Improvement",
    description: "Your business profit margin improved by 8% this year due to optimized operational costs.",
    type: "positive",
    link: "#",
  };

  // Generate mock chart data for Business Performance Over Time
  function generateBusinessChartData(baseValue, points = 10) {
    const data = [];
    for (let i = 0; i < points; i++) {
      const noise = (Math.sin(i * 1.5) + (Math.random() - 0.5) * 0.3) * baseValue * 0.008;
      const value = Math.round((baseValue - (points - 1 - i) * (baseValue * 0.005) + noise) * 100) / 100;
      const date = new Date();
      date.setMonth(date.getMonth() - (points - 1 - i));
      data.push({ date: date.toISOString(), value });
    }
    return data;
  }

  const businessPerformanceSeries = generateBusinessChartData(netProfit, 12); // 12 months of data

  return res.json({
    businessValuation,
    valuationChange30d,
    totalLoans,
    loansChange30d,
    netProfit,
    netProfitChange30d,
    growthPct,
    growthPctChange30d,
    businessLoans,
    profitLossSummary,
    aiInsight,
    businessPerformanceSeries,
  });
});

// Mock API for AI Assistant suggestions
app.post("/v1/ai-assistant/suggestions", authMiddleware, async (req, res) => {
  const {
    monthlyIncome,
    monthlyExpenses,
    investmentGoals,
    includeBusinessData,
    includeDebts,
    includeInvestments,
  } = req.body;

  // Simple mock logic to vary suggestions based on inputs
  let debtPriority = 'Medium';
  let investmentPriority = 'Medium';
  let riskPriority = 'Medium';

  if (monthlyExpenses > monthlyIncome * 0.7) { // High expenses relative to income
    debtPriority = 'High';
    riskPriority = 'High';
  }
  if (investmentGoals > 100000 && monthlyIncome - monthlyExpenses < 1000) { // Ambitious goals with low savings capacity
    investmentPriority = 'High';
  }

  const suggestions = {
    debtStrategy: {
      priority: debtPriority,
      title: 'Accelerate High-Interest Debt Payoff',
      description: `Focus an additional $${Math.round((monthlyIncome - monthlyExpenses) * 0.1)}/month on your highest APR debts. This could save you significant interest.`,
      progress: Math.min(90, Math.round(50 + (monthlyIncome - monthlyExpenses) / 100)), // Example progress
      link: '/debt'
    },
    investmentPlan: {
      priority: investmentPriority,
      title: 'Diversify Investment Portfolio',
      description: `Allocate $${Math.round((monthlyIncome - monthlyExpenses) * 0.2)}/month into a diversified low-cost index fund to work towards your ${currency(investmentGoals)} goal.`,
      progress: Math.min(90, Math.round(30 + investmentGoals / 5000)), // Example progress
      link: '/invest'
    },
    riskManagement: {
      priority: riskPriority,
      title: 'Build Emergency Fund',
      description: `Increase your emergency fund by $${Math.round((monthlyIncome - monthlyExpenses) * 0.15)}/month to cover 6 months of living expenses.`,
      progress: Math.min(90, Math.round(60 - (monthlyExpenses / monthlyIncome * 10))), // Example progress
      link: '#'
    }
  };

  // Adjust suggestions based on inclusion toggles
  if (!includeDebts) {
    suggestions.debtStrategy = {
      priority: 'Low',
      title: 'Debt data not included',
      description: 'Enable "Include debts" to get personalized debt strategies.',
      progress: 0,
      link: '#'
    };
  }
  if (!includeInvestments) {
    suggestions.investmentPlan = {
      priority: 'Low',
      title: 'Investment data not included',
      description: 'Enable "Include investments" to get personalized investment plans.',
      progress: 0,
      link: '#'
    };
  }
  if (!includeBusinessData) {
    // Example: could add a business-specific risk management suggestion if data was included
  }


  return res.json(suggestions);
});


// Aggregation: create link token (mock) and list items
app.post("/v1/aggregation/link-sessions", authMiddleware, async (req, res) => {
  // In reality you'd return a provider link token; we mock a short-lived token
  return res.json({ link_token: `link_${Date.now()}`, expires_at: new Date(Date.now() + 1000 * 60 * 15) });
});

app.get("/v1/aggregation/items", authMiddleware, async (req, res) => {
  const items = await prisma.aggregationItem.findMany({ where: { userId: req.user.id } });
  return res.json({ items });
});

// Mock API for linking broker accounts
app.post("/v1/aggregation/link-broker", authMiddleware, async (req, res) => {
  // Simulate linking a broker account
  const { broker_name } = req.body;
  if (!broker_name) {
    return res.status(400).json({ error_code: "VALIDATION_ERROR", message: "broker_name is required" });
  }
  return res.status(200).json({
    message: `Successfully linked ${broker_name} account.`,
    linked_account_id: `broker_${Date.now()}`
  });
});

// Mock API for investment accounts
app.get("/v1/investment-accounts", authMiddleware, async (req, res) => {
  // Return mock investment accounts
  const investmentAccounts = [
    {
      id: 'inv_acc_1',
      name: 'Vanguard Roth IRA',
      broker: 'Vanguard',
      balance: 85000,
      type: 'IRA',
      holdings: [
        { symbol: 'VTSAX', name: 'Vanguard Total Stock Market Index Fund Admiral Shares', quantity: 100, price: 105.50 },
        { symbol: 'VTIAX', name: 'Vanguard Total International Stock Index Fund Admiral Shares', quantity: 50, price: 30.20 },
      ]
    },
    {
      id: 'inv_acc_2',
      name: 'Fidelity 401k',
      broker: 'Fidelity',
      balance: 96000,
      type: '401k',
      holdings: [
        { symbol: 'FXAIX', name: 'Fidelity 500 Index Fund', quantity: 200, price: 150.00 },
        { symbol: 'FSKAX', name: 'Fidelity Total Market Index Fund', quantity: 100, price: 120.00 },
      ]
    }
  ];
  return res.json({ items: investmentAccounts });
});


// Transaction categorization (user override)
app.patch("/v1/transactions/:txId/category", authMiddleware, async (req, res) => {
  const { category } = req.body ?? {};
  if (!category) return res.status(400).json({ error_code: "VALIDATION_ERROR", message: "category required" });
  const tx = await prisma.transaction.updateMany({ where: { id: req.params.txId, userId: req.user.id }, data: { category } });
  if (tx.count === 0) return res.status(404).json({ error_code: "NOT_FOUND", message: "Transaction not found" });
  return res.json({ ok: true });
});

// Budgets: get month budgets and overspend alerts
app.get("/v1/planning/budgets/:month", authMiddleware, async (req, res) => {
  const month = req.params.month;
  const budget = await prisma.budget.findFirst({ where: { userId: req.user.id, month }, include: { lines: true } });
  if (!budget) return res.json({ month, lines: [] });

  // Compute spending per category from transactions for that month
  const from = `${month}-01`;
  const to = `${month}-31`;
  const txs = await prisma.transaction.findMany({ where: { userId: req.user.id, date: { gte: from, lte: to } } });
  const spentByCat = {};
  for (const t of txs) {
    spentByCat[t.category] = (spentByCat[t.category] || 0) + Math.abs(t.amount < 0 ? t.amount : 0);
  }

  const lines = budget.lines.map((ln) => ({ category: ln.category, budget: ln.amount, spent: spentByCat[ln.category] || 0 }));

  // Overspend alerts
  const alerts = lines.filter((l) => l.spent > l.budget).map((l) => ({ category: l.category, over: Number((l.spent - l.budget).toFixed(2)) }));

  return res.json({ month, lines, alerts });
});

app.put("/v1/planning/budgets/:month", authMiddleware, async (req, res) => {
  const month = req.params.month;
  const { lines } = req.body ?? {};
  if (!Array.isArray(lines)) return res.status(400).json({ error_code: "VALIDATION_ERROR", message: "lines required" });

  // Upsert budget and lines (simple replace)
  let budget = await prisma.budget.findFirst({ where: { userId: req.user.id, month } });
  if (!budget) {
    budget = await prisma.budget.create({ data: { userId: req.user.id, month } });
  }
  // Delete existing lines then create new
  await prisma.budgetLine.deleteMany({ where: { budgetId: budget.id } });
  const created = await prisma.budgetLine.createMany({ data: lines.map((l) => ({ budgetId: budget.id, category: l.category, amount: Number(l.amount) })) });
  return res.json({ ok: true, created: created.count });
});

app.post("/v1/payments/bill-pay-intents", authMiddleware, async (req, res) => {
  const { card_account_id, funding_account_id, amount, currency = "USD" } = req.body;

  if (!card_account_id || !funding_account_id || !amount) {
    return res.status(400).json({
      error_code: "VALIDATION_ERROR",
      message: "card_account_id, funding_account_id and amount are required"
    });
  }

  const intent = await prisma.paymentIntent.create({
    data: {
      userId: req.user.id,
      cardAccountId: card_account_id,
      fundingAccountId: funding_account_id,
      amount: Number(amount),
      currency,
      status: "PENDING",
      estimatedSettlementAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
    }
  });

  return res.status(201).json({
    intent_id: intent.id,
    card_account_id: intent.cardAccountId,
    funding_account_id: intent.fundingAccountId,
    amount: intent.amount,
    currency: intent.currency,
    status: intent.status,
    estimated_settlement_at: intent.estimatedSettlementAt,
    created_at: intent.createdAt
  });
});

app.get("/v1/payments/bill-pay-intents", authMiddleware, async (req, res) => {
  const items = await prisma.paymentIntent.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" }
  });
  return res.json({
    items: items.map((intent) => ({
      intent_id: intent.id,
      card_account_id: intent.cardAccountId,
      funding_account_id: intent.fundingAccountId,
      amount: intent.amount,
      currency: intent.currency,
      status: intent.status,
      estimated_settlement_at: intent.estimatedSettlementAt,
      created_at: intent.createdAt
    }))
  });
});

app.get("/v1/payments/bill-pay-intents/:intentId", authMiddleware, async (req, res) => {
  const intent = await prisma.paymentIntent.findFirst({
    where: { id: req.params.intentId, userId: req.user.id }
  });
  if (!intent) {
    return res.status(404).json({
      error_code: "NOT_FOUND",
      message: "Payment intent not found"
    });
  }
  return res.json({
    intent_id: intent.id,
    card_account_id: intent.cardAccountId,
    funding_account_id: intent.fundingAccountId,
    amount: intent.amount,
    currency: intent.currency,
    status: intent.status,
    estimated_settlement_at: intent.estimatedSettlementAt,
    created_at: intent.createdAt
  });
});

app.post("/v1/planning/debt-scenarios", authMiddleware, (req, res) => {
  const { strategy = "AVALANCHE", extra_payment_monthly = 300 } = req.body ?? {};

  const base = {
    AVALANCHE: { months_to_debt_free: 22, total_interest_paid: 4120, debt_free_date: '2028-03-01', liquidity: 'Medium' },
    SNOWBALL: { months_to_debt_free: 25, total_interest_paid: 4580, debt_free_date: '2028-06-01', liquidity: 'Med-High' },
    HYBRID: { months_to_debt_free: 23, total_interest_paid: 4310, debt_free_date: '2028-04-01', liquidity: 'High' }
  };

  const result = base[strategy] ?? base.AVALANCHE;
  const adjustedMonths = Math.max(8, result.months_to_debt_free - Math.floor(extra_payment_monthly / 200));
  const adjustedInterest = Math.max(1200, result.total_interest_paid - extra_payment_monthly * 2.2);

  // Calculate debt_free_date based on adjustedMonths
  const debtFreeDate = new Date();
  debtFreeDate.setMonth(debtFreeDate.getMonth() + adjustedMonths);

  return res.json({
    scenario_id: `debt_${Date.now()}`,
    strategy,
    months_to_debt_free: adjustedMonths,
    total_interest_paid: Number(adjustedInterest.toFixed(2)),
    debt_free_date: debtFreeDate.toISOString().split('T')[0], // YYYY-MM-DD
    liquidity: result.liquidity,
    assumptions: {
      extra_payment_monthly
    }
  });
});

app.get('/internal/fetch-aggregator-accounts', authMiddleware, async (req, res) => {
  try {
    const integratorUrl = process.env.INTEGRATOR_URL || 'http://127.0.0.1:8080/internal/aggregate/accounts';
    const integratorKey = process.env.INTEGRATOR_KEY || 'dev-integrator-key';
    const url = `${integratorUrl}?userId=${encodeURIComponent(req.user.id)}`;
    const resp = await fetch(url, { headers: { 'x-integrator-key': integratorKey } });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      console.error('Integrator error', resp.status, body);
      return res.status(502).json({ error: 'Integrator error', status: resp.status, body });
    }
    const json = await resp.json();
    return res.json(json);
  } catch (err) {
    console.error('Integrator call failed', err.message || err);
    return res.status(502).json({ error: 'Integrator unavailable' });
  }
});

// Mocked real-estate holdings endpoints
app.get('/v1/real-estate', authMiddleware, async (req, res) => {
  // In a real implementation, we'd query a data source or call an integrator.
  const items = [
    {
      id: 'prop_1',
      user_id: req.user.id,
      address: '1842 Elmwood Drive, Austin TX',
      type: 'Primary',
      purchaseDate: '2019-03-01',
      purchasePrice: 250000,
      loanBalance: 120000,
      currentValue: 187000,
      equity: 67000,
      monthlyPayment: 1450.75,
      lastValuation: new Date().toISOString(),
      notes: 'Primary residence'
    },
    {
      id: 'prop_2',
      user_id: req.user.id,
      address: '903 Ridge View Ln, Round Rock TX',
      type: 'Rental',
      purchaseDate: '2022-01-15',
      purchasePrice: 100000,
      loanBalance: 80000,
      currentValue: 125000,
      equity: 45000,
      monthlyPayment: 800,
      lastValuation: new Date().toISOString(),
      notes: 'Rental property'
    }
  ];
  return res.json({ items });
});

app.get('/v1/real-estate/:id', authMiddleware, async (req, res) => {
  const id = req.params.id;
  // return a mocked detail object matching id
  const base = {
    prop_1: {
      id: 'prop_1',
      address: '1842 Elmwood Drive, Austin TX',
      units: 1,
      purchase_date: '2019-03-01',
      purchase_price: 250000,
      loan_balance: 120000,
      current_value: 187000,
      monthly_payment: 1450.75,
      last_valuation: new Date().toISOString(),
      gross_rent: 0, // Primary residence
      expenses: 500,
      cap_rate: 0,
      equity: 67000,
      notes: 'Primary residence with recent kitchen remodel.'
    },
    prop_2: {
      id: 'prop_2',
      address: '903 Ridge View Ln, Round Rock TX',
      units: 1,
      purchase_date: '2022-01-15',
      purchase_price: 100000,
      loan_balance: 80000,
      current_value: 125000,
      monthly_payment: 800,
      last_valuation: new Date().toISOString(),
      gross_rent: 1500,
      expenses: 300,
      cap_rate: 0.076, // (1500*12 - 300*12) / 125000
      equity: 45000,
      notes: 'Rental property; new tenants moved in last month.'
    }
  };

  const detail = base[id] || null;
  if (!detail) return res.status(404).json({ error: 'not_found' });
  return res.json(detail);
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({
    error_code: "INTERNAL_ERROR",
    message: "Unexpected server error"
  });
});

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});