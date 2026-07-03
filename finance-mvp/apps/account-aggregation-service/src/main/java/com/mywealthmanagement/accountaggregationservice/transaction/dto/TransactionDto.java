package com.mywealthmanagement.accountaggregationservice.transaction.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class TransactionDto {
    private Long id;
    private Long accountId;
    private String plaidTransactionId;
    private String plaidAccountId;
    private String name;
    private BigDecimal amount;
    private String isoCurrencyCode;
    private LocalDate date;
    private String category;
    private String merchantName;
    /** true = pending, false = cleared. Null legacy rows are treated as cleared. */
    private Boolean pending;
}
