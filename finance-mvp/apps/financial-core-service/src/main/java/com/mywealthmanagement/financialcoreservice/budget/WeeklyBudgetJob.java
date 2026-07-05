package com.mywealthmanagement.financialcoreservice.budget;

import com.mywealthmanagement.financialcoreservice.comms.AlertNotifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * Weekly budget email. Once a week (Monday 08:30 by default — staggered after the
 * net-worth digest and deal-board roundup) it walks every user with a budget for the
 * current month and sends a "spent vs left" summary via {@link AlertNotifier}, gated on
 * each user's budgetAlerts preference. Spend is pulled from account-aggregation
 * (best-effort); when it can't be resolved the digest still goes out with the budgeted
 * figure.
 *
 * Config:
 *   budget.weekly.cron     — schedule (default Monday 08:30)
 *   budget.weekly.enabled  — master switch (default true)
 */
@Component
public class WeeklyBudgetJob {

    private static final Logger log = LoggerFactory.getLogger(WeeklyBudgetJob.class);
    private static final DateTimeFormatter MONTH = DateTimeFormatter.ofPattern("yyyy-MM");

    private final BudgetRepository budgetRepository;
    private final AggregationSpendClient spendClient;
    private final AlertNotifier notifier;
    private final boolean enabled;

    public WeeklyBudgetJob(BudgetRepository budgetRepository,
                           AggregationSpendClient spendClient,
                           AlertNotifier notifier,
                           @Value("${budget.weekly.enabled:true}") boolean enabled) {
        this.budgetRepository = budgetRepository;
        this.spendClient = spendClient;
        this.notifier = notifier;
        this.enabled = enabled;
    }

    @Scheduled(cron = "${budget.weekly.cron:0 30 8 * * MON}")
    public void sendWeeklyBudgets() {
        if (!enabled) return;
        String month = LocalDate.now().format(MONTH);
        List<Budget> budgets = budgetRepository.findByMonth(month);
        if (budgets.isEmpty()) return;

        int sent = 0;
        for (Budget budget : budgets) {
            BigDecimal budgeted = totalBudgeted(budget);
            if (budgeted.signum() <= 0) continue; // nothing budgeted this month — skip
            BigDecimal spent = spendClient.spendForMonth(budget.getUserId(), month);
            notifier.notify(budget.getUserId(), "BUDGET", "Your weekly budget check-in",
                    body(budgeted, spent), "budgetAlerts");
            sent++;
        }
        log.info("weekly-budget: dispatched {} of {} budget digest(s) for {}", sent, budgets.size(), month);
    }

    private static BigDecimal totalBudgeted(Budget budget) {
        if (budget.getLines() == null) return BigDecimal.ZERO;
        return budget.getLines().stream()
                .map(BudgetLine::getAmount)
                .filter(a -> a != null)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /** "You've spent $X of your $Y budget — $Z left this month." Package-private for testing. */
    static String body(BigDecimal budgeted, BigDecimal spent) {
        String budgetedStr = money(budgeted);
        if (spent == null) {
            return "Your budget this month is " + budgetedStr
                    + ". Open TerraVest to see how much you've spent so far.";
        }
        BigDecimal left = budgeted.subtract(spent);
        if (left.signum() < 0) {
            return "You've spent " + money(spent) + " of your " + budgetedStr
                    + " budget — that's " + money(left.abs()) + " over. Time to ease off for the rest of the month.";
        }
        return "You've spent " + money(spent) + " of your " + budgetedStr
                + " budget — " + money(left) + " left to spend this month.";
    }

    private static String money(BigDecimal v) {
        if (v == null) return "$0";
        return "$" + v.setScale(0, RoundingMode.HALF_UP).toPlainString();
    }
}
