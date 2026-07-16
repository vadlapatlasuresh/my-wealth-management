package com.mywealthmanagement.documentsservice.doc;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

/**
 * A document in the personal Document Center. The center is the single source of
 * truth: a document is either a file uploaded here (storageType=GCS), an external
 * link (LINK), or a reference to a file another service owns (EXTERNAL_REF), in
 * which case {@code sourceService}/{@code sourceRef} identify the originating record.
 *
 * <p>docType: W2 | 1099 | TAX_RETURN | STATEMENT | ID | CONTRACT | RECEIPT | OTHER
 */
@Entity
@Table(name = "documents")
@Data
@NoArgsConstructor
public class Document {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    /** Folder this document lives in, or null for the root ("All documents"). */
    @Column(name = "folder_id")
    private Long folderId;

    @Column(nullable = false, length = 200)
    private String label;

    /** LINK | GCS | EXTERNAL_REF. */
    @Column(name = "storage_type", nullable = false, length = 16)
    private String storageType = "LINK";

    /** External URL for LINK / EXTERNAL_REF documents. Null for uploaded (GCS) files. */
    @Column(length = 1000)
    private String url;

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

    /** Originating service for registered documents (null = created in the center). */
    @Column(name = "source_service", length = 60)
    private String sourceService;

    /** Originating record id within {@link #sourceService}. */
    @Column(name = "source_ref", length = 200)
    private String sourceRef;

    @Column(length = 500)
    private String note;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
