package com.mywealthmanagement.financialcoreservice.debt;

import com.mywealthmanagement.financialcoreservice.debt.dto.DebtDto;
import com.mywealthmanagement.financialcoreservice.debt.dto.DebtScenarioDto;
import com.mywealthmanagement.financialcoreservice.debt.dto.DebtScenarioRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class DebtService {

    private final DebtRepository debtRepository;
    private final DebtScenarioRepository debtScenarioRepository;

    // Helper to get userId from authenticated context
    private Long getUserId() {
        return Long.valueOf(SecurityContextHolder.getContext().getAuthentication().getName());
    }

    public List<DebtDto> getDebtsByUserId() {
        return debtRepository.findByUserId(getUserId()).stream()
                .map(this::convertToDto)
                .collect(Collectors.toList());
    }

    @Transactional
    public DebtDto addDebt(DebtDto debtDto) {
        Long userId = getUserId();
        Debt debt = new Debt(userId, debtDto.getName(), debtDto.getBalance(), debtDto.getApr(), debtDto.getMinPayment());
        debt.setPlaidAccountId(debtDto.getPlaidAccountId());
        DebtDto saved = convertToDto(debtRepository.save(debt));
        // The debt set changed — any previously cached payoff scenarios for this user are now stale.
        debtScenarioRepository.deleteByUserId(userId);
        return saved;
    }

    @Transactional
    public DebtDto updateDebt(Long debtId, DebtDto debtDto) {
        Long userId = getUserId();
        Debt debt = debtRepository.findById(debtId)
                .filter(d -> userId.equals(d.getUserId()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Debt not found"));
        debt.setName(debtDto.getName());
        debt.setBalance(debtDto.getBalance());
        debt.setApr(debtDto.getApr());
        debt.setMinPayment(debtDto.getMinPayment());
        // Only overwrite the account link when the caller supplies one (keeps an existing link intact).
        if (debtDto.getPlaidAccountId() != null) {
            debt.setPlaidAccountId(debtDto.getPlaidAccountId());
        }
        DebtDto saved = convertToDto(debtRepository.save(debt));
        // Balances/rates changed — drop cached scenarios so the next compare recomputes.
        debtScenarioRepository.deleteByUserId(userId);
        return saved;
    }

    @Transactional
    public void deleteDebt(Long debtId) {
        Long userId = getUserId();
        Debt debt = debtRepository.findById(debtId)
                .filter(d -> userId.equals(d.getUserId()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Debt not found"));
        debtRepository.delete(debt);
        // Removing a debt changes the payoff math — drop cached scenarios so the next compare recomputes.
        debtScenarioRepository.deleteByUserId(userId);
    }

    public DebtScenarioDto runDebtScenario(DebtScenarioRequest request) {
        Long userId = getUserId();
        List<Debt> debts = debtRepository.findByUserId(userId);

        // Normalize inputs so a missing/blank payload never crashes the simulation.
        String strategy = (request.getStrategy() == null || request.getStrategy().isBlank())
                ? "AVALANCHE" : request.getStrategy().toUpperCase();
        BigDecimal extraPayment = request.getExtraPaymentMonthly() != null
                ? request.getExtraPaymentMonthly() : BigDecimal.ZERO;

        // Check if scenario already exists
        List<DebtScenario> existingScenarios = debtScenarioRepository.findByUserIdAndStrategyAndExtraPaymentMonthly(
                userId, strategy, extraPayment);

        if (!existingScenarios.isEmpty()) {
            return convertToDto(existingScenarios.get(0));
        }

        // No debts → return a trivially solved scenario instead of an empty loop.
        if (debts.isEmpty()) {
            DebtScenario empty = new DebtScenario(userId, strategy, extraPayment, 0,
                    BigDecimal.ZERO, LocalDate.now(), "High");
            return convertToDto(debtScenarioRepository.save(empty));
        }

        // Simulate debt payoff logic
        int monthsToDebtFree = 0;
        BigDecimal totalInterestPaid = BigDecimal.ZERO;

        // Create mutable copies of debts for simulation
        List<Debt> simulatedDebts = debts.stream()
                .map(d -> new Debt(d.getUserId(), d.getName(), d.getBalance(), d.getApr(), d.getMinPayment()))
                .collect(Collectors.toList());

        // Simple simulation loop (can be more sophisticated)
        while (simulatedDebts.stream().anyMatch(d -> d.getBalance().compareTo(BigDecimal.ZERO) > 0)) {
            monthsToDebtFree++;
            BigDecimal availableForExtra = extraPayment;

            // Sort debts based on strategy
            if (strategy.equals("AVALANCHE")) {
                simulatedDebts.sort(Comparator.comparing(Debt::getApr).reversed()); // Highest APR first
            } else if (strategy.equals("SNOWBALL")) {
                simulatedDebts.sort(Comparator.comparing(Debt::getBalance)); // Smallest balance first
            } else { // HYBRID: smallest balance among the high-APR half — quick wins + interest savings
                simulatedDebts.sort(Comparator.comparing(Debt::getApr).reversed()
                        .thenComparing(Debt::getBalance));
            }

            for (Debt debt : simulatedDebts) {
                if (debt.getBalance().compareTo(BigDecimal.ZERO) <= 0) continue;

                BigDecimal monthlyInterestRate = debt.getApr().divide(BigDecimal.valueOf(1200), 6, RoundingMode.HALF_UP);
                BigDecimal interestForMonth = debt.getBalance().multiply(monthlyInterestRate).setScale(2, RoundingMode.HALF_UP);
                totalInterestPaid = totalInterestPaid.add(interestForMonth);

                BigDecimal payment = debt.getMinPayment();
                if (payment.compareTo(debt.getBalance().add(interestForMonth)) > 0) {
                    payment = debt.getBalance().add(interestForMonth); // Don't overpay if balance is low
                }

                BigDecimal principalPaid = payment.subtract(interestForMonth);
                debt.setBalance(debt.getBalance().subtract(principalPaid));

                // Apply extra payment
                if (availableForExtra.compareTo(BigDecimal.ZERO) > 0) {
                    BigDecimal extraPrincipalPaid = availableForExtra;
                    if (extraPrincipalPaid.compareTo(debt.getBalance()) > 0) {
                        extraPrincipalPaid = debt.getBalance();
                    }
                    debt.setBalance(debt.getBalance().subtract(extraPrincipalPaid));
                    availableForExtra = availableForExtra.subtract(extraPrincipalPaid);
                }
            }

            if (monthsToDebtFree > 120) { // Prevent infinite loops for unrealistic scenarios
                break;
            }
        }

        LocalDate debtFreeDate = LocalDate.now().plusMonths(monthsToDebtFree);
        // More extra payment = less liquidity kept on hand.
        String liquidity = extraPayment.compareTo(BigDecimal.valueOf(500)) >= 0 ? "Low"
                : extraPayment.compareTo(BigDecimal.ZERO) > 0 ? "Medium" : "High";

        DebtScenario newScenario = new DebtScenario(userId, strategy, extraPayment, monthsToDebtFree, totalInterestPaid, debtFreeDate, liquidity);
        return convertToDto(debtScenarioRepository.save(newScenario));
    }

    private DebtDto convertToDto(Debt debt) {
        return new DebtDto(debt.getId(), debt.getName(), debt.getBalance(), debt.getApr(), debt.getMinPayment(),
                debt.getPlaidAccountId());
    }

    private DebtScenarioDto convertToDto(DebtScenario scenario) {
        return new DebtScenarioDto(scenario.getStrategy(), scenario.getMonthsToDebtFree(), scenario.getTotalInterestPaid(), scenario.getDebtFreeDate(), scenario.getLiquidity());
    }
}
