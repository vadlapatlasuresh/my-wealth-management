package com.mywealthmanagement.businessfinancialsservice.ledger;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * One account in a business's chart of accounts (GL.1). Its {@code type} fixes the
 * {@code normalBalance}: ASSET / EXPENSE are debit-normal, LIABILITY / EQUITY / INCOME are
 * credit-normal — which is how a balance nets debits against credits.
 */
@Entity
@Table(name = "ledger_accounts")
@Data
@NoArgsConstructor
public class LedgerAccount {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    @Column(nullable = false, length = 20)
    private String code;

    @Column(nullable = false, length = 160)
    private String name;

    /** ASSET | LIABILITY | EQUITY | INCOME | EXPENSE */
    @Column(nullable = false, length = 12)
    private String type;

    /** DEBIT | CREDIT (derived from type) */
    @Column(name = "normal_balance", nullable = false, length = 6)
    private String normalBalance;

    @Column(nullable = false)
    private boolean active = true;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
