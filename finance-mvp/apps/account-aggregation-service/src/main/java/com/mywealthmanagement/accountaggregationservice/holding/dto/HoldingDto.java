package com.mywealthmanagement.accountaggregationservice.holding.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

/**
 * Investments-tab shape consumed by the web app: symbol/name/broker plus quantity,
 * price and (intraday) day-change percent. Field names match what InvestPage.jsx reads.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class HoldingDto {
    private String symbol;
    private String name;
    private String broker;
    private BigDecimal qty;
    private BigDecimal price;
    private BigDecimal value;
    private BigDecimal costBasis;
    // Plaid holdings have no intraday change; kept for UI compatibility (defaults to 0).
    private BigDecimal dayChg;
}
