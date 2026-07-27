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
 * A vendor bill — the accounts-payable counterpart of {@link BusinessInvoice} (procure-to-pay,
 * Phase 2a). Records what the business owes; posts to the ledger (DR expense / CR AP) when
 * entered and (DR AP / CR Cash) when paid.
 *
 * <p>status: OPEN | PARTIALLY_PAID | PAID | VOID
 */
@Entity
@Table(name = "business_bills")
@Data
@NoArgsConstructor
public class BusinessBill {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    @Column(nullable = false)
    private String vendor;

    @Column(name = "bill_number", length = 60)
    private String billNumber;

    @Column(name = "expense_category", length = 80)
    private String expenseCategory;

    @Column(name = "bill_date")
    private LocalDate billDate;

    @Column(name = "due_date")
    private LocalDate dueDate;

    @Column(name = "scheduled_pay_date")
    private LocalDate scheduledPayDate;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal amount;

    @Column(name = "tax_amount", precision = 18, scale = 2)
    private BigDecimal taxAmount;

    @Column(nullable = false, length = 16)
    private String status = "OPEN";

    @Column(length = 1000)
    private String notes;

    @Column(name = "paid_amount", precision = 18, scale = 2)
    private BigDecimal paidAmount;

    @Column(name = "paid_at")
    private LocalDate paidAt;

    @Column(name = "payment_method", length = 40)
    private String paymentMethod;

    @Column(name = "payment_reference", length = 200)
    private String paymentReference;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
