package com.mywealthmanagement.businessfinancialsservice.business.provider;

import com.fasterxml.jackson.databind.JsonNode;
import com.mywealthmanagement.businessfinancialsservice.business.QboConnection;
import com.mywealthmanagement.businessfinancialsservice.business.QboConnectionRepository;
import com.mywealthmanagement.businessfinancialsservice.business.dto.BusinessDashboardDto;
import com.mywealthmanagement.businessfinancialsservice.business.dto.ExpenseDto;
import com.mywealthmanagement.businessfinancialsservice.business.dto.InvoiceDto;
import com.mywealthmanagement.businessfinancialsservice.business.dto.PnlDto;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Real {@link BusinessDataProvider} backed by the QuickBooks Online Accounting API.
 * Active only when {@code business.provider=quickbooks} and marked {@link Primary}
 * so it is injected ahead of {@link MockBusinessDataProvider} when present.
 * <p>
 * Each call resolves the user's {@link QboConnection}, obtains a valid access token
 * via {@link QboOAuthService} (refreshing if needed), and queries QBO. If the user
 * has not completed the OAuth connect, or any call fails, it degrades to the mock
 * so the dashboard never hard-fails — mirroring {@code StripePaymentProvider}.
 */
@Service
@Primary
@ConditionalOnProperty(name = "business.provider", havingValue = "quickbooks")
public class QuickBooksBusinessDataProvider implements BusinessDataProvider {

    private static final Logger log = LoggerFactory.getLogger(QuickBooksBusinessDataProvider.class);
    private static final String MINOR_VERSION = "70";

    private final QboConnectionRepository connectionRepository;
    private final QboOAuthService oauth;
    private final MockBusinessDataProvider fallback;
    private final RestClient apiClient;

    public QuickBooksBusinessDataProvider(
            QboConnectionRepository connectionRepository,
            QboOAuthService oauth,
            MockBusinessDataProvider fallback,
            @Value("${qbo.api-base-url:https://quickbooks.api.intuit.com}") String apiBaseUrl) {
        this.connectionRepository = connectionRepository;
        this.oauth = oauth;
        this.fallback = fallback;
        this.apiClient = RestClient.builder().baseUrl(apiBaseUrl).build();
    }

    /** Resolves a live QBO session (realm + valid token) for the user, or empty if not connected. */
    private Optional<Session> session(Long userId) {
        return connectionRepository.findByUserId(userId)
                .filter(c -> c.getRealmId() != null && c.getRefreshToken() != null)
                .map(c -> {
                    String token = oauth.validAccessToken(c);
                    return token == null ? null : new Session(c.getRealmId(), token);
                });
    }

