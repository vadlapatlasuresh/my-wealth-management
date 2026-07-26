package com.mywealthmanagement.businessfinancialsservice.business.manual;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * A trackable invoice attached to a {@link ManualBusiness}. Backs the
 * "Business Tools" tab (create / send / track) and the pending-payments view.
 *
 * <p>status: OPEN | PAID | OVERDUE
 */
@Entity
@Table(name = "business_invoices")
@Data
@NoArgsConstructor
public class BusinessInvoice {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    /**
     * Optional link to a saved {@link BusinessCustomer}. Nullable: legacy and one-off
     * ad-hoc invoices carry only the inline snapshot below. The {@code customer} /
     * {@code customerEmail} / {@code customerPhone} fields remain the source of truth for
     * rendering so the public view is stable even if the customer is edited or archived.
     */
    @Column(name = "customer_id")
    private Long customerId;

    @Column(nullable = false)
    private String customer;

    /**
     * The authoritative grand total the customer owes. Kept as the single source of truth
     * for every AR aggregation, the public page and reconciliation. When line items exist
     * it equals subtotal − discountAmount + taxAmount; for legacy/one-off invoices it is
     * entered directly.
     */
    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal amount;

    /* ---- Money breakdown (Phase 1.2). All null on un-itemized legacy invoices. ---- */

    /** Sum of line-item amounts, before discount and tax. */
    @Column(precision = 18, scale = 2)
    private BigDecimal subtotal;

    /** NULL | AMOUNT | PERCENT */
    @Column(name = "discount_type", length = 8)
    private String discountType;

    /** The entered discount number — an absolute amount or a percent, per discountType. */
    @Column(name = "discount_value", precision = 18, scale = 4)
    private BigDecimal discountValue;

    /** The computed absolute discount applied to the subtotal. */
    @Column(name = "discount_amount", precision = 18, scale = 2)
    private BigDecimal discountAmount;

    /** Tax rate as a percent (e.g. 8.25). Populated manually now; by the tax engine in 1.7. */
    @Column(name = "tax_rate", precision = 7, scale = 4)
    private BigDecimal taxRate;

    /** Computed tax on (subtotal − discountAmount). */
    @Column(name = "tax_amount", precision = 18, scale = 2)
    private BigDecimal taxAmount;

    /**
     * Line items for this invoice. Not mapped as a JPA relationship (kept as a plain
     * transient) so the many existing invoice endpoints keep their current fetch/serialize
     * behavior; the controller loads and attaches these explicitly on read/create/update.
     */
    @Transient
    private java.util.List<BusinessInvoiceLineItem> lineItems;

    @Column(nullable = false)
    private String status = "OPEN";

    @Column(name = "issued_at")
    private LocalDate issuedAt;

    @Column(name = "due_date")
    private LocalDate dueDate;

    @Column(name = "invoice_number", length = 60)
    private String invoiceNumber;

    @Column(name = "customer_email", length = 255)
    private String customerEmail;

    @Column(name = "customer_phone", length = 40)
    private String customerPhone;

    @Column(length = 1000)
    private String notes;

    /** How the customer should pay (Zelle handle, bank details…); shown on the public page. */
    @Column(name = "pay_instructions", length = 1000)
    private String payInstructions;

    /** Opaque token for the public invoice view; minted on first send. */
    @Column(name = "share_token", length = 64)
    private String shareToken;

    @Column(name = "sent_at")
    private LocalDateTime sentAt;

    @Column(name = "sent_channel", length = 16)
    private String sentChannel;

    /** First time the customer opened the public invoice page (drives the VIEWED status). */
    @Column(name = "viewed_at")
    private LocalDateTime viewedAt;

    /* ---- Payment reconciliation (manual) ---- */
    @Column(name = "paid_at")
    private LocalDate paidAt;

    @Column(name = "paid_amount", precision = 18, scale = 2)
    private BigDecimal paidAmount;

    @Column(name = "payment_method", length = 40)
    private String paymentMethod;

    @Column(name = "payment_reference", length = 200)
    private String paymentReference;

    /** Optional business transaction that recorded the incoming payment. */
    @Column(name = "linked_transaction_id")
    private Long linkedTransactionId;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
