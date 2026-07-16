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

    /** Link-based documents store the external URL here. Null for uploaded (GCS) files. */
    @Column(length = 1000)
    private String url;

    /** LINK (external url) or GCS (uploaded file streamed from Cloud Storage). */
    @Column(name = "storage_type", nullable = false, length = 16)
    private String storageType = "LINK";

    /** GCS object path (only for storageType = GCS). */
    @Column(name = "object_name", length = 1024)
    private String objectName;

    @Column(name = "content_type", length = 255)
    private String contentType;

    @Column(name = "size_bytes")
    private Long sizeBytes;

    @Column(name = "original_filename", length = 400)
    private String originalFilename;

    @Column(name = "doc_type", nullable = false, length = 40)
    private String docType = "OTHER";

    /** Tax/reporting year this document is filed under; drives year-wise grouping. */
    @Column(name = "period_year")
    private Integer periodYear;

    /** Optional month (1-12) within {@link #periodYear}. */
    @Column(name = "period_month")
    private Integer periodMonth;

    @Column(length = 500)
    private String note;

    /** Id of this document's mirror in the personal Document Center (for secure sharing). */
    @Column(name = "central_document_id")
    private Long centralDocumentId;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
