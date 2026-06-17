package com.mywealthmanagement.financialcoreservice.debt.dto;

import jakarta.validation.constraints.NotBlank;
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

    @PositiveOrZero(message = "balance must be zero or positive")
    private BigDecimal balance;

    @PositiveOrZero(message = "apr must be zero or positive")
    private BigDecimal apr;

    @PositiveOrZero(message = "minPayment must be zero or positive")
    private BigDecimal minPayment;
}
