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
 * A purchase order (procure-to-pay, Phase 2b) — the buy-side mirror of {@link BusinessQuote}.
 * Issued to a vendor, then converted to an accounts-payable {@link BusinessBill} in one click.
 * The PO doesn't touch the ledger; only the Bill it becomes does.
 *
 * <p>status: DRAFT | SENT | APPROVED | RECEIVED | CONVERTED | CANCELLED
 */
@Entity
@Table(name = "business_purchase_orders")
@Data
@NoArgsConstructor
public class BusinessPurchaseOrder {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    @Column(nullable = false)
    private String vendor;

    @Column(name = "po_number", length = 60)
    private String poNumber;

    @Column(name = "expense_category", length = 80)
    private String expenseCategory;

    @Column(name = "order_date")
    private LocalDate orderDate;

    @Column(name = "expected_date")
    private LocalDate expectedDate;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal amount;

    @Column(name = "tax_amount", precision = 18, scale = 2)
    private BigDecimal taxAmount;

    @Column(nullable = false, length = 12)
    private String status = "DRAFT";

    @Column(length = 1000)
    private String notes;

    @Column(name = "converted_bill_id")
    private Long convertedBillId;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
