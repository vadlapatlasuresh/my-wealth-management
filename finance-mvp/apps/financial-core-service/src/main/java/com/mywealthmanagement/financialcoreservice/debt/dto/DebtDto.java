package com.mywealthmanagement.financialcoreservice.debt.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class DebtDto {
    private Long id;
    private String name;
    private BigDecimal balance;
    private BigDecimal apr;
    private BigDecimal minPayment;
}
