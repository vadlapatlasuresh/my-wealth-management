package com.mywealthmanagement.businessfinancialsservice.business.manual;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * A business the user enters manually (when they are not connecting QuickBooks).
 * Replaces the previous browser-localStorage-only storage so businesses persist
 * across devices and survive a cache clear.
 */
@Entity
@Table(name = "manual_businesses")
@Data
@NoArgsConstructor
public class ManualBusiness {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false)
    private String name;

    private String industry;

    @Column(name = "entity_type")
    private String entityType;

    private String ein;

    // Optional manual KPI figures shown when not connected to QuickBooks.
    @Column(name = "revenue_mtd", precision = 18, scale = 2)
    private java.math.BigDecimal revenueMtd;

    @Column(name = "expenses_mtd", precision = 18, scale = 2)
    private java.math.BigDecimal expensesMtd;

    @Column(name = "outstanding_invoices", precision = 18, scale = 2)
    private java.math.BigDecimal outstandingInvoices;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
