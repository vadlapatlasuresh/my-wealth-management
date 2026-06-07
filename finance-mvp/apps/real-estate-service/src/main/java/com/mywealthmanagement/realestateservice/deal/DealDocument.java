package com.mywealthmanagement.realestateservice.deal;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * A document link attached to a deal (PPM, financials, operating agreement, data-room URL).
 * Link-based so it needs no object storage: sponsors host the file and attach its URL.
 */
@Entity
@Table(name = "deal_documents")
@Data
@NoArgsConstructor
public class DealDocument {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "deal_id", nullable = false)
    private Long dealId;

    @Column(name = "owner_user_id", nullable = false)
    private Long ownerUserId;

    @Column(nullable = false, length = 200)
    private String label;

    @Column(nullable = false, length = 500)
    private String url;

    // Free-form type tag, e.g. PPM / FINANCIALS / OPERATING_AGREEMENT / OTHER.
    @Column(name = "doc_type", length = 40)
    private String docType;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
