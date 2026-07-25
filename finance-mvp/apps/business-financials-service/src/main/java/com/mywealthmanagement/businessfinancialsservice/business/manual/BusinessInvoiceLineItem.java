package com.mywealthmanagement.businessfinancialsservice.business.manual;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * One itemized line on a {@link BusinessInvoice} (order-to-cash, Phase 1.2).
 *
 * <p>{@link #amount} is the persisted line total (quantity × unitPrice). The invoice's
 * subtotal is the sum of its lines; discount and tax are applied at the invoice level to
 * produce the grand total stored in {@link BusinessInvoice#getAmount()}.
 */
@Entity
@Table(name = "business_invoice_line_items")
@Data
@NoArgsConstructor
public class BusinessInvoiceLineItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "invoice_id", nullable = false)
    private Long invoiceId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false)
    private int position;

    @Column(nullable = false, length = 500)
    private String description;

    @Column(nullable = false, precision = 18, scale = 4)
    private BigDecimal quantity = BigDecimal.ONE;

    @Column(name = "unit_price", nullable = false, precision = 18, scale = 4)
    private BigDecimal unitPrice = BigDecimal.ZERO;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal amount = BigDecimal.ZERO;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
