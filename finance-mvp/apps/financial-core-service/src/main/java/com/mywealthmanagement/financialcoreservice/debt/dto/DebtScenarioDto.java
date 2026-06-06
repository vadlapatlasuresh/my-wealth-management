package com.mywealthmanagement.financialcoreservice.debt.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class DebtScenarioDto {
    private String strategy;
    private Integer monthsToDebtFree;
    private BigDecimal totalInterestPaid;
    private LocalDate debtFreeDate;
    private String liquidity;
}
