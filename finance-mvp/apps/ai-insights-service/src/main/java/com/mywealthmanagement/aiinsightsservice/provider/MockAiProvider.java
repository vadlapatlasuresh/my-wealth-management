package com.mywealthmanagement.aiinsightsservice.provider;

import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * A self-contained {@link AiProvider} that returns curated, realistic personal-finance
 * insights and templated-but-helpful chat replies WITHOUT any network call.
 * <p>
 * TODO: Replace with a real LLM-backed provider. Such an implementation would read
 * configuration keys like {@code ai.provider}, {@code ai.model}, and an API key
 * ({@code ANTHROPIC_API_KEY} for Claude or {@code OPENAI_API_KEY} for OpenAI),
 * assemble the user's financial summary (cash flow, balances, debts, budgets),
 * and call the model to generate tailored insights and chat responses.
 */
@Service
public class MockAiProvider implements AiProvider {

    @Override
    public List<GeneratedInsight> generateInsights(Long userId) {
        List<GeneratedInsight> insights = new ArrayList<>();

        insights.add(GeneratedInsight.builder()
                .title("High credit card utilization")
                .reason("Your revolving credit utilization appears elevated relative to your total available limit. "
                        + "Utilization above 30% can weigh on your credit score and signals reliance on short-term credit.")
                .severity("ACTIONABLE")
                .suggestedAction("Aim to bring utilization below 30% by paying down the highest-balance card first, "
                        + "and consider requesting a credit limit increase to lower your ratio.")
                .build());

        insights.add(GeneratedInsight.builder()
                .title("Emergency fund below target")
                .reason("Your liquid savings cover fewer than three months of essential expenses. "
                        + "A thin emergency buffer increases the risk of taking on debt when unexpected costs arise.")
                .severity("WARNING")
                .suggestedAction("Set up an automatic transfer to a high-yield savings account and build toward "
                        + "3-6 months of essential expenses before increasing discretionary spending.")
                .build());

        insights.add(GeneratedInsight.builder()
                .title("Review recurring subscriptions")
                .reason("Several recurring charges recur each month and may include services you no longer actively use. "
                        + "Subscription creep is a common and easily recoverable source of wasted cash flow.")
                .severity("INFO")
                .suggestedAction("Audit your recurring charges and cancel or downgrade any subscriptions you have not "
                        + "used in the last 60 days to redirect that cash toward savings or debt.")
                .build());

        insights.add(GeneratedInsight.builder()
                .title("Opportunity to raise your savings rate")
                .reason("Your current savings rate is below a healthy benchmark for your income level. "
                        + "Small, consistent increases compound meaningfully over time.")
                .severity("ACTIONABLE")
                .suggestedAction("Increase your automated monthly contribution by 1-2% of income now, and again with "
                        + "each pay raise, prioritizing any employer retirement match first.")
                .build());

        insights.add(GeneratedInsight.builder()
                .title("Accelerate high-interest debt payoff")
                .reason("You carry a balance on at least one high-APR account, where interest charges compound quickly "
                        + "and slow your overall progress toward financial goals.")
                .severity("ACTIONABLE")
                .suggestedAction("Apply the avalanche method: direct any extra payment to the highest-APR debt first "
                        + "while making minimums on the rest to minimize total interest paid.")
                .build());

        return insights;
    }

