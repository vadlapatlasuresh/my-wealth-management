package com.mywealthmanagement.realestateservice.deal.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class DealDto {
    private Long id;

    @NotBlank(message = "title is required")
    @Size(max = 300, message = "title must be at most 300 characters")
    private String title;

    @Size(max = 100, message = "category must be at most 100 characters")
    private String category;
    @Size(max = 100, message = "subcategory must be at most 100 characters")
    private String subcategory;
    @Size(max = 100, message = "returnType must be at most 100 characters")
    private String returnType;

    @PositiveOrZero(message = "annualReturnMin must be zero or positive")
    private BigDecimal annualReturnMin;
    @PositiveOrZero(message = "annualReturnMax must be zero or positive")
    private BigDecimal annualReturnMax;

    @Size(max = 100, message = "distributionFrequency must be at most 100 characters")
    private String distributionFrequency;
    @Size(max = 5000, message = "description must be at most 5000 characters")
    private String description;
    @Size(max = 500, message = "location must be at most 500 characters")
    private String location;
    @Size(max = 500, message = "websiteUrl must be at most 500 characters")
    private String websiteUrl;

    @PositiveOrZero(message = "targetRaise must be zero or positive")
    private BigDecimal targetRaise;
    @PositiveOrZero(message = "minInvestment must be zero or positive")
    private BigDecimal minInvestment;
    @PositiveOrZero(message = "targetIrr must be zero or positive")
    private BigDecimal targetIrr;

    @PositiveOrZero(message = "holdPeriodMonths must be zero or positive")
    private Integer holdPeriodMonths;

    @Size(max = 50, message = "status must be at most 50 characters")
    private String status;

    @PositiveOrZero(message = "amountCommitted must be zero or positive")
    private BigDecimal amountCommitted;
    private BigDecimal committedAmount;   // sum of investor commitment amounts (detail/owner views)
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    // Number of investors who have expressed interest. Populated for the owner's own
    // deal list; null when not applicable (e.g. marketplace view).
    private Integer interestCount;
}
