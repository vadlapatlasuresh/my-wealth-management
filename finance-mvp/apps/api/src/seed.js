import { prisma } from "./db.js";
import { hashPassword } from "./auth.js";

async function run() {
  const email = "demo@finance.app";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log("Seed already exists.");
    await prisma.$disconnect();
    return;
  }

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword("Demo@1234")
    }
  });

  await prisma.account.createMany({
    data: [
      {
        userId: user.id,
        institution: "Chase",
        name: "Everyday Checking",
        type: "CHECKING",
        balance: 18350.42,
        available: 17920.1,
        status: "HEALTHY"
      },
      {
        userId: user.id,
        institution: "SoFi",
        name: "High Yield Savings",
        type: "SAVINGS",
        balance: 23759.78,
        available: 23759.78,
        status: "HEALTHY"
      },
      {
        userId: user.id,
        institution: "American Express",
        name: "Gold Card",
        type: "CREDIT_CARD",
        balance: 2450.56,
        available: 12549.44,
        creditLimit: 15000,
        dueDate: "2026-06-10",
        status: "HEALTHY"
      }
    ]
  });

  const accounts = await prisma.account.findMany({ where: { userId: user.id } });
  const checking = accounts.find((a) => a.type === "CHECKING");
  const card = accounts.find((a) => a.type === "CREDIT_CARD");

  if (checking && card) {
    await prisma.transaction.createMany({
      data: [
        {
          userId: user.id,
          accountId: checking.id,
          date: "2026-05-25",
          description: "Payroll Deposit",
          category: "Income",
          amount: 4250
        },
        {
          userId: user.id,
          accountId: checking.id,
          date: "2026-05-26",
          description: "Rent Payment",
          category: "Housing",
          amount: -1850
        },
        {
          userId: user.id,
          accountId: card.id,
          date: "2026-05-27",
          description: "Grocery Store",
          category: "Groceries",
          amount: -128.44
        }
      ]
    });
  }

  await prisma.aiInsight.createMany({
    data: [
      {
        userId: user.id,
        severity: "actionable",
        title: "Reduce dining spend by $120 this month",
        reason: "Dining is 24% above your 3-month average.",
        suggestedAction: "Adjust dining budget cap to $480 and enable weekly alert."
      },
      {
        userId: user.id,
        severity: "warning",
        title: "Pay your card before statement close",
        reason: "Card utilization is trending up.",
        suggestedAction: "Schedule a payment this week."
      }
    ]
  });

  await prisma.aggregationItem.createMany({
    data: [
      {
        userId: user.id,
        provider: "MockAggregator",
        institution: "Chase",
        status: "LINKED"
      },
      {
        userId: user.id,
        provider: "MockAggregator",
        institution: "SoFi",
        status: "LINKED"
      }
    ]
  });

  await prisma.category.createMany({
    data: [
      { name: "Groceries" },
      { name: "Dining" },
      { name: "Rent" },
      { name: "Utilities" },
      { name: "Transportation" }
    ]
  });

  const budget = await prisma.budget.create({
    data: {
      userId: user.id,
      month: "2026-05",
      lines: {
        create: [
          { category: "Groceries", amount: 600 },
          { category: "Dining", amount: 480 },
          { category: "Rent", amount: 1850 },
          { category: "Utilities", amount: 180 },
          { category: "Transportation", amount: 320 }
        ]
      }
    },
    include: { lines: true }
  });

  console.log("Seed created. Demo user: demo@finance.app / Demo@1234");
  await prisma.$disconnect();
}

run().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
