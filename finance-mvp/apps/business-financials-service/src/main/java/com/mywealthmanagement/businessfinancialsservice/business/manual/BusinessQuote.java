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
 * A customer quote / estimate (order-to-cash, Phase 1.3). Mirrors {@link BusinessInvoice}'s
 * shape but is deliberately its own entity so a proposal never counts as accounts
 * receivable. One-click convert produces a real invoice and stamps this CONVERTED.
 *
 * <p>status: DRAFT | SENT | ACCEPTED | DECLINED | EXPIRED | CONVERTED
 */
@Entity
@Table(name = "business_quotes")
@Data
@NoArgsConstructor
public class BusinessQuote {

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

    @Column(name = "quote_number", length = 60)
    private String quoteNumber;

    @Column(nullable = false, length = 16)
    private String status = "DRAFT";

    @Column(name = "issued_at")
    private LocalDate issuedAt;

    @Column(name = "expiry_date")
    private LocalDate expiryDate;

    /* ---- Money breakdown (same rules as invoices). ---- */
    @Column(precision = 18, scale = 2)
    private BigDecimal subtotal;

    @Column(name = "discount_type", length = 8)
    private String discountType;

    @Column(name = "discount_value", precision = 18, scale = 4)
    private BigDecimal discountValue;

    @Column(name = "discount_amount", precision = 18, scale = 2)
    private BigDecimal discountAmount;

    @Column(name = "tax_rate", precision = 7, scale = 4)
    private BigDecimal taxRate;

    @Column(name = "tax_amount", precision = 18, scale = 2)
    private BigDecimal taxAmount;

    /** Grand total of the quote. */
    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal amount = BigDecimal.ZERO;

    @Column(length = 1000)
    private String notes;

    @Column(name = "share_token", length = 64)
    private String shareToken;

    @Column(name = "sent_at")
    private LocalDateTime sentAt;

    @Column(name = "sent_channel", length = 16)
    private String sentChannel;

    /** Set once converted; points at the created business_invoices.id. */
    @Column(name = "converted_invoice_id")
    private Long convertedInvoiceId;

    @Transient
    private java.util.List<BusinessQuoteLineItem> lineItems;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
