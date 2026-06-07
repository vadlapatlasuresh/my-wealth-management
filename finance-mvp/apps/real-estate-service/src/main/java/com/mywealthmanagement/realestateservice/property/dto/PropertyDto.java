package com.mywealthmanagement.realestateservice.property.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class PropertyDto {
    private Long id;
    private String address;
    private String propertyType;
    private BigDecimal purchasePrice;
    private LocalDate purchaseDate;
    private BigDecimal currentValue;
    private BigDecimal mortgageBalance;
    private BigDecimal equity; // currentValue - mortgageBalance
    private LocalDateTime lastValuedAt;
    private Integer beds;
    private BigDecimal baths;
    private Integer sqft;
    private Integer yearBuilt;
    private BigDecimal rentEstimate;
}
