package com.mywealthmanagement.accountaggregationservice.holding.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;

/** Brokerage activity row consumed by the Investments "Activity" view. */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class InvestmentTransactionDto {
    private LocalDate date;
    private String name;
    private String symbol;
    private String broker;
    private String type;
    private String subtype;
    private BigDecimal quantity;
    private BigDecimal price;
    private BigDecimal amount;
    private BigDecimal fees;
}
