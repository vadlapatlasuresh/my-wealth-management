package com.mywealthmanagement.accountaggregationservice.holding;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * A brokerage trade/activity row synced from Plaid Investments transactions
 * (buy, sell, dividend, fee, transfer, …). Security ticker/name are denormalized
 * so the Activity view renders without a join.
 */
@Entity
@Table(name = "investment_transactions")
@Data
@NoArgsConstructor
public class InvestmentTransaction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    /** Plaid's stable id for the investment transaction (idempotent upsert key). */
    @Column(name = "plaid_investment_txn_id", nullable = false, unique = true)
    private String plaidInvestmentTxnId;

    @Column(name = "plaid_account_id", nullable = false)
    private String plaidAccountId;

    @Column(name = "security_id")
    private String securityId;

    @Column(name = "symbol")
    private String symbol;

    @Column(name = "name")
    private String name;

    /** Broker / institution display name. */
    @Column(name = "broker")
    private String broker;

    /** High-level type: buy | sell | cash | fee | transfer | cancel. */
    @Column(name = "type")
    private String type;

    /** Finer subtype, e.g. dividend, contribution, management fee. */
    @Column(name = "subtype")
    private String subtype;

    @Column(name = "txn_date", nullable = false)
    private LocalDate date;

    @Column(name = "quantity", precision = 23, scale = 8)
    private BigDecimal quantity;

    /** Price per unit at transaction time. */
    @Column(name = "price", precision = 19, scale = 4)
    private BigDecimal price;

    /** Total amount of the transaction (positive = cash out of the account). */
    @Column(name = "amount", precision = 19, scale = 4)
    private BigDecimal amount;

    @Column(name = "fees", precision = 19, scale = 4)
    private BigDecimal fees;

    @Column(name = "currency")
    private String currency;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
