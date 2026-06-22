package com.mywealthmanagement.accountaggregationservice.transaction;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;

/** A detected recurring charge (subscription/bill) derived from transaction history. */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class RecurringBillDto {
    private String name;          // merchant/payee
    private BigDecimal amount;    // typical (median) amount
    private String cadence;       // WEEKLY | BIWEEKLY | MONTHLY | YEARLY
    private LocalDate lastDate;   // most recent occurrence
    private LocalDate nextDate;   // predicted next occurrence
    private int occurrences;      // how many times seen
}
