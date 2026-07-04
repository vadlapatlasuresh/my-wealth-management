package com.mywealthmanagement.financialcoreservice.debt.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class DebtDto {
    private Long id;

    @NotBlank(message = "name is required")
    @Size(max = 200, message = "name must be at most 200 characters")
    private String name;

    @NotNull(message = "balance is required")
    @PositiveOrZero(message = "balance must be zero or positive")
    private BigDecimal balance;

    @NotNull(message = "apr is required")
    @PositiveOrZero(message = "apr must be zero or positive")
    private BigDecimal apr;

    @NotNull(message = "minPayment is required")
    @PositiveOrZero(message = "minPayment must be zero or positive")
    private BigDecimal minPayment;

    // Optional link to the Plaid account this debt was imported from (null for manual debts).
    private String plaidAccountId;
}
