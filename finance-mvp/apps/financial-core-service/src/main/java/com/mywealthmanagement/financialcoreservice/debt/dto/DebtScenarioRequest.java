package com.mywealthmanagement.financialcoreservice.debt.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class DebtScenarioRequest {
    private String strategy; // AVALANCHE, SNOWBALL, HYBRID

    // The web client sends "extra_payment_monthly"; also accept camelCase.
    @JsonProperty("extra_payment_monthly")
    @JsonAlias({"extraPaymentMonthly"})
    private BigDecimal extraPaymentMonthly;
}
