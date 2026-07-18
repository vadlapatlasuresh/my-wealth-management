package com.mywealthmanagement.realestateservice.property.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class PropertyExpenseDto {
    private Long id;
    private Long propertyId;

    @NotNull(message = "expenseDate is required")
    private LocalDate expenseDate;

    @NotBlank(message = "category is required")
    @Size(max = 60, message = "category must be at most 60 characters")
    private String category;

    @Size(max = 200, message = "vendor must be at most 200 characters")
    private String vendor;

    @Size(max = 500, message = "description must be at most 500 characters")
    private String description;

    @NotNull(message = "amount is required")
    @PositiveOrZero(message = "amount must be zero or positive")
    private BigDecimal amount;

    @Size(max = 40, message = "paymentMethod must be at most 40 characters")
    private String paymentMethod;

    @Size(max = 120, message = "receiptRef must be at most 120 characters")
    private String receiptRef;

    @PositiveOrZero(message = "hours must be zero or positive")
    private BigDecimal hours;

    @PositiveOrZero(message = "hourlyRate must be zero or positive")
    private BigDecimal hourlyRate;

    @Size(max = 1000, message = "notes must be at most 1000 characters")
    private String notes;

    // Computed, read-only (server is the source of truth so web/mobile/export agree).
    private BigDecimal laborCost; // hours * hourlyRate when both present, else null
    private BigDecimal totalCost; // amount + laborCost

    private LocalDateTime createdAt;
}
