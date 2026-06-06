package com.mywealthmanagement.financialcoreservice.debt;

import com.mywealthmanagement.financialcoreservice.debt.dto.DebtDto;
import com.mywealthmanagement.financialcoreservice.debt.dto.DebtScenarioDto;
import com.mywealthmanagement.financialcoreservice.debt.dto.DebtScenarioRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

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

    public DebtDto addDebt(DebtDto debtDto) {
        Debt debt = new Debt(getUserId(), debtDto.getName(), debtDto.getBalance(), debtDto.getApr(), debtDto.getMinPayment());
        return convertToDto(debtRepository.save(debt));
    }

    public DebtScenarioDto runDebtScenario(DebtScenarioRequest request) {
        Long userId = getUserId();
        List<Debt> debts = debtRepository.findByUserId(userId);

        // Check if scenario already exists
        List<DebtScenario> existingScenarios = debtScenarioRepository.findByUserIdAndStrategyAndExtraPaymentMonthly(
                userId, request.getStrategy(), request.getExtraPaymentMonthly());

        if (!existingScenarios.isEmpty()) {
            return convertToDto(existingScenarios.get(0));
        }

        // Simulate debt payoff logic
        int monthsToDebtFree = 0;
        BigDecimal totalInterestPaid = BigDecimal.ZERO;
        BigDecimal extraPayment = request.getExtraPaymentMonthly();

        // Create mutable copies of debts for simulation
        List<Debt> simulatedDebts = debts.stream()
                .map(d -> new Debt(d.getUserId(), d.getName(), d.getBalance(), d.getApr(), d.getMinPayment()))
                .collect(Collectors.toList());

        // Simple simulation loop (can be more sophisticated)
        while (simulatedDebts.stream().anyMatch(d -> d.getBalance().compareTo(BigDecimal.ZERO) > 0)) {
            monthsToDebtFree++;
            BigDecimal availableForExtra = extraPayment;

            // Sort debts based on strategy
            if (request.getStrategy().equalsIgnoreCase("AVALANCHE")) {
                simulatedDebts.sort(Comparator.comparing(Debt::getApr).reversed()); // Highest APR first
            } else if (request.getStrategy().equalsIgnoreCase("SNOWBALL")) {
                simulatedDebts.sort(Comparator.comparing(Debt::getBalance)); // Smallest balance first
            }
            // HYBRID could be a mix, for simplicity, let's use AVALANCHE for now

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
        String liquidity = "Medium"; // Placeholder

        DebtScenario newScenario = new DebtScenario(userId, request.getStrategy(), extraPayment, monthsToDebtFree, totalInterestPaid, debtFreeDate, liquidity);
        return convertToDto(debtScenarioRepository.save(newScenario));
    }

    private DebtDto convertToDto(Debt debt) {
        return new DebtDto(debt.getId(), debt.getName(), debt.getBalance(), debt.getApr(), debt.getMinPayment());
    }

    private DebtScenarioDto convertToDto(DebtScenario scenario) {
        return new DebtScenarioDto(scenario.getStrategy(), scenario.getMonthsToDebtFree(), scenario.getTotalInterestPaid(), scenario.getDebtFreeDate(), scenario.getLiquidity());
    }
}
