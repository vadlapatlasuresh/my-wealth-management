package com.mywealthmanagement.financialcoreservice.debt.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

@Data
public class DebtScenarioRequest {
    private String strategy; // AVALANCHE, SNOWBALL, HYBRID

    // The web client sends "extra_payment_monthly"; also accept camelCase.
    @JsonProperty("extra_payment_monthly")
    @JsonAlias({"extraPaymentMonthly"})
    private BigDecimal extraPaymentMonthly;

    // Optional "pay off first" selection: these debt ids are attacked first, in the given order,
    // before the strategy order handles the rest. Empty/null = pure strategy order.
    @JsonProperty("priority_debt_ids")
    @JsonAlias({"priorityDebtIds"})
    private List<Long> priorityDebtIds;
}
