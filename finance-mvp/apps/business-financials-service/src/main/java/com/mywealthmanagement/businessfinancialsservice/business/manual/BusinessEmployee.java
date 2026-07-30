package com.mywealthmanagement.businessfinancialsservice.business.manual;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * A payrolled employee (Phase 5). Withholding percentages are owner-set ESTIMATES (not IRS
 * tax tables) so payroll runs can compute gross → withholdings → net without a tax engine.
 */
@Entity
@Table(name = "business_employees")
@Data
@NoArgsConstructor
public class BusinessEmployee {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    @Column(nullable = false)
    private String name;

    @Column(length = 255)
    private String email;

    /** SALARY | HOURLY */
    @Column(name = "pay_type", nullable = false, length = 10)
    private String payType = "SALARY";

    /** Annual salary (SALARY) or hourly rate (HOURLY). */
    @Column(name = "pay_rate", nullable = false, precision = 18, scale = 2)
    private BigDecimal payRate = BigDecimal.ZERO;

    @Column(name = "fed_wh_pct", nullable = false, precision = 7, scale = 4)
    private BigDecimal fedWhPct = new BigDecimal("12");

    @Column(name = "state_wh_pct", nullable = false, precision = 7, scale = 4)
    private BigDecimal stateWhPct = new BigDecimal("4");

    @Column(name = "fica_pct", nullable = false, precision = 7, scale = 4)
    private BigDecimal ficaPct = new BigDecimal("7.65");

    @Column(nullable = false, length = 16)
    private String status = "ACTIVE";

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
