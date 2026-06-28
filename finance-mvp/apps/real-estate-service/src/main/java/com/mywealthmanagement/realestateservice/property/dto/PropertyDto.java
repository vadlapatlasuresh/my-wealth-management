package com.mywealthmanagement.realestateservice.property.dto;

import jakarta.validation.constraints.NotBlank;
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
public class PropertyDto {
    private Long id;

    @NotBlank(message = "address is required")
    @Size(max = 500, message = "address must be at most 500 characters")
    private String address;

    @Size(max = 100, message = "propertyType must be at most 100 characters")
    private String propertyType;

    @PositiveOrZero(message = "purchasePrice must be zero or positive")
    private BigDecimal purchasePrice;
    private LocalDate purchaseDate;

    @PositiveOrZero(message = "currentValue must be zero or positive")
    private BigDecimal currentValue;

    @PositiveOrZero(message = "mortgageBalance must be zero or positive")
    private BigDecimal mortgageBalance;
    private BigDecimal equity; // currentValue - mortgageBalance
    private LocalDateTime lastValuedAt;

    @PositiveOrZero(message = "beds must be zero or positive")
    private Integer beds;

    @PositiveOrZero(message = "baths must be zero or positive")
    private BigDecimal baths;

    @PositiveOrZero(message = "sqft must be zero or positive")
    private Integer sqft;
    private Integer yearBuilt;

    @PositiveOrZero(message = "rentEstimate must be zero or positive")
    private BigDecimal rentEstimate;

    // Financing & monthly carrying costs (all optional).
    @PositiveOrZero(message = "apr must be zero or positive")
    private BigDecimal apr;

    @PositiveOrZero(message = "monthlyPayment must be zero or positive")
    private BigDecimal monthlyPayment;

    @PositiveOrZero(message = "monthlyTax must be zero or positive")
    private BigDecimal monthlyTax;

    @PositiveOrZero(message = "monthlyInsurance must be zero or positive")
    private BigDecimal monthlyInsurance;

    @PositiveOrZero(message = "monthlyHoa must be zero or positive")
    private BigDecimal monthlyHoa;

    @PositiveOrZero(message = "monthlyPmi must be zero or positive")
    private BigDecimal monthlyPmi;
}
