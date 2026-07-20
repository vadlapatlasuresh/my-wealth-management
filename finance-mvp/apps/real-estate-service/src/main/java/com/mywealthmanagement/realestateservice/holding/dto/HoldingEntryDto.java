package com.mywealthmanagement.realestateservice.holding.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/** One capital contribution or distribution on a private holding. */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class HoldingEntryDto {
    private Long id;
    private Long holdingId;

    /** CONTRIBUTION | DISTRIBUTION */
    @Size(max = 20) private String direction;

    /** Must belong to the chosen direction — see HoldingTaxonomy. */
    @Size(max = 30) private String category;

    @NotNull(message = "amount is required")
    @Positive(message = "amount must be greater than zero")
    private BigDecimal amount;

    @NotNull(message = "occurredOn is required")
    private LocalDate occurredOn;

    @Size(max = 500) private String note;

    private LocalDateTime createdAt;
}
