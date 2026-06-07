package com.mywealthmanagement.paymentservice.payment.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.math.BigDecimal;

/**
 * Tolerant request DTO for creating a bill pay intent.
 * Accepts optional fields; funding account may arrive under several key names.
 */
@Data
public class BillPayIntentRequest {

    private BigDecimal amount;

    private String currency;

    private String payee;

    private String fromAccountId;

    @JsonProperty("funding_account_id")
    private String fundingAccountId;

    @JsonProperty("card_account_id")
    private String cardAccountId;
}
