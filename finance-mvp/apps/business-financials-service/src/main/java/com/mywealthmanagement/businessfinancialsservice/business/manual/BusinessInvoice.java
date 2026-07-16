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

    @Column(nullable = false)
    private String customer;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal amount;

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
