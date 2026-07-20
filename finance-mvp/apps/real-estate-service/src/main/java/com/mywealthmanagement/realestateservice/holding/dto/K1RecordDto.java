package com.mywealthmanagement.realestateservice.holding.dto;

import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;

/** A Schedule K-1 owed or received for one holding in one tax year. */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class K1RecordDto {
    private Long id;
    private Long holdingId;
    private Integer taxYear;

    /** EXPECTED | RECEIVED | NOT_APPLICABLE */
    @Size(max = 20) private String status;
    private LocalDate receivedOn;
    /** documents-service id of the filed K-1, when the user attached one. */
    private Long documentId;
    @Size(max = 300) private String documentName;
    @Size(max = 500) private String documentUrl;

    private BigDecimal ordinaryIncome;   // box 1
    private BigDecimal rentalIncome;     // box 2
    private BigDecimal distributions;    // box 19
    @Size(max = 500) private String notes;

    // ---- denormalized for the chase list, so the UI needs no second call ----
    private String holdingName;
    private String sponsorName;
    /** Who to chase. Surfaced as a mailto: so the user writes to them directly. */
    private String sponsorContact;
    /** True once the filing deadline for this tax year has passed and it is still expected. */
    private Boolean overdue;
}
