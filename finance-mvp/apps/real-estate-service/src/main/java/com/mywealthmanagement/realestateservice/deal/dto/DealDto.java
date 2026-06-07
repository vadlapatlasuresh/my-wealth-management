package com.mywealthmanagement.realestateservice.deal.dto;

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
    private String title;
    private String category;
    private String subcategory;
    private String returnType;
    private BigDecimal annualReturnMin;
    private BigDecimal annualReturnMax;
    private String distributionFrequency;
    private String description;
    private String location;
    private String websiteUrl;
    private BigDecimal targetRaise;
    private BigDecimal minInvestment;
    private BigDecimal targetIrr;
    private Integer holdPeriodMonths;
    private String status;
    private BigDecimal amountCommitted;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    // Number of investors who have expressed interest. Populated for the owner's own
    // deal list; null when not applicable (e.g. marketplace view).
    private Integer interestCount;
}
