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

    /** Last 2–4 digits of the account number, from Plaid (e.g. "4321"). */
    @Column(name = "mask")
    private String mask;

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

    /** Plaid account holder category: "business" | "personal" | "unrecognized" (nullable).
     *  Drives auto-detection of business accounts on the business page. */
    @Column(name = "holder_category")
    private String holderCategory;

    // --- Credit-card / liability details (nullable; populated via Plaid Liabilities) ---

    /** Credit limit for cards/lines of credit (Plaid balances.limit). */
    @Column(name = "credit_limit")
    private BigDecimal creditLimit;

    /** Most recent statement balance on a credit card. */
    @Column(name = "last_statement_balance")
    private BigDecimal lastStatementBalance;

    /** Minimum payment due on a credit card this cycle. */
    @Column(name = "minimum_payment")
    private BigDecimal minimumPayment;

    /** Next payment due date for a credit card — drives bill reminders. */
    @Column(name = "next_payment_due_date")
    private java.time.LocalDate nextPaymentDueDate;

    /** Purchase APR (percent, e.g. 22.99) for a credit card. */
    @Column(name = "apr_percentage")
    private BigDecimal aprPercentage;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
