package com.mywealthmanagement.businessfinancialsservice.business.manual;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * An owner-defined sales-tax / VAT rate scoped to a jurisdiction (order-to-cash, Phase 1.7).
 * Resolved against a customer's billing location to auto-apply tax on invoices.
 */
@Entity
@Table(name = "business_tax_rates")
@Data
@NoArgsConstructor
public class BusinessTaxRate {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(nullable = false, precision = 7, scale = 4)
    private BigDecimal rate;

    @Column(length = 2)
    private String country;

    @Column(length = 120)
    private String region;

    @Column(length = 24)
    private String postal;

    @Column(name = "is_default", nullable = false)
    private boolean isDefault = false;

    @Column(nullable = false)
    private boolean active = true;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
