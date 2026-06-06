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
import java.util.Collections;
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

        // --- Generate Time Series (Mock for now) ---
        List<SnapshotDto.TimeSeriesPoint> series = generateTimeSeriesPoints(netTotal, range);

        return new SnapshotDto(userId, LocalDateTime.now(), netWorthDto, componentsDto, series);
    }

    private List<SnapshotDto.TimeSeriesPoint> generateTimeSeriesPoints(BigDecimal baseValue, String range) {
        int points = 10;
        if (range.equals("1M")) points = 3;
        else if (range.equals("3M")) points = 6;
        else if (range.equals("1Y")) points = 12;

        // Simple synthetic time series generation
        return Collections.emptyList(); // For now, return empty list, implement later
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
