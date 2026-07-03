package com.mywealthmanagement.businessfinancialsservice.business.manual;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

/**
 * A user's manual overrides for a transaction's derived type and its tags.
 * Applies to both linked (aggregation) and manual transactions, keyed by the
 * same stable external id used for reconciliation (e.g. {@code lin-<plaidTxnId>}
 * or {@code man-<id>}). Lets a user correct the heuristic type classification
 * and attach free-form tags.
 */
@Entity
@Table(
    name = "transaction_overrides",
    uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "external_id"})
)
@Data
@NoArgsConstructor
public class TransactionOverride {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "external_id", nullable = false)
    private String externalId;

    /** User-chosen transaction type; null means "use the derived type". */
    @Column(name = "override_type")
    private String overrideType;

    /** Comma-separated tags; null/empty means no tags. */
    @Column(name = "tags", length = 512)
    private String tags;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
