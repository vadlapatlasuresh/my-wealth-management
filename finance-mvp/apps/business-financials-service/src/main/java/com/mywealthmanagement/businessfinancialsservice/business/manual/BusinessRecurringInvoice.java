package com.mywealthmanagement.businessfinancialsservice.business.manual;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * A recurring invoice schedule (order-to-cash, Phase 1.4a): an invoice template + a cadence.
 * {@link com.mywealthmanagement.businessfinancialsservice.business.recurring.RecurringInvoiceService}
 * materializes a real {@link BusinessInvoice} from it each time it comes due.
 *
 * <p>status: ACTIVE | PAUSED | ENDED · frequency: WEEKLY | MONTHLY | QUARTERLY | ANNUALLY
 */
@Entity
@Table(name = "business_recurring_invoices")
@Data
@NoArgsConstructor
public class BusinessRecurringInvoice {

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

    @Column(nullable = false, length = 12)
    private String frequency;

    @Column(name = "interval_count", nullable = false)
    private int intervalCount = 1;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date")
    private LocalDate endDate;

    @Column(name = "next_run_date", nullable = false)
    private LocalDate nextRunDate;

    @Column(name = "due_days", nullable = false)
    private int dueDays = 0;

    @Column(nullable = false, length = 12)
    private String status = "ACTIVE";

    @Column(name = "discount_type", length = 8)
    private String discountType;

    @Column(name = "discount_value", precision = 18, scale = 4)
    private BigDecimal discountValue;

    @Column(name = "tax_rate", precision = 7, scale = 4)
    private BigDecimal taxRate;

    @Column(length = 1000)
    private String notes;

    @Column(name = "last_generated_at")
    private LocalDateTime lastGeneratedAt;

    @Column(name = "generated_count", nullable = false)
    private int generatedCount = 0;

    @Transient
    private java.util.List<BusinessRecurringInvoiceItem> lineItems;

    /** Convenience for the UI: the template's computed grand total (not persisted). */
    @Transient
    private BigDecimal amount;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
