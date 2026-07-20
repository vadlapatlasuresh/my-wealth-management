package com.mywealthmanagement.financialcoreservice.financialcore.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class SnapshotDto {
    private Long userId;
    private LocalDateTime computedAt;
    private NetWorthDto netWorth;
    private ComponentsDto components;
    private List<TimeSeriesPoint> series;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class NetWorthDto {
        private BigDecimal total;
        private BigDecimal change30d;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ComponentsDto {
        private BigDecimal cash;
        private BigDecimal cashChange30d;
        private BigDecimal investments;
        private BigDecimal investmentsChange30d;
        private BigDecimal creditCards;
        private BigDecimal creditCardsChange30d;
        private BigDecimal loans;
        private BigDecimal realEstateValue;
        private BigDecimal realEstateValueChange30d;
        private BigDecimal realEstateEquity;
        private BigDecimal realEstateEquityChange30d;
        private BigDecimal privateHoldings;
        private BigDecimal privateHoldingsChange30d;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TimeSeriesPoint {
        private LocalDateTime ts;
        private BigDecimal value;
    }
}
