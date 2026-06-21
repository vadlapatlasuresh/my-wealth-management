package com.mywealthmanagement.financialcoreservice.financialcore;

import com.mywealthmanagement.financialcoreservice.clients.AccountAggregationClient;
import com.mywealthmanagement.financialcoreservice.clients.RealEstateClient;
import com.mywealthmanagement.financialcoreservice.clients.dtos.AccountDto;
import com.mywealthmanagement.financialcoreservice.clients.dtos.PropertyDto;
import com.mywealthmanagement.financialcoreservice.clients.dtos.TransactionDto;
import com.mywealthmanagement.financialcoreservice.financialcore.dto.SnapshotDto;
import com.mywealthmanagement.financialcoreservice.goals.GoalRepository;
import com.mywealthmanagement.financialcoreservice.debt.DebtRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class FinancialCoreService {

    private static final Logger log = LoggerFactory.getLogger(FinancialCoreService.class);

    private final AccountAggregationClient accountAggregationClient;
    private final RealEstateClient realEstateClient;
    private final NetWorthSnapshotRepository snapshotRepository;
    private final GoalRepository goalRepository;
    private final DebtRepository debtRepository;

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    // Helper to get userId from authenticated context
    private Long getUserId() {
        // Assuming the principal is the userId (Long) after JWT validation
        return Long.valueOf(SecurityContextHolder.getContext().getAuthentication().getName());
    }

    private String getAuthorizationHeader() {
        Object credentials = SecurityContextHolder.getContext().getAuthentication().getCredentials();
        String token = credentials != null ? credentials.toString() : "";
        return token.startsWith("Bearer ") ? token : "Bearer " + token;
    }

    public SnapshotDto getSnapshot(String range) {
        Long userId = getUserId();
        String authHeader = getAuthorizationHeader();

        // Fetch real balances, compute net worth, and upsert today's datapoint. This
        // is shared with the daily background job (NetWorthDailySnapshotJob) so the
        // chart keeps a continuous history even when the user doesn't open the app.
        NetWorthSnapshot snap = computeAndPersistSnapshot(userId, authHeader);
        BigDecimal cash = nz(snap.getCash());
        BigDecimal investments = nz(snap.getInvestments());
        BigDecimal creditCardsDebt = nz(snap.getCreditCards());
        BigDecimal loansDebt = nz(snap.getLoans());
        BigDecimal realEstateValue = nz(snap.getRealEstateValue());
        BigDecimal realEstateEquity = nz(snap.getRealEstateEquity());
        BigDecimal netTotal = nz(snap.getTotal());

        // 30-day changes computed from REAL history: current − value ~30 days ago.
        // When no ~30-day-old snapshot exists yet, the change is 0 (honest), not faked.
        BigDecimal change30dNetWorth = BigDecimal.ZERO;
        BigDecimal change30dCash = BigDecimal.ZERO;
        BigDecimal change30dInvestments = BigDecimal.ZERO;
        BigDecimal change30dCreditCards = BigDecimal.ZERO;
        BigDecimal change30dRealEstateValue = BigDecimal.ZERO;
        BigDecimal change30dRealEstateEquity = BigDecimal.ZERO;
        try {
            NetWorthSnapshot prior = snapshotRepository
                    .findFirstByUserIdAndSnapshotDateLessThanEqualOrderBySnapshotDateDesc(
                            userId, LocalDate.now().minusDays(30))
                    .orElse(null);
            if (prior != null) {
                change30dNetWorth = netTotal.subtract(nz(prior.getTotal()));
                change30dCash = cash.subtract(nz(prior.getCash()));
                change30dInvestments = investments.subtract(nz(prior.getInvestments()));
                change30dCreditCards = creditCardsDebt.subtract(nz(prior.getCreditCards()));
                change30dRealEstateValue = realEstateValue.subtract(nz(prior.getRealEstateValue()));
                change30dRealEstateEquity = realEstateEquity.subtract(nz(prior.getRealEstateEquity()));
            }
        } catch (Exception e) {
            log.warn("30d change history lookup failed ({}); reporting 0", e.getMessage());
        }

        SnapshotDto.NetWorthDto netWorthDto = new SnapshotDto.NetWorthDto(netTotal, change30dNetWorth);
        SnapshotDto.ComponentsDto componentsDto = new SnapshotDto.ComponentsDto(
                cash, change30dCash,
                investments, change30dInvestments,
                creditCardsDebt, change30dCreditCards,
                loansDebt,
                realEstateValue, change30dRealEstateValue,
                realEstateEquity, change30dRealEstateEquity
        );

        // --- Time series from REAL persisted daily history (no synthetic curve) ---
        List<SnapshotDto.TimeSeriesPoint> series = buildSeriesFromHistory(userId, range);

        return new SnapshotDto(userId, LocalDateTime.now(), netWorthDto, componentsDto, series);
    }

    /**
     * Fetch the user's accounts + real estate, compute net worth, and upsert today's
     * snapshot. Shared by the live read ({@link #getSnapshot}) and the daily background
     * job ({@code NetWorthDailySnapshotJob}); the latter passes a freshly-minted
     * per-user bearer token so the cross-service calls authenticate without a request.
     */
    NetWorthSnapshot computeAndPersistSnapshot(Long userId, String authHeader) {
        List<AccountDto> accounts = accountAggregationClient.getAccounts(authHeader);

        // Assets (cash, investments) add; liabilities (credit cards, loans) subtract.
        BigDecimal cash = BigDecimal.ZERO;
        BigDecimal investments = BigDecimal.ZERO;
        BigDecimal creditCardsDebt = BigDecimal.ZERO;
        BigDecimal loansDebt = BigDecimal.ZERO;

        for (AccountDto account : accounts) {
            String type = account.getType() == null ? "" : account.getType().trim().toLowerCase();
            BigDecimal bal = nz(account.getCurrentBalance());
            switch (type) {
                case "depository":                 // checking / savings / cash
                    cash = cash.add(bal);
                    break;
                case "investment":                 // brokerage / retirement / etc.
                case "brokerage":
                    investments = investments.add(bal);
                    break;
                case "credit":                     // credit card balance (liability)
                    creditCardsDebt = creditCardsDebt.add(bal);
                    break;
                case "loan":                       // mortgage / student / auto (liability)
                    loansDebt = loansDebt.add(bal);
                    break;
                default:
                    // Unknown types don't affect net worth (avoid guessing).
                    break;
            }
        }

        // Real estate from the real-estate-service. Best-effort: a failure here must
        // never break the snapshot — fall back to zero so net worth still computes.
        BigDecimal realEstateValue = BigDecimal.ZERO;
        BigDecimal realEstateEquity = BigDecimal.ZERO;
        try {
            List<PropertyDto> properties = realEstateClient.getProperties(authHeader);
            if (properties != null) {
                for (PropertyDto p : properties) {
                    BigDecimal value = nz(p.getCurrentValue());
                    BigDecimal equity = p.getEquity() != null
                            ? p.getEquity()
                            : value.subtract(nz(p.getMortgageBalance()));
                    realEstateValue = realEstateValue.add(value);
                    realEstateEquity = realEstateEquity.add(equity);
                }
            }
        } catch (Exception e) {
            log.warn("real-estate fetch failed for snapshot ({}); treating as 0", e.getMessage());
        }

        BigDecimal netTotal = cash.add(investments).add(realEstateEquity)
                .subtract(creditCardsDebt).subtract(loansDebt);

        return persistDailySnapshot(userId, netTotal, cash, investments, creditCardsDebt,
                loansDebt, realEstateValue, realEstateEquity);
    }

    /** Upsert one net-worth datapoint per user per day. Best-effort; returns the row
     *  (transient if the save failed) so callers can use the computed values. */
    private NetWorthSnapshot persistDailySnapshot(Long userId, BigDecimal total, BigDecimal cash,
            BigDecimal investments, BigDecimal creditCards, BigDecimal loans,
            BigDecimal realEstateValue, BigDecimal realEstateEquity) {
        LocalDate today = LocalDate.now();
        NetWorthSnapshot snap = snapshotRepository
                .findByUserIdAndSnapshotDate(userId, today)
                .orElseGet(NetWorthSnapshot::new);
        snap.setUserId(userId);
        snap.setSnapshotDate(today);
        snap.setTotal(total);
        snap.setCash(cash);
        snap.setInvestments(investments);
        snap.setCreditCards(creditCards);
        snap.setLoans(loans);
        snap.setRealEstateValue(realEstateValue);
        snap.setRealEstateEquity(realEstateEquity);
        try {
            snapshotRepository.save(snap);
        } catch (Exception e) {
            log.warn("net-worth snapshot persist failed ({}); continuing", e.getMessage());
        }
        // Return the populated entity (not save()'s result) so callers never depend on
        // the repository echoing it back.
        return snap;
    }

    /** Refresh today's snapshot for one user from a background job (no request context). */
    public void refreshDailySnapshot(Long userId, String bearerToken) {
        computeAndPersistSnapshot(userId, bearerToken);
    }

    /** How many days of history a range window covers. */
    private static long lookbackDays(String range) {
        String r = range == null ? "3M" : range;
        if (r.startsWith("custom")) return 90;
        switch (r) {
            case "1H": case "1D": return 1;
            case "1W": return 7;
            case "1M": return 30;
            case "3M": return 90;
            case "6M": return 180;
            case "1Y": return 365;
            case "All": return 100_000; // effectively all history
            default:   return 90;
        }
    }

    /**
     * Time series built from REAL persisted daily snapshots within the range window.
     * Returns whatever real history exists (one point per day). When there are fewer
     * than two points the UI shows an honest "building history" state rather than a
     * fabricated curve.
     */
    private List<SnapshotDto.TimeSeriesPoint> buildSeriesFromHistory(Long userId, String range) {
        try {
            LocalDate from = LocalDate.now().minusDays(lookbackDays(range));
            List<NetWorthSnapshot> rows = snapshotRepository
                    .findByUserIdAndSnapshotDateGreaterThanEqualOrderBySnapshotDateAsc(userId, from);
            List<SnapshotDto.TimeSeriesPoint> series = new java.util.ArrayList<>(rows.size());
            for (NetWorthSnapshot s : rows) {
                series.add(new SnapshotDto.TimeSeriesPoint(
                        s.getSnapshotDate().atStartOfDay(), nz(s.getTotal())));
            }
            return series;
        } catch (Exception e) {
            log.warn("net-worth series read failed ({}); returning empty", e.getMessage());
            return java.util.Collections.emptyList();
        }
    }

    public List<AccountDto> getAccounts() {
        String authHeader = getAuthorizationHeader();
        return accountAggregationClient.getAccounts(authHeader);
    }

    public List<TransactionDto> getTransactions() {
        String authHeader = getAuthorizationHeader();
        return accountAggregationClient.getTransactions(authHeader);
    }

    /**
     * GDPR/CCPA "right to access": assemble a complete export of the user's data
     * reachable from financial-core (net worth + components + history, linked
     * accounts/transactions, properties, goals, debts). Each external source is
     * best-effort so a single failure never blocks the export.
     */
    public Map<String, Object> exportData() {
        Long userId = getUserId();
        String auth = getAuthorizationHeader();
        Map<String, Object> bundle = new LinkedHashMap<>();
        bundle.put("exportedAt", LocalDateTime.now().toString());
        bundle.put("userId", userId);
        bundle.put("netWorth", safe(() -> getSnapshot("All")));
        bundle.put("accounts", safe(() -> accountAggregationClient.getAccounts(auth)));
        bundle.put("transactions", safe(() -> accountAggregationClient.getTransactions(auth)));
        bundle.put("properties", safe(() -> realEstateClient.getProperties(auth)));
        bundle.put("goals", safe(() -> goalRepository.findByUserIdOrderByCreatedAtAsc(userId)));
        bundle.put("debts", safe(() -> debtRepository.findByUserId(userId)));
        return bundle;
    }

    private Object safe(java.util.function.Supplier<Object> s) {
        try { return s.get(); }
        catch (Exception e) { log.warn("export section failed: {}", e.getMessage()); return null; }
    }
}
