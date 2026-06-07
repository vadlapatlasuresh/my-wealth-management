package com.mywealthmanagement.businessfinancialsservice.business.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class PnlDto {
    private String period;
    private List<PnlLine> revenue;
    private List<PnlLine> expenses;
    private BigDecimal totalRevenue;
    private BigDecimal totalExpenses;
    private BigDecimal netProfit;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PnlLine {
        private String category;
        private BigDecimal amount;
    }
}
