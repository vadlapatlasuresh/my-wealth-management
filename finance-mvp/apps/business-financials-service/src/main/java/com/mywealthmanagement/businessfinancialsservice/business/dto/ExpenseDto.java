package com.mywealthmanagement.businessfinancialsservice.business.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ExpenseDto {
    private String id;
    private String vendor;
    private String category;
    private BigDecimal amount;
    private LocalDate date;
}
