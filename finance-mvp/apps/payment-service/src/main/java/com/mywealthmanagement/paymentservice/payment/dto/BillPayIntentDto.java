package com.mywealthmanagement.paymentservice.payment.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Response DTO with snake_case JSON keys to match the web client.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class BillPayIntentDto {

    @JsonProperty("intent_id")
    private String intentId;

    @JsonProperty("amount")
    private BigDecimal amount;

    @JsonProperty("currency")
    private String currency;

    @JsonProperty("status")
    private String status;

    @JsonProperty("payee")
    private String payee;

    @JsonProperty("payee_type")
    private String payeeType;

    @JsonProperty("from_account")
    private String fromAccount;

    @JsonProperty("to_account")
    private String toAccount;

    @JsonProperty("scheduled_date")
    private LocalDate scheduledDate;

    @JsonProperty("memo")
    private String memo;

    @JsonProperty("confirmation_number")
    private String confirmationNumber;

    @JsonProperty("created_at")
    private LocalDateTime createdAt;
}
