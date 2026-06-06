package com.mywealthmanagement.financialcoreservice.budget.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class BudgetLineDto {
    private String category;
    private BigDecimal amount; // Budgeted amount
    private BigDecimal spent;  // Actual spent amount (calculated)
}
