package com.mywealthmanagement.businessfinancialsservice.business.manual;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * A ledger transaction attached to a {@link BusinessExpense}.
 *
 * <p>Deliberately not a foreign key to {@link BusinessTransaction}: Plaid-linked
 * transactions are fetched at runtime from account-aggregation and never persisted here.
 * A link is therefore a polymorphic reference ({@link #txSource} + {@link #txRef}) plus a
 * snapshot of the row as it looked when linked, so the expense stays auditable even if the
 * account is unlinked or the transaction ages out of the provider window.
 */
@Entity
@Table(name = "business_expense_links")
@Data
@NoArgsConstructor
public class BusinessExpenseLink {

    public static final String SOURCE_MANUAL = "MANUAL";
    public static final String SOURCE_LINKED = "LINKED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "expense_id", nullable = false)
    private Long expenseId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    /** MANUAL = business_transactions.id, LINKED = provider external id. */
    @Column(name = "tx_source", nullable = false, length = 16)
    private String txSource;

    @Column(name = "tx_ref", nullable = false, length = 200)
    private String txRef;

    // ---- snapshot at link time ----

    @Column(name = "tx_date")
    private LocalDate txDate;

    /** Signed as it appeared in the ledger (negative = money out). */
    @Column(name = "tx_amount", precision = 18, scale = 2)
    private BigDecimal txAmount;

    @Column(name = "tx_description", length = 500)
    private String txDescription;

    @Column(name = "tx_merchant", length = 200)
    private String txMerchant;

    @Column(name = "tx_account", length = 200)
    private String txAccount;

    @CreationTimestamp
    @Column(name = "linked_at", nullable = false, updatable = false)
    private LocalDateTime linkedAt;
}
