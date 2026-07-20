package com.mywealthmanagement.realestateservice.holding.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.List;

/**
 * Filing readiness for one tax year: whether every K-1 the user is owed has arrived.
 *
 * <p>A single outstanding K-1 blocks the return, so "how many are missing" is the number
 * that matters — not the total.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class K1YearSummaryDto {
    private Integer taxYear;
    private int expected;
    private int received;
    private int notApplicable;
    /** True when nothing is still outstanding for the year. */
    private boolean readyToFile;
    /** Outstanding past this year's filing deadline. */
    private int overdue;

    /** Totals across the received K-1s, for carrying into a return. */
    private BigDecimal ordinaryIncome;
    private BigDecimal rentalIncome;
    private BigDecimal distributions;

    /** The still-outstanding records, ready to chase. */
    private List<K1RecordDto> outstanding;
}
