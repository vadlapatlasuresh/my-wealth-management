package com.mywealthmanagement.financialcoreservice.budget;

import com.mywealthmanagement.financialcoreservice.budget.dto.BudgetDto;
import com.mywealthmanagement.financialcoreservice.budget.dto.BudgetLineDto;
import com.mywealthmanagement.financialcoreservice.clients.AccountAggregationClient;
import com.mywealthmanagement.financialcoreservice.clients.dtos.TransactionDto;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class BudgetService {

    private final BudgetRepository budgetRepository;
    private final BudgetLineRepository budgetLineRepository;
    private final AccountAggregationClient accountAggregationClient;

    // Helper to get userId from authenticated context
    private Long getUserId() {
        return Long.valueOf(SecurityContextHolder.getContext().getAuthentication().getName());
    }

    private String getAuthorizationHeader() {
        Object credentials = SecurityContextHolder.getContext().getAuthentication().getCredentials();
        String token = credentials != null ? credentials.toString() : "";
        return token.startsWith("Bearer ") ? token : "Bearer " + token;
    }

    public BudgetDto getBudgetForMonth(String month) {
        Long userId = getUserId();
        Optional<Budget> optionalBudget = budgetRepository.findByUserIdAndMonth(userId, month);

        Budget budget = optionalBudget.orElseGet(() -> new Budget(userId, month));

        // Fetch transactions for the month to calculate spent amounts
        List<TransactionDto> transactions = accountAggregationClient.getTransactions(getAuthorizationHeader());
        Map<String, BigDecimal> spentByCategory = calculateSpentByCategory(transactions, month);

        List<BudgetLineDto> budgetLineDtos = budget.getLines() != null ? budget.getLines().stream()
                .map(line -> new BudgetLineDto(line.getCategory(), line.getAmount(), spentByCategory.getOrDefault(line.getCategory(), BigDecimal.ZERO)))
                .collect(Collectors.toList()) : Collections.emptyList();

        return new BudgetDto(month, budgetLineDtos, Collections.emptyList()); // Alerts will be calculated in frontend
    }

    @Transactional
    public BudgetDto saveBudget(String month, List<BudgetLineDto> lineDtos) {
        Long userId = getUserId();
        Budget budget = budgetRepository.findByUserIdAndMonth(userId, month)
                .orElseGet(() -> new Budget(userId, month));

        budgetRepository.save(budget); // Save to get an ID if new

        // Clear existing lines and add new ones
        if (budget.getLines() != null) {
            budget.getLines().clear();
        } else {
            budget.setLines(Collections.emptyList());
        }

        List<BudgetLine> newLines = lineDtos.stream()
                .map(dto -> new BudgetLine(budget, dto.getCategory(), dto.getAmount()))
                .collect(Collectors.toList());
        budget.setLines(newLines);
        budgetLineRepository.saveAll(newLines); // Save new lines

        return getBudgetForMonth(month); // Return updated budget with spent amounts
    }

    private Map<String, BigDecimal> calculateSpentByCategory(List<TransactionDto> transactions, String month) {
        LocalDate startOfMonth = LocalDate.parse(month + "-01", DateTimeFormatter.ISO_LOCAL_DATE);
        LocalDate endOfMonth = startOfMonth.plusMonths(1).minusDays(1);

        return transactions.stream()
                .filter(tx -> tx.getDate().isAfter(startOfMonth.minusDays(1)) && tx.getDate().isBefore(endOfMonth.plusDays(1)))
                .filter(tx -> tx.getAmount().compareTo(BigDecimal.ZERO) < 0) // Only consider expenses (negative amounts)
                .collect(Collectors.groupingBy(
                        TransactionDto::getCategory,
                        Collectors.reducing(BigDecimal.ZERO, tx -> tx.getAmount().abs(), BigDecimal::add)
                ));
    }
}
