package com.mywealthmanagement.businessfinancialsservice.business.manual;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

/**
 * A transaction categorization rule (bank feeds, Phase 3a). When a transaction's merchant or
 * description matches, its category is set automatically. Rules are evaluated in {@code position}
 * order (first match wins) by {@link TxnRuleService}.
 */
@Entity
@Table(name = "business_txn_rules")
@Data
@NoArgsConstructor
public class BusinessTxnRule {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    /** MERCHANT | DESCRIPTION */
    @Column(name = "match_field", nullable = false, length = 16)
    private String matchField = "MERCHANT";

    /** CONTAINS | EQUALS | STARTS_WITH */
    @Column(name = "match_type", nullable = false, length = 16)
    private String matchType = "CONTAINS";

    @Column(name = "match_value", nullable = false, length = 200)
    private String matchValue;

    @Column(name = "set_category", nullable = false, length = 80)
    private String setCategory;

    @Column(nullable = false)
    private int position;

    @Column(nullable = false)
    private boolean active = true;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
