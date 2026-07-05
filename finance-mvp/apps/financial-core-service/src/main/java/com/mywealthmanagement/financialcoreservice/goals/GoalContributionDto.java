package com.mywealthmanagement.financialcoreservice.goals;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** A manual contribution ledger entry. {@code amount} may be negative to correct a mistake. */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class GoalContributionDto {
    private Long id;

    @NotNull(message = "amount is required")
    private BigDecimal amount;

    @Size(max = 255, message = "note must be at most 255 characters")
    private String note;

    private LocalDateTime createdAt;
}
