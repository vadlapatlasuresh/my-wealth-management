package com.mywealthmanagement.businessfinancialsservice.business.provider;

import com.mywealthmanagement.businessfinancialsservice.business.dto.BusinessDashboardDto;
import com.mywealthmanagement.businessfinancialsservice.business.dto.ExpenseDto;
import com.mywealthmanagement.businessfinancialsservice.business.dto.InvoiceDto;
import com.mywealthmanagement.businessfinancialsservice.business.dto.PnlDto;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/**
 * Deterministic, network-free mock of a business financials provider.
 *
 * All figures are derived from a per-user seed so that repeated calls for the
 * same userId return identical, internally consistent data
 * (netProfit = revenue - expenses).
 *
 * TODO: A production implementation would replace this with a QuickBooks Online
 *       OAuth2 client using the qbo.client-id / qbo.client-secret / qbo.redirect-uri
 *       properties (see application.properties).
 */
@Service
public class MockBusinessDataProvider implements BusinessDataProvider {

    private static final String[] EXPENSE_CATEGORIES = {
            "Payroll", "Rent", "Software & SaaS", "Marketing", "Utilities", "Insurance"
    };
    private static final String[] CUSTOMERS = {
            "Acme Corp", "Globex Inc", "Initech LLC", "Umbrella Co", "Stark Industries", "Wayne Enterprises"
    };
    private static final String[] VENDORS = {
            "AWS", "WeWork", "Slack", "Google Ads", "Pacific Power", "Hartford Insurance"
    };

    // Deterministic seed per user.
    private Random rngFor(Long userId) {
        return new Random(userId == null ? 0L : userId * 2654435761L + 1469598103934665603L);
    }

    private BigDecimal money(double v) {
        return BigDecimal.valueOf(v).setScale(2, RoundingMode.HALF_UP);
    }

    // Base monthly revenue in the 40k-90k range, deterministic per user.
    private double baseRevenue(Long userId) {
        Random r = rngFor(userId);
        return 40000.0 + r.nextInt(50001); // 40000 .. 90000
    }

    // Expenses are 55%-80% of revenue, deterministic per user.
    private double expenseRatio(Long userId) {
        Random r = rngFor(userId);
        r.nextInt(); // advance once so ratio differs from revenue draw
        return 0.55 + (r.nextInt(26) / 100.0); // 0.55 .. 0.80
    }

    @Override
    public BusinessDashboardDto getDashboard(Long userId, String companyName, boolean connected) {
        double revenue = baseRevenue(userId);
        double expenses = revenue * expenseRatio(userId);
        double netProfit = revenue - expenses;

        Random r = rngFor(userId);
        r.nextInt(); r.nextInt(); // advance past revenue/ratio draws
        double cashBalance = 25000.0 + r.nextInt(125001); // 25k .. 150k
        double revenueChangePct = -8.0 + (r.nextInt(331) / 10.0); // -8.0% .. +25.0%

        List<InvoiceDto> invoices = getInvoices(userId);
        double outstanding = invoices.stream()
                .filter(i -> !"PAID".equals(i.getStatus()))
                .mapToDouble(i -> i.getAmount().doubleValue())
                .sum();

        return new BusinessDashboardDto(
                companyName,
                connected,
                money(revenue),
                money(expenses),
                money(netProfit),
                money(cashBalance),
                money(outstanding),
                money(revenueChangePct)
        );
    }

    @Override
    public PnlDto getPnl(Long userId, String period) {
        if (period == null || period.isBlank()) {
            period = "MTD";
        }
        double revenueTotal = baseRevenue(userId);
        double expenseTotal = revenueTotal * expenseRatio(userId);

        // Revenue lines (must sum to revenueTotal).
        List<PnlDto.PnlLine> revenueLines = new ArrayList<>();
        double productRevenue = revenueTotal * 0.65;
        double serviceRevenue = revenueTotal * 0.25;
        double otherRevenue = revenueTotal - productRevenue - serviceRevenue;
        revenueLines.add(new PnlDto.PnlLine("Product Sales", money(productRevenue)));
        revenueLines.add(new PnlDto.PnlLine("Services", money(serviceRevenue)));
        revenueLines.add(new PnlDto.PnlLine("Other Income", money(otherRevenue)));

        // Expense lines (must sum to expenseTotal).
        double[] weights = {0.45, 0.18, 0.12, 0.13, 0.07, 0.05};
        List<PnlDto.PnlLine> expenseLines = new ArrayList<>();
        double allocated = 0.0;
        for (int i = 0; i < EXPENSE_CATEGORIES.length; i++) {
            double amount;
            if (i == EXPENSE_CATEGORIES.length - 1) {
                amount = expenseTotal - allocated; // remainder ensures exact sum
            } else {
                amount = expenseTotal * weights[i];
                allocated += amount;
            }
            expenseLines.add(new PnlDto.PnlLine(EXPENSE_CATEGORIES[i], money(amount)));
        }

        return new PnlDto(
                period,
                revenueLines,
                expenseLines,
                money(revenueTotal),
                money(expenseTotal),
                money(revenueTotal - expenseTotal)
        );
    }

    @Override
    public List<InvoiceDto> getInvoices(Long userId) {
        Random r = rngFor(userId);
        int count = 5 + r.nextInt(4); // 5 .. 8 invoices
        String[] statuses = {"PAID", "OPEN", "OVERDUE"};
        List<InvoiceDto> invoices = new ArrayList<>();
        LocalDate today = LocalDate.of(2026, 6, 6);
        for (int i = 0; i < count; i++) {
            String customer = CUSTOMERS[r.nextInt(CUSTOMERS.length)];
            double amount = 1500.0 + r.nextInt(18501); // 1.5k .. 20k
            String status = statuses[r.nextInt(statuses.length)];
            LocalDate dueDate;
            if ("OVERDUE".equals(status)) {
                dueDate = today.minusDays(5 + r.nextInt(40));
            } else {
                dueDate = today.plusDays(r.nextInt(45));
            }
            invoices.add(new InvoiceDto("INV-" + (1000 + i), customer, money(amount), status, dueDate));
        }
        return invoices;
    }

    @Override
    public List<ExpenseDto> getExpenses(Long userId) {
        Random r = rngFor(userId);
        int count = 6 + r.nextInt(5); // 6 .. 10 expenses
        List<ExpenseDto> expenses = new ArrayList<>();
        LocalDate today = LocalDate.of(2026, 6, 6);
        for (int i = 0; i < count; i++) {
            int vIdx = r.nextInt(VENDORS.length);
            String vendor = VENDORS[vIdx];
            String category = EXPENSE_CATEGORIES[vIdx];
            double amount = 200.0 + r.nextInt(9801); // 200 .. 10k
            LocalDate date = today.minusDays(r.nextInt(30));
            expenses.add(new ExpenseDto("EXP-" + (2000 + i), vendor, category, money(amount), date));
        }
        return expenses;
    }
}
