package com.mywealthmanagement.financialcoreservice.invest;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * A brokerage account the user has linked. Replaces the previous browser-localStorage
 * storage in InvestPage so linked brokers persist across devices. We deliberately
 * never store entered broker credentials — only connected metadata.
 */
@Entity
@Table(name = "broker_accounts")
@Data
@NoArgsConstructor
public class BrokerAccount {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    /** Config id of the broker (from web src/config/brokers.js). */
    @Column(name = "broker_id")
    private String brokerId;

    @Column(nullable = false)
    private String name;

    @Column(name = "account_type")
    private String accountType;

    /** Synced market value; 0 until real data flows in. ("value" is a reserved word in H2/SQL.) */
    @Column(name = "market_value", precision = 18, scale = 2)
    private BigDecimal value = BigDecimal.ZERO;

    @Column(nullable = false)
    private boolean connected = true;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    /** Last time the account was (re)synced; surfaced as "last synced" in the UI. */
    @Column(name = "linked_at", nullable = false)
    private LocalDateTime linkedAt;
}
