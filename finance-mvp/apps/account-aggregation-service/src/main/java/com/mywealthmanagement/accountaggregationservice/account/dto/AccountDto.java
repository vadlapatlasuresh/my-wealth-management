package com.mywealthmanagement.accountaggregationservice.account.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class AccountDto {
    private Long id;
    private String plaidAccountId;
    private String name;
    private String officialName;
    private String subtype;
    private String type;
    private BigDecimal currentBalance;
    private BigDecimal availableBalance;
    private String currency;
}
