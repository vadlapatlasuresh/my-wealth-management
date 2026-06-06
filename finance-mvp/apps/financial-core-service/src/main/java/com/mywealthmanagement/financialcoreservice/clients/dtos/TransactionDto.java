package com.mywealthmanagement.financialcoreservice.clients.dtos;

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
}
