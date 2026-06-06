package com.mywealthmanagement.accountaggregationservice.account;

import com.mywealthmanagement.accountaggregationservice.plaid.PlaidItem;
import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "accounts")
@Data
@NoArgsConstructor
public class Account {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId; // This will be the ID from the Auth Service

    @Column(name = "plaid_account_id", nullable = false, unique = true)
    private String plaidAccountId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "plaid_item_id", referencedColumnName = "plaid_item_id", nullable = false)
    private PlaidItem plaidItem;

    @Column(nullable = false)
    private String name;

    @Column(name = "official_name")
    private String officialName;

    @Column(nullable = false)
    private String subtype;

    @Column(nullable = false)
    private String type;

    @Column(name = "current_balance", nullable = false)
    private BigDecimal currentBalance;

    @Column(name = "available_balance")
    private BigDecimal availableBalance;

    @Column(nullable = false)
    private String currency;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
