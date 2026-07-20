package com.mywealthmanagement.realestateservice.holding.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * A private co-ownership position, with its capital account rolled up.
 *
 * <p>Every derived figure describes money that has actually moved on a position the user
 * already owns. There is deliberately no projected return, target IRR or valuation here —
 * this reports history, it does not forecast.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class PrivateHoldingDto {
    private Long id;

    @NotBlank(message = "name is required")
    @Size(max = 200, message = "name must be at most 200 characters")
    private String name;

    @Size(max = 30) private String entityType;
    @Size(max = 40) private String assetType;
    @Size(max = 200) private String location;
    @Size(max = 200) private String sponsorName;
    @Size(max = 320) private String sponsorContact;
    @Size(max = 500) private String externalUrl;

    @PositiveOrZero(message = "unitsHeld must be zero or positive")
    private BigDecimal unitsHeld;
    @PositiveOrZero(message = "totalUnits must be zero or positive")
    private BigDecimal totalUnits;
    @PositiveOrZero(message = "committedAmount must be zero or positive")
    private BigDecimal committedAmount;

    private LocalDate acquiredOn;
    @Size(max = 20) private String status;
    private Long sourceDealId;
    @Size(max = 2000) private String notes;

    // ---- derived, read-only ----

    /** unitsHeld / totalUnits, as a percentage. Null when either side is unknown. */
    private BigDecimal ownershipPct;
    /** Total capital actually put in. */
    private BigDecimal contributed;
    /** Committed less contributed — the capital that can still be called. */
    private BigDecimal uncalled;
    /** Everything paid out, of any kind. */
    private BigDecimal distributed;
    /** Distributions that gave capital back (return of capital, refi, sale proceeds). */
    private BigDecimal capitalReturned;
    /** Distributions that were income or gain rather than a return of basis. */
    private BigDecimal incomeReceived;
    /** contributed − capitalReturned: the basis still at risk. Never negative. */
    private BigDecimal unreturnedCapital;
    /** distributed / contributed. The plain "how much of my money has come back" ratio. */
    private BigDecimal distributionRatio;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
