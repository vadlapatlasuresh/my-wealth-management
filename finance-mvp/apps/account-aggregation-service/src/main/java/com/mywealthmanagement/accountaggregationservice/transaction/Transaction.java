package com.mywealthmanagement.accountaggregationservice.transaction;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "transactions")
@Data
@NoArgsConstructor
public class Transaction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId; // This will be the ID from the Auth Service

    @Column(name = "account_id", nullable = false)
    private Long accountId; // Our internal Account ID

    @Column(name = "plaid_transaction_id", nullable = false, unique = true)
    private String plaidTransactionId;

    @Column(name = "plaid_account_id", nullable = false)
    private String plaidAccountId; // Plaid's Account ID

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private BigDecimal amount;

    @Column(name = "iso_currency_code", nullable = false)
    private String isoCurrencyCode;

    @Column(nullable = false)
    private LocalDate date;

    @Column
    private String category;

    /** Cleaned merchant name from Plaid (e.g. "Amazon"), when available. */
    @Column(name = "merchant_name")
    private String merchantName;

    /**
     * Whether the transaction is still pending (not yet cleared) at the institution.
     * Drives status tracking (pending vs cleared). Null for legacy rows synced before
     * this column existed; treated as cleared by consumers.
     */
    @Column(name = "pending")
    private Boolean pending;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
