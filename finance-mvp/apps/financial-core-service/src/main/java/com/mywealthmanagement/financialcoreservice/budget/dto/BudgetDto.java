package com.mywealthmanagement.financialcoreservice.budget.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class BudgetDto {
    private String month;
    private List<BudgetLineDto> lines;
    private List<BudgetAlertDto> alerts; // For future use
}
