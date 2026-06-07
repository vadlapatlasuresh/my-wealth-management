package com.mywealthmanagement.businessfinancialsservice.business.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class InvoiceDto {
    private String id;
    private String customer;
    private BigDecimal amount;
    private String status; // PAID | OPEN | OVERDUE
    private LocalDate dueDate;
}
