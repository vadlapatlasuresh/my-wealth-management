package com.mywealthmanagement.accountaggregationservice.account.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class AccountDto {
    private Long id;
    private String plaidAccountId;
    private String name;
    private String officialName;
    private String mask;
    private String subtype;
    private String type;
    private BigDecimal currentBalance;
    private BigDecimal availableBalance;
    private String currency;
    // Credit-card / liability details (null for non-credit accounts).
    private BigDecimal creditLimit;
    private BigDecimal lastStatementBalance;
    private BigDecimal minimumPayment;
    private LocalDate nextPaymentDueDate;
    private BigDecimal aprPercentage;
    // The Plaid item (institution connection) this account belongs to — used to unlink.
    private String plaidItemId;
}
