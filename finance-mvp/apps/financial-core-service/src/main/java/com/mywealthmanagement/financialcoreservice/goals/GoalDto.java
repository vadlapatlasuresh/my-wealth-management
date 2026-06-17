package com.mywealthmanagement.financialcoreservice.goals;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class GoalDto {
    private Long id;

    @NotBlank(message = "name is required")
    @Size(max = 200, message = "name must be at most 200 characters")
    private String name;

    @Size(max = 100, message = "goalType must be at most 100 characters")
    private String goalType;

    @PositiveOrZero(message = "targetAmount must be zero or positive")
    private BigDecimal targetAmount;

    @PositiveOrZero(message = "currentAmount must be zero or positive")
    private BigDecimal currentAmount;

    private LocalDate targetDate;

    @PositiveOrZero(message = "monthlyContribution must be zero or positive")
    private BigDecimal monthlyContribution;

    // Derived (read-only) — share of the target reached, 0..1.
    private Double progress;
}
