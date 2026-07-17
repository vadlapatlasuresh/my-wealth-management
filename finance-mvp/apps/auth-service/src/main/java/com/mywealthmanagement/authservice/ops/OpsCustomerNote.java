package com.mywealthmanagement.authservice.ops;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * An internal note on a customer record. Ops-only — never shown to the customer.
 *
 * APPEND-ONLY: there is no edit path, deliberately. An editable note is one you cannot rely on in
 * a dispute six months later; a correction is a new note. Same reasoning as the ledger.
 */
@Entity
@Table(name = "ops_customer_notes")
@Data
@NoArgsConstructor
public class OpsCustomerNote {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** The CUSTOMER this note is about. */
    @Column(name = "user_id", nullable = false, length = 64)
    private String userId;

    /** ops_users id of whoever wrote it. */
    @Column(name = "author_id", nullable = false, length = 64)
    private String authorId;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String body;

    /** Pinned notes lead the record — the things the next agent must not miss. */
    @Column(nullable = false)
    private Boolean pinned = false;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
