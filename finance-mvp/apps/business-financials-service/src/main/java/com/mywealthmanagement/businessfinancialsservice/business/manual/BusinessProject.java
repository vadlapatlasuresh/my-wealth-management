package com.mywealthmanagement.businessfinancialsservice.business.manual;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * A fixed-contract project billed in milestones (order-to-cash, Phase 1.4b — progress
 * invoicing). Billing a milestone materializes a real {@link BusinessInvoice} for that
 * slice; {@link #billedToDate} / {@link #remaining} draw down against {@link #contractTotal}.
 *
 * <p>status: ACTIVE | COMPLETED | ARCHIVED
 */
@Entity
@Table(name = "business_projects")
@Data
@NoArgsConstructor
public class BusinessProject {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    @Column(name = "customer_id")
    private Long customerId;

    @Column(nullable = false)
    private String customer;

    @Column(name = "customer_email", length = 255)
    private String customerEmail;

    @Column(name = "customer_phone", length = 40)
    private String customerPhone;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(name = "contract_total", nullable = false, precision = 18, scale = 2)
    private BigDecimal contractTotal = BigDecimal.ZERO;

    @Column(nullable = false, length = 12)
    private String status = "ACTIVE";

    @Column(length = 1000)
    private String notes;

    @Transient
    private java.util.List<BusinessProjectMilestone> milestones;

    /** Sum of INVOICED milestone amounts (computed, not persisted). */
    @Transient
    private BigDecimal billedToDate;

    /** contractTotal − billedToDate (computed, not persisted). */
    @Transient
    private BigDecimal remaining;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
