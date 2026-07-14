package com.mywealthmanagement.businessfinancialsservice.business.manual;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * A document attached to a {@link ManualBusiness}. Link-based (mirrors the
 * real-estate deal_documents pattern): the file is hosted wherever the user
 * keeps it and we store its URL, a label and a type. Optionally bound to a
 * {@link BusinessInvoice} via {@code invoiceId} so an invoice can carry its
 * PDF / receipt. Kept per-business and per-user so nothing leaks across entities.
 *
 * <p>docType: INVOICE | RECEIPT | CONTRACT | TAX | STATEMENT | LICENSE | OTHER
 */
@Entity
@Table(name = "business_documents")
@Data
@NoArgsConstructor
public class BusinessDocument {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    /** Optional link to a specific invoice this document belongs to. */
    @Column(name = "invoice_id")
    private Long invoiceId;

    @Column(nullable = false, length = 200)
    private String label;

    @Column(nullable = false, length = 1000)
    private String url;

    @Column(name = "doc_type", nullable = false, length = 40)
    private String docType = "OTHER";

    @Column(length = 500)
    private String note;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
