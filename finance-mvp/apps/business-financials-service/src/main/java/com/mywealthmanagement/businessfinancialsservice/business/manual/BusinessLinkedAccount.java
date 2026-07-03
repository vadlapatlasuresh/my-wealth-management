package com.mywealthmanagement.businessfinancialsservice.business.manual;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * Assigns a linked (aggregation/Plaid) account to a business, so the business
 * page shows only the accounts the user designates as business — not their whole
 * aggregation. Keyed by the aggregation account's id (as supplied by the client);
 * the business service does not own that account, so it stores the reference only.
 */
@Entity
@Table(
    name = "business_linked_accounts",
    uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "business_id", "linked_account_id"})
)
@Data
@NoArgsConstructor
public class BusinessLinkedAccount {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    /** The aggregation account id (stringified) this business is assigned. */
    @Column(name = "linked_account_id", nullable = false, length = 128)
    private String linkedAccountId;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
