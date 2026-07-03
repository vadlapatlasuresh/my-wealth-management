package com.mywealthmanagement.businessfinancialsservice.business.manual;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * Marks a transaction as reconciled for a user. The transaction may live in the
 * aggregation service (a linked/Plaid transaction) or be a manual business
 * transaction, so we key by a stable external id string supplied by the client
 * (e.g. {@code lin-<plaidTransactionId>} or {@code man-<id>}) rather than a FK.
 */
@Entity
@Table(
    name = "reconciled_transactions",
    uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "external_id"})
)
@Data
@NoArgsConstructor
public class ReconciledTransaction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "external_id", nullable = false)
    private String externalId;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
