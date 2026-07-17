package com.mywealthmanagement.paymentservice.ledger;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * One immutable line in a customer's money history.
 *
 * APPEND-ONLY. There are no setters called after insert anywhere in this codebase, and there must
 * never be: a correction is a NEW entry with {@code reversesId} pointing at the original. That is
 * what makes the history auditable rather than merely current — you can always answer not just
 * "what is the balance" but "how did it get there, and who did that".
 */
@Entity
@Table(name = "ledger_entries")
@Data
@NoArgsConstructor
public class LedgerEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** The customer this money belongs to. */
    @Column(name = "user_id", nullable = false, length = 64)
    private String userId;

    @Column(name = "entry_type", nullable = false, length = 32)
    private String entryType;

    /**
     * Signed minor units: positive = owed to us, negative = owed to the customer.
     * Integer cents, never a floating-point type — a rounding error here is a rounding error in
     * someone's actual money.
     */
    @Column(name = "amount_cents", nullable = false)
    private Long amountCents;

    @Column(nullable = false, length = 3)
    private String currency = "USD";

    /** Running balance at the moment this was appended. Pins what the balance WAS. */
    @Column(name = "balance_after", nullable = false)
    private Long balanceAfter;

    @Column(nullable = false, length = 32)
    private String source;

    /** Provider reference (Stripe charge/refund id), when there is one. */
    @Column(name = "external_ref", length = 128)
    private String externalRef;

    /** The entry this one reverses. Set only on corrections. */
    @Column(name = "reverses_id")
    private Long reversesId;

    @Column(name = "adjustment_id")
    private Long adjustmentId;

    /** Derived from the adjustment, so a retried execution can never double-write. */
    @Column(name = "idempotency_key", unique = true, length = 128)
    private String idempotencyKey;

    @Column(length = 255)
    private String memo;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    /** ops_users id, or SYSTEM for provider/subscription-driven entries. */
    @Column(name = "created_by", length = 64)
    private String createdBy;

    /** Entry types. Signs are a property of the type, so callers never have to remember them. */
    public static final String TYPE_CHARGE = "CHARGE";
    public static final String TYPE_REFUND = "REFUND";
    public static final String TYPE_CREDIT = "CREDIT";
    public static final String TYPE_ADJUSTMENT = "ADJUSTMENT";
    public static final String TYPE_DISPUTE_HOLD = "DISPUTE_HOLD";
    public static final String TYPE_DISPUTE_RELEASE = "DISPUTE_RELEASE";
    public static final String TYPE_REVERSAL = "REVERSAL";

    public static final String SOURCE_OPS_ADJUSTMENT = "OPS_ADJUSTMENT";
    public static final String SOURCE_STRIPE = "STRIPE";
    public static final String SOURCE_SUBSCRIPTION = "SUBSCRIPTION";
    public static final String SOURCE_BILLPAY = "BILLPAY";
}
