package com.mywealthmanagement.financialcoreservice.clients.dtos;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

/** Minimal view of a real-estate property as returned by real-estate-service. */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class PropertyDto {
    private Long id;
    private String address;
    private BigDecimal currentValue;
    private BigDecimal mortgageBalance;
    private BigDecimal equity; // currentValue - mortgageBalance
    private BigDecimal apr;             // mortgage APR %
    private BigDecimal monthlyPayment;  // scheduled P&I
}
