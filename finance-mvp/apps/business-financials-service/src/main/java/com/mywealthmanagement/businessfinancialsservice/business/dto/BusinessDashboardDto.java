package com.mywealthmanagement.businessfinancialsservice.business.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class BusinessDashboardDto {
    private String companyName;
    private boolean connected;
    private BigDecimal revenueMtd;
    private BigDecimal expensesMtd;
    private BigDecimal netProfitMtd;
    private BigDecimal cashBalance;
    private BigDecimal outstandingInvoices;
    private BigDecimal revenueChangePct;
}
