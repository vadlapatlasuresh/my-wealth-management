package com.mywealthmanagement.financialcoreservice.debt.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Per-debt result of a payoff simulation — how long each debt takes to clear and what it costs
 * under the chosen strategy. Ordered by payoff month so the UI can show the payoff timeline.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class DebtPayoffDto {
    private Long id;
    private String name;
    private BigDecimal startingBalance;
    private BigDecimal apr;
    private Integer monthsToPayoff;   // null if it never pays off within the simulation horizon
    private LocalDate payoffDate;     // null if it never pays off
    private BigDecimal totalInterest; // interest paid on this debt over the plan
    private BigDecimal totalPaid;     // principal + interest paid on this debt
}
