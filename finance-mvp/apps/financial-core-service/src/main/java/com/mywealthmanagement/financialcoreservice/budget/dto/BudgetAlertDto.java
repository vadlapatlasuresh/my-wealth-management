package com.mywealthmanagement.financialcoreservice.budget.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class BudgetAlertDto {
    private String category;
    private BigDecimal over; // Amount over budget
}
