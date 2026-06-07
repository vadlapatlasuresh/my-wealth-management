package com.mywealthmanagement.financialcoreservice.financialcore;

import com.mywealthmanagement.financialcoreservice.clients.AccountAggregationClient;
import com.mywealthmanagement.financialcoreservice.clients.dtos.AccountDto;
import com.mywealthmanagement.financialcoreservice.clients.dtos.TransactionDto;
import com.mywealthmanagement.financialcoreservice.financialcore.dto.SnapshotDto;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class FinancialCoreService {

    private final AccountAggregationClient accountAggregationClient;

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

        // Fetch accounts and transactions from Account Aggregation Service
        List<AccountDto> accounts = accountAggregationClient.getAccounts(authHeader);
        List<TransactionDto> transactions = accountAggregationClient.getTransactions(authHeader);

        // --- Calculate Net Worth ---
        BigDecimal cash = BigDecimal.ZERO;
        BigDecimal investments = BigDecimal.ZERO; // Placeholder for now
        BigDecimal creditCardsDebt = BigDecimal.ZERO;
        BigDecimal loansDebt = BigDecimal.ZERO; // Placeholder for now
        BigDecimal realEstateValue = BigDecimal.ZERO; // Placeholder for now
        BigDecimal realEstateEquity = BigDecimal.ZERO; // Placeholder for now

        for (AccountDto account : accounts) {
            if (account.getType().equals("depository")) { // Checking, Savings
                cash = cash.add(account.getCurrentBalance());
            } else if (account.getType().equals("credit")) { // Credit Card
                creditCardsDebt = creditCardsDebt.add(account.getCurrentBalance());
            }
            // Add logic for investment accounts when available
        }

        // Mock 30-day changes (will be calculated from historical data later)
        BigDecimal change30dNetWorth = BigDecimal.valueOf(15732);
        BigDecimal change30dCash = BigDecimal.valueOf(2320);
        BigDecimal change30dInvestments = BigDecimal.valueOf(10450);
        BigDecimal change30dCreditCards = BigDecimal.valueOf(1038);
        BigDecimal change30dRealEstateValue = BigDecimal.valueOf(8500);
        BigDecimal change30dRealEstateEquity = BigDecimal.valueOf(1800);

        BigDecimal netTotal = cash.add(investments).add(realEstateEquity).subtract(creditCardsDebt).subtract(loansDebt);

        SnapshotDto.NetWorthDto netWorthDto = new SnapshotDto.NetWorthDto(netTotal, change30dNetWorth);
        SnapshotDto.ComponentsDto componentsDto = new SnapshotDto.ComponentsDto(
                cash, change30dCash,
                investments, change30dInvestments,
                creditCardsDebt, change30dCreditCards,
                loansDebt,
                realEstateValue, change30dRealEstateValue,
                realEstateEquity, change30dRealEstateEquity
        );

        // --- Generate Time Series ---
        List<SnapshotDto.TimeSeriesPoint> series = generateTimeSeriesPoints(netTotal, range);

        return new SnapshotDto(userId, LocalDateTime.now(), netWorthDto, componentsDto, series);
    }

    /**
     * Builds a smooth, deterministic net-worth time series that ends exactly at the
     * current value and rises toward it. Point count and span scale with the range,
     * and the total growth is a range-scaled percentage of the current value so the
     * curve stays realistic regardless of balance size.
     * (Synthetic until per-day historical snapshots are persisted.)
     */
    private List<SnapshotDto.TimeSeriesPoint> generateTimeSeriesPoints(
            BigDecimal baseValue, String range) {

        String r = range == null ? "3M" : range;
        if (r.startsWith("custom")) r = "3M";

        int points;
        long totalMinutes;
        double growthPct; // total rise across the window, as a fraction of current value
        switch (r) {
            case "1H": points = 12; totalMinutes = 60L;        growthPct = 0.003; break;
            case "1D": points = 24; totalMinutes = 1440L;      growthPct = 0.01;  break;
            case "1W": points = 14; totalMinutes = 10_080L;    growthPct = 0.03;  break;
            case "1M": points = 30; totalMinutes = 43_200L;    growthPct = 0.06;  break;
            case "3M": points = 13; totalMinutes = 129_600L;   growthPct = 0.12;  break;
            case "6M": points = 26; totalMinutes = 259_200L;   growthPct = 0.18;  break;
            case "1Y": points = 12; totalMinutes = 525_600L;   growthPct = 0.25;  break;
            case "All": points = 24; totalMinutes = 1_051_200L; growthPct = 0.45; break;
            default:    points = 16; totalMinutes = 129_600L;  growthPct = 0.10;  break;
        }

        double end = baseValue.doubleValue();
        // Start lower and grow to the current value (or flat when there's no balance).
        double start = end > 0 ? end / (1 + growthPct) : end;
        double amplitude = Math.abs(end - start) * 0.10 + Math.abs(end) * 0.004;

        List<SnapshotDto.TimeSeriesPoint> series = new java.util.ArrayList<>(points);
        LocalDateTime now = LocalDateTime.now();
        for (int i = 0; i < points; i++) {
            double t = points == 1 ? 1.0 : (double) i / (points - 1);
            double eased = t * t * (3 - 2 * t);               // smoothstep
            double v = start + (end - start) * eased
                    + amplitude * Math.sin(i * 1.7);          // gentle deterministic wiggle
            if (i == points - 1) v = end;                      // land exactly on current value
            long minutesAgo = Math.round((1 - t) * totalMinutes);
            series.add(new SnapshotDto.TimeSeriesPoint(
                    now.minusMinutes(minutesAgo),
                    BigDecimal.valueOf(Math.round(v))));
        }
        return series;
    }

    public List<AccountDto> getAccounts() {
        String authHeader = getAuthorizationHeader();
        return accountAggregationClient.getAccounts(authHeader);
    }

    public List<TransactionDto> getTransactions() {
        String authHeader = getAuthorizationHeader();
        return accountAggregationClient.getTransactions(authHeader);
    }
}
