package com.mywealthmanagement.financialcoreservice.debt.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class DebtScenarioDto {
    private String strategy;
    private Integer monthsToDebtFree;
    private BigDecimal totalInterestPaid;
    private LocalDate debtFreeDate;
    private String liquidity;
    // Extended results (computed fresh each run; not persisted on the scalar cache row).
    private BigDecimal totalPaid;        // principal + interest across all debts
    private BigDecimal monthlyBudget;    // total put toward debt each month (all minimums + extra)
    private Boolean paysOff;             // false if the plan can't clear the debt within the horizon
    private List<DebtPayoffDto> perDebt; // per-debt payoff timeline, ordered by payoff month

    // Backward-compatible constructor for the persisted (scalar) summary.
    public DebtScenarioDto(String strategy, Integer monthsToDebtFree, BigDecimal totalInterestPaid,
                           LocalDate debtFreeDate, String liquidity) {
        this.strategy = strategy;
        this.monthsToDebtFree = monthsToDebtFree;
        this.totalInterestPaid = totalInterestPaid;
        this.debtFreeDate = debtFreeDate;
        this.liquidity = liquidity;
    }
}