    private JsonNode query(Session s, String sql) {
        String uri = UriComponentsBuilder.fromPath("/v3/company/{realmId}/query")
                .queryParam("query", sql)
                .queryParam("minorversion", MINOR_VERSION)
                .buildAndExpand(s.realmId)
                .toUriString();
        return apiClient.get().uri(uri)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + s.accessToken)
                .header(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE)
                .retrieve().body(JsonNode.class);
    }

    private JsonNode report(Session s, String name) {
        String uri = UriComponentsBuilder.fromPath("/v3/company/{realmId}/reports/{report}")
                .queryParam("minorversion", MINOR_VERSION)
                .buildAndExpand(s.realmId, name)
                .toUriString();
        return apiClient.get().uri(uri)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + s.accessToken)
                .header(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE)
                .retrieve().body(JsonNode.class);
    }

    @Override
    public BusinessDashboardDto getDashboard(Long userId, String companyName, boolean connected) {
        Optional<Session> session = session(userId);
        if (session.isEmpty()) {
            return fallback.getDashboard(userId, companyName, connected);
        }
        try {
            PnlDto pnl = getPnl(userId, "MTD");
            List<InvoiceDto> invoices = getInvoices(userId);
            BigDecimal outstanding = invoices.stream()
                    .filter(i -> !"PAID".equals(i.getStatus()))
                    .map(InvoiceDto::getAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal cash = bankBalance(session.get());
            return new BusinessDashboardDto(
                    companyName,
                    connected,
                    pnl.getTotalRevenue(),
                    pnl.getTotalExpenses(),
                    pnl.getNetProfit(),
                    cash,
                    outstanding,
                    BigDecimal.ZERO // period-over-period change requires a second report; left 0 for now
            );
        } catch (Exception e) {
            log.warn("QBO dashboard failed for user {} ({}); using mock.", userId, e.getMessage());
            return fallback.getDashboard(userId, companyName, connected);
        }
    }

    @Override
    public PnlDto getPnl(Long userId, String period) {
        Optional<Session> session = session(userId);
        if (session.isEmpty()) {
            return fallback.getPnl(userId, period);
        }
        try {
            JsonNode root = report(session.get(), "ProfitAndLoss");
            List<PnlDto.PnlLine> revenueLines = new ArrayList<>();
            List<PnlDto.PnlLine> expenseLines = new ArrayList<>();
            BigDecimal[] totals = new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO};
            if (root != null && root.has("Rows")) {
                walkRows(root.get("Rows").path("Row"), revenueLines, expenseLines, totals);
            }
            BigDecimal revenueTotal = totals[0];
            BigDecimal expenseTotal = totals[1];
            return new PnlDto(
                    period == null || period.isBlank() ? "MTD" : period,
                    revenueLines, expenseLines,
                    revenueTotal, expenseTotal,
                    revenueTotal.subtract(expenseTotal));
        } catch (Exception e) {
            log.warn("QBO P&L failed for user {} ({}); using mock.", userId, e.getMessage());
            return fallback.getPnl(userId, period);
        }
    }

    /**
     * Walks the QBO ProfitAndLoss report tree, collecting leaf line items into the
     * Income/Expense buckets by their section group. QBO marks top-level sections
     * with a "group" of "Income" or "Expenses".
     */
    private void walkRows(JsonNode rows, List<PnlDto.PnlLine> revenue,
                          List<PnlDto.PnlLine> expense, BigDecimal[] totals) {
        if (rows == null) return;
        for (JsonNode row : rows.isArray() ? rows : List.of(rows)) {
            String group = row.path("group").asText("");
            boolean isIncome = group.equalsIgnoreCase("Income");
            boolean isExpense = group.equalsIgnoreCase("Expenses");
            if (isIncome || isExpense) {
                List<PnlDto.PnlLine> target = isIncome ? revenue : expense;
                collectLeaves(row.path("Rows").path("Row"), target);
                BigDecimal summary = summaryValue(row);
                if (isIncome) totals[0] = totals[0].add(summary);
                else totals[1] = totals[1].add(summary);
            } else if (row.has("Rows")) {
                walkRows(row.get("Rows").path("Row"), revenue, expense, totals);
            }
        }
    }

    private void collectLeaves(JsonNode rows, List<PnlDto.PnlLine> target) {
        if (rows == null) return;
        for (JsonNode row : rows.isArray() ? rows : List.of(rows)) {
            if (row.has("Rows")) {
                collectLeaves(row.get("Rows").path("Row"), target);
            } else {
                JsonNode cols = row.path("ColData");
                if (cols.isArray() && cols.size() >= 2) {
                    String label = cols.get(0).path("value").asText("");
                    BigDecimal amount = parseMoney(cols.get(cols.size() - 1).path("value").asText(""));
                    if (!label.isBlank() && amount.signum() != 0) {
                        target.add(new PnlDto.PnlLine(label, amount));
                    }
                }
            }
        }
    }

    private BigDecimal summaryValue(JsonNode sectionRow) {
        JsonNode cols = sectionRow.path("Summary").path("ColData");
        if (cols.isArray() && cols.size() >= 2) {
            return parseMoney(cols.get(cols.size() - 1).path("value").asText(""));
        }
        return BigDecimal.ZERO;
    }

    @Override
    public List<InvoiceDto> getInvoices(Long userId) {
        Optional<Session> session = session(userId);
        if (session.isEmpty()) {
            return fallback.getInvoices(userId);
        }
        try {
            JsonNode resp = query(session.get(), "SELECT * FROM Invoice MAXRESULTS 50");
            JsonNode rows = resp.path("QueryResponse").path("Invoice");
            List<InvoiceDto> out = new ArrayList<>();
            if (rows.isArray()) {
                for (JsonNode inv : rows) {
                    String doc = inv.path("DocNumber").asText("INV");
                    String customer = inv.path("CustomerRef").path("name").asText("Customer");
                    BigDecimal total = parseMoney(inv.path("TotalAmt").asText("0"));
                    BigDecimal balance = parseMoney(inv.path("Balance").asText("0"));
                    LocalDate due = parseDate(inv.path("DueDate").asText(null));
                    String status = balance.signum() == 0 ? "PAID"
                            : (due != null && due.isBefore(LocalDate.now()) ? "OVERDUE" : "OPEN");
                    out.add(new InvoiceDto(doc, customer, total, status, due));
                }
            }
            return out;
        } catch (Exception e) {
            log.warn("QBO invoices failed for user {} ({}); using mock.", userId, e.getMessage());
            return fallback.getInvoices(userId);
        }
    }

    @Override
    public List<ExpenseDto> getExpenses(Long userId) {
        Optional<Session> session = session(userId);
        if (session.isEmpty()) {
            return fallback.getExpenses(userId);
        }
        try {
            JsonNode resp = query(session.get(), "SELECT * FROM Purchase MAXRESULTS 50");
            JsonNode rows = resp.path("QueryResponse").path("Purchase");
            List<ExpenseDto> out = new ArrayList<>();
            if (rows.isArray()) {
                int i = 0;
                for (JsonNode p : rows) {
                    String id = p.path("DocNumber").asText("EXP-" + (++i));
                    String vendor = p.path("EntityRef").path("name").asText(
                            p.path("AccountRef").path("name").asText("Vendor"));
                    BigDecimal amount = parseMoney(p.path("TotalAmt").asText("0"));
                    LocalDate date = parseDate(p.path("TxnDate").asText(null));
                    String category = firstLineCategory(p);
                    out.add(new ExpenseDto(id, vendor, category, amount, date));
                }
            }
            return out;
        } catch (Exception e) {
            log.warn("QBO expenses failed for user {} ({}); using mock.", userId, e.getMessage());
            return fallback.getExpenses(userId);
        }
    }

    private String firstLineCategory(JsonNode purchase) {
        JsonNode lines = purchase.path("Line");
        if (lines.isArray() && lines.size() > 0) {
            JsonNode detail = lines.get(0).path("AccountBasedExpenseLineDetail").path("AccountRef");
            String name = detail.path("name").asText("");
            if (!name.isBlank()) return name;
        }
        return "Uncategorized";
    }

    private BigDecimal bankBalance(Session s) {
        try {
            JsonNode resp = query(s, "SELECT * FROM Account WHERE AccountType = 'Bank'");
            JsonNode accounts = resp.path("QueryResponse").path("Account");
            BigDecimal sum = BigDecimal.ZERO;
            if (accounts.isArray()) {
                for (JsonNode a : accounts) {
                    sum = sum.add(parseMoney(a.path("CurrentBalance").asText("0")));
                }
            }
            return sum;
        } catch (Exception e) {
            return BigDecimal.ZERO;
        }
    }

    private BigDecimal parseMoney(String raw) {
        if (raw == null || raw.isBlank()) return BigDecimal.ZERO;
        try {
            return new BigDecimal(raw.replace(",", "").trim()).setScale(2, RoundingMode.HALF_UP);
        } catch (NumberFormatException e) {
            return BigDecimal.ZERO;
        }
    }

    private LocalDate parseDate(String raw) {
        if (raw == null || raw.isBlank() || "null".equals(raw)) return null;
        try {
            return LocalDate.parse(raw.length() >= 10 ? raw.substring(0, 10) : raw);
        } catch (Exception e) {
            return null;
        }
    }

    private record Session(String realmId, String accessToken) {
    }
}
