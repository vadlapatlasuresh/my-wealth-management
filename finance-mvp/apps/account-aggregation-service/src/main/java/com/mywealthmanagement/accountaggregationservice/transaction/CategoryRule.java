package com.mywealthmanagement.accountaggregationservice.transaction;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * A user-defined auto-categorization rule: when a transaction's merchant name matches
 * {@code pattern} (per {@code matchType}), assign {@code category}. Applied to
 * uncategorized transactions so budget actuals stay precise.
 */
@Entity
@Table(name = "category_rule")
@Data
@NoArgsConstructor
public class CategoryRule {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "match_type", nullable = false, length = 20)
    private String matchType; // CONTAINS | EQUALS | STARTS_WITH

    @Column(nullable = false, length = 200)
    private String pattern;

    @Column(nullable = false, length = 80)
    private String category;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