    @Override
    public String chat(String message, List<String> history) {
        String raw = (message == null) ? "" : message;

        // Parse optional control directives the web client prepends, e.g.
        // "[Focus areas: Debt, Budget] [Style: Concise]\n<question>".
        String focus = extract(raw, "Focus areas:");
        String style = extract(raw, "Style:").toLowerCase();
        String question = raw.replaceAll("\\[[^\\]]*\\]", "").trim();
        String q = question.toLowerCase();

        String headline;
        List<String> bullets = new ArrayList<>();
        String closing;

        if (contains(q, "debt", "payoff", "pay off", "avalanche", "snowball", "owe", "loan", "apr")) {
            headline = "Here's how to tackle your debt efficiently:";
            bullets.add("**List every debt** with its balance, APR, and minimum payment.");
            bullets.add("**Avalanche** (cheapest): send extra payments to the highest-APR debt first.");
            bullets.add("**Snowball** (most motivating): clear the smallest balance first for quick wins.");
            bullets.add("Keep paying minimums on everything else to protect your credit score.");
            bullets.add("Direct any windfalls — refunds, bonuses — straight to your target debt.");
            closing = "Open the **Debt Lab** tab to compare Avalanche vs Snowball on your real debts.";
        } else if (contains(q, "emergency", "save", "saving", "savings", "rainy", "cushion")) {
            headline = "Building your savings — a simple, durable plan:";
            bullets.add("Start with a **$1,000 starter buffer**, then grow to **3–6 months** of essential expenses.");
            bullets.add("Keep it in a **high-yield savings account** — liquid, separate from spending.");
            bullets.add("**Automate** a transfer the day after payday so it happens without willpower.");
            bullets.add("Increase the amount with every raise before lifestyle creep absorbs it.");
            closing = "Even $25–$50 per paycheck compounds into real security over a year.";
        } else if (contains(q, "budget", "overspend", "spending", "spend", "expense", "50/30/20")) {
            headline = "Getting your spending under control:";
            bullets.add("Try the **50/30/20 rule**: 50% needs, 30% wants, 20% savings & debt.");
            bullets.add("Review last month's **top 5 categories** — that's where the savings hide.");
            bullets.add("Cancel or downgrade subscriptions you haven't used in 60 days.");
            bullets.add("Set category caps and check them weekly, not just at month end.");
            closing = "The **Budgets** tab lets you set your rule and track each category's pace.";
        } else if (contains(q, "invest", "portfolio", "diversif", "stock", "etf", "retire", "401k", "ira", "index")) {
            headline = "Principles for long-term investing:";
            bullets.add("**Diversify** broadly with low-cost index funds across US, international, and bonds.");
            bullets.add("Capture **every employer 401(k) match** first — it's an instant 100% return.");
            bullets.add("Use **tax-advantaged accounts** (401k/IRA/HSA) before taxable brokerage.");
            bullets.add("Stay invested through volatility; time in the market beats timing the market.");
            closing = "Check the **Investments** tab for your current allocation and holdings.";
        } else if (contains(q, "credit", "score", "utilization", "fico")) {
            headline = "Improving and protecting your credit score:";
            bullets.add("Keep **utilization under 30%** (ideally under 10%) of each card's limit.");
            bullets.add("**Never miss a due date** — payment history is the biggest factor.");
            bullets.add("Keep old accounts open to preserve your average account age.");
            bullets.add("Request a limit increase to lower utilization without spending less.");
            closing = "Pay balances before the statement closes so low utilization gets reported.";
        } else if (contains(q, "refinance", "mortgage", "rate", "heloc")) {
            headline = "Should you refinance? Weigh these factors:";
            bullets.add("Compare your current rate to today's — a drop of **0.75%+** is often worth it.");
            bullets.add("Calculate the **break-even**: closing costs ÷ monthly savings = months to recoup.");
            bullets.add("Factor in how long you'll stay; refinancing rarely pays off if you move soon.");
            bullets.add("Consider a shorter term to save interest if the payment still fits your budget.");
            closing = "Track property value and equity in the **Properties** tab.";
        } else if (contains(q, "net worth", "health", "doing", "summary", "summarize", "overview")) {
            headline = "A quick financial health checklist:";
            bullets.add("**Net worth trending up?** That's the single best long-term signal.");
            bullets.add("**Emergency fund** at 3–6 months of expenses?");
            bullets.add("**High-interest debt** being actively paid down?");
            bullets.add("**Savings rate** of 15–20% of income, including any match?");
            bullets.add("**Credit utilization** under 30%?");
            closing = "Your Home dashboard shows net worth, cash, investments, and debt at a glance.";
        } else if (contains(q, "tax", "deduction", "write off", "hsa")) {
            headline = "Smart, everyday tax moves:";
            bullets.add("Max out **tax-advantaged accounts** (401k, IRA, HSA) to lower taxable income.");
            bullets.add("An **HSA** is triple-tax-advantaged if you have an eligible health plan.");
            bullets.add("Harvest investment losses in taxable accounts to offset gains.");
            bullets.add("Keep records of deductible expenses throughout the year, not just in April.");
            closing = "Consult a tax professional for moves specific to your situation.";
        } else {
            headline = "Here's some grounded guidance to get you started:";
            bullets.add("Build a **starter emergency fund**, then attack high-interest debt.");
            bullets.add("**Automate** your savings and investing so progress is effortless.");
            bullets.add("Keep **credit utilization low** and review recurring expenses regularly.");
            bullets.add("Invest the long-term money in **low-cost, diversified index funds**.");
            closing = "Ask me about debt, budgeting, saving, investing, credit, or taxes for specifics.";
        }

        boolean concise = style.startsWith("concise");
        boolean detailed = style.startsWith("detailed");

        StringBuilder reply = new StringBuilder();
        reply.append(headline).append("\n");
        int limit = concise ? Math.min(2, bullets.size()) : bullets.size();
        for (int i = 0; i < limit; i++) {
            reply.append("- ").append(bullets.get(i)).append("\n");
        }
        if (!concise) {
            reply.append("\n").append(closing);
        }
        if (detailed && !focus.isBlank()) {
            reply.append("\n\n_Tailored to your selected focus: ").append(focus).append("._");
        }
        reply.append("\n\n_Educational information, not personalized financial advice._");
        return reply.toString();
    }

    /** Pull the value after a "[Label: value]" directive, or "" if absent. */
    private String extract(String text, String label) {
        java.util.regex.Matcher m = java.util.regex.Pattern
                .compile("\\[\\s*" + java.util.regex.Pattern.quote(label) + "([^\\]]*)\\]")
                .matcher(text);
        return m.find() ? m.group(1).trim() : "";
    }

    private boolean contains(String haystack, String... needles) {
        for (String n : needles) {
            if (haystack.contains(n)) return true;
        }
        return false;
    }
}
