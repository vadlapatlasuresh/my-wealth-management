package com.mywealthmanagement.financialcoreservice.debt.dto;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class DebtScenarioRequest {
    private String strategy; // AVALANCHE, SNOWBALL, HYBRID
    private BigDecimal extraPaymentMonthly;
}
