package com.mywealthmanagement.accountaggregationservice.holding;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * A single brokerage position synced from Plaid Investments (e.g. 10 shares of AAPL).
 * Security details (ticker, name, type) are denormalized onto the holding so the
 * Investments UI can render a row without a join. One row per
 * (user, plaid account, security).
 */
@Entity
@Table(
    name = "holdings",
    uniqueConstraints = @UniqueConstraint(
        name = "uq_holding_user_account_security",
        columnNames = {"user_id", "plaid_account_id", "security_id"}
    )
)
@Data
@NoArgsConstructor
public class Holding {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    /** Plaid account the position is held in (links back to accounts.plaid_account_id). */
    @Column(name = "plaid_account_id", nullable = false)
    private String plaidAccountId;

    /** Plaid security identifier. */
    @Column(name = "security_id", nullable = false)
    private String securityId;

    /** Ticker symbol, e.g. "AAPL". "CASH" for cash positions; null for some securities. */
    @Column(name = "symbol")
    private String symbol;

    /** Human-readable security name, e.g. "Apple Inc." */
    @Column(name = "name")
    private String name;

    /** Plaid security type (equity, etf, mutual fund, cash, …). */
    @Column(name = "security_type")
    private String securityType;

    /** Broker / institution display name (for the Investments broker filter). */
    @Column(name = "broker")
    private String broker;

    @Column(name = "quantity", precision = 23, scale = 8)
    private BigDecimal quantity;

    /** Latest institution price per share. */
    @Column(name = "price", precision = 19, scale = 4)
    private BigDecimal price;

    /** Market value of the position (quantity × price, as reported by Plaid). */
    @Column(name = "market_value", precision = 19, scale = 4)
    private BigDecimal value;

    /** Total cost basis of the position, if reported. */
    @Column(name = "cost_basis", precision = 19, scale = 4)
    private BigDecimal costBasis;

    @Column(name = "currency")
    private String currency;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
