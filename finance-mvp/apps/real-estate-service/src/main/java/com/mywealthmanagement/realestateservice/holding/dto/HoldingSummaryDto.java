package com.mywealthmanagement.realestateservice.holding.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.List;

/**
 * Portfolio-level rollup across every private holding.
 *
 * <p>The concentration breakdowns are the point: an LP's real risk is usually that too much
 * of their capital sits with one sponsor or in one market, and that is invisible when each
 * position is only ever viewed on its own.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class HoldingSummaryDto {
    private int holdingCount;
    private int activeCount;
    private BigDecimal committed;
    private BigDecimal contributed;
    private BigDecimal uncalled;
    private BigDecimal distributed;
    private BigDecimal capitalReturned;
    private BigDecimal incomeReceived;
    private BigDecimal unreturnedCapital;
    private BigDecimal distributionRatio;
    /** What these positions contribute to net worth, summed across holdings. */
    private BigDecimal netWorthValue;
    /** How many carry a user estimate rather than falling back to capital at risk. */
    private int valuedCount;

    private List<Concentration> bySponsor;
    private List<Concentration> byAssetType;
    private List<Concentration> byLocation;

    /** One slice of the portfolio: how much capital sits behind a single label. */
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Concentration {
        private String label;
        private int holdings;
        private BigDecimal contributed;
        /** Share of total contributed capital, as a percentage. */
        private BigDecimal sharePct;
    }
}
