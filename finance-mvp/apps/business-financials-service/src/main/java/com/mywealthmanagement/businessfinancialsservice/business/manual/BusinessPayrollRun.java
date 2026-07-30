package com.mywealthmanagement.businessfinancialsservice.business.manual;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/** A single processed payroll run for one employee (Phase 5) — the paystub of record. */
@Entity
@Table(name = "business_payroll_runs")
@Data
@NoArgsConstructor
public class BusinessPayrollRun {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    @Column(name = "employee_id", nullable = false)
    private Long employeeId;

    @Column(name = "period_start")
    private LocalDate periodStart;

    @Column(name = "period_end")
    private LocalDate periodEnd;

    @Column(precision = 10, scale = 2)
    private BigDecimal hours;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal gross;

    @Column(name = "fed_wh", nullable = false, precision = 18, scale = 2)
    private BigDecimal fedWh = BigDecimal.ZERO;

    @Column(name = "state_wh", nullable = false, precision = 18, scale = 2)
    private BigDecimal stateWh = BigDecimal.ZERO;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal fica = BigDecimal.ZERO;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal net;

    @Column(nullable = false, length = 16)
    private String status = "PAID";

    @Column(name = "paid_at")
    private LocalDate paidAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    /** Employee name, populated on reads for the paystub UI (not persisted). */
    @Transient
    private String employeeName;
}
