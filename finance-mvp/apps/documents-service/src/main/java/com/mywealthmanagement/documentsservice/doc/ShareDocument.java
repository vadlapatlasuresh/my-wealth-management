package com.mywealthmanagement.documentsservice.doc;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Membership row: one document belonging to a multi-file share (target_kind = SET). */
@Entity
@Table(name = "share_documents")
@Data
@NoArgsConstructor
public class ShareDocument {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "share_id", nullable = false)
    private Long shareId;

    @Column(name = "document_id", nullable = false)
    private Long documentId;

    public ShareDocument(Long shareId, Long documentId) {
        this.shareId = shareId;
        this.documentId = documentId;
    }
}
