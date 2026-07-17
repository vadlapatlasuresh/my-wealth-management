package com.mywealthmanagement.paymentservice.ledger;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

/**
 * An ops-initiated money movement, as a REQUEST rather than a direct write.
 *
 * <pre>
 *   DRAFT -> PENDING_APPROVAL -> APPROVED -> EXECUTING -> EXECUTED
 *                            \-> REJECTED            \-> FAILED
 * </pre>
 *
 * The maker-checker split is the single highest-value control in the whole financial layer: it is
 * what stops one compromised or malicious agent from moving money on their own. It is enforced in
 * three places on purpose — the permission split (create vs approve), the service check, and a DB
 * CHECK constraint (decided_by &lt;&gt; requested_by) that holds even for a code path that forgets.
 */
@Entity
@Table(name = "ops_adjustments")
@Data
@NoArgsConstructor
public class OpsAdjustment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** The CUSTOMER whose money this moves. */
    @Column(name = "user_id", nullable = false, length = 64)
    private String userId;

    @Column(nullable = false, length = 32)
    private String kind;

    /** Always positive here — the direction is a property of {@link #kind}, not of the caller. */
    @Column(name = "amount_cents", nullable = false)
    private Long amountCents;

    @Column(nullable = false, length = 3)
    private String currency = "USD";

    @Column(name = "reason_code", nullable = false, length = 48)
    private String reasonCode;

    @Column(name = "reason_note", nullable = false, columnDefinition = "TEXT")
    private String reasonNote;

    @Column(name = "ticket_ref", length = 64)
    private String ticketRef;

    @Column(nullable = false, length = 24)
    private String status;

    @Column(name = "requested_by", nullable = false, length = 64)
    private String requestedBy;

    @Column(name = "requested_at", nullable = false)
    private LocalDateTime requestedAt;

    @Column(name = "decided_by", length = 64)
    private String decidedBy;

    @Column(name = "decided_at")
    private LocalDateTime decidedAt;

    @Column(name = "decision_note", columnDefinition = "TEXT")
    private String decisionNote;

    @Column(name = "executed_at")
    private LocalDateTime executedAt;

    @Column(name = "ledger_entry_id")
    private Long ledgerEntryId;

    @Column(name = "failure_reason", columnDefinition = "TEXT")
    private String failureReason;

    // ---- States -----------------------------------------------------------------------------
    public static final String STATUS_PENDING_APPROVAL = "PENDING_APPROVAL";
    public static final String STATUS_APPROVED = "APPROVED";
    public static final String STATUS_REJECTED = "REJECTED";
    public static final String STATUS_EXECUTED = "EXECUTED";
    public static final String STATUS_FAILED = "FAILED";

    // ---- Kinds ------------------------------------------------------------------------------
    /** Money back to a real payment instrument, via the provider. */
    public static final String KIND_REFUND = "REFUND";
    /** Account credit — no provider call; reduces what they owe us. */
    public static final String KIND_CREDIT = "CREDIT";
    /** Goodwill payment: a credit we chose to give, tracked separately so it can be measured. */
    public static final String KIND_GOODWILL = "GOODWILL";
    /**
     * Correcting our own books in the customer's favour. Like every kind here it can only reduce
     * what they owe — there is no ops path that charges a customer. See
     * {@code OpsAdjustmentService.signedAmount}.
     */
    public static final String KIND_MANUAL_ADJUSTMENT = "MANUAL_ADJUSTMENT";
    /** Accepting liability on a dispute rather than contesting it. */
    public static final String KIND_DISPUTE_ACCEPT = "DISPUTE_ACCEPT";

    public static final List<String> KINDS = List.of(
            KIND_REFUND, KIND_CREDIT, KIND_GOODWILL, KIND_MANUAL_ADJUSTMENT, KIND_DISPUTE_ACCEPT);

    /**
     * The reason vocabulary. Fixed, not free text: "how much did we refund for BILLING_ERROR last
     * quarter" is a question that always eventually gets asked, and free text can't answer it.
     * The narrative still goes in reason_note — this is the queryable part, not a replacement.
     */
    public static final List<String> REASON_CODES = List.of(
            "BILLING_ERROR",        // we charged wrongly
            "DUPLICATE_CHARGE",
            "SERVICE_ISSUE",        // outage / degraded service
            "CUSTOMER_GOODWILL",    // discretionary
            "CANCELLATION",         // pro-rata on cancel
            "FRAUD",
            "DISPUTE_RESOLUTION",
            "RECONCILIATION");      // correcting our own books

    /** True once this has reached a state that can never change again. */
    public boolean isTerminal() {
        return STATUS_EXECUTED.equals(status) || STATUS_REJECTED.equals(status) || STATUS_FAILED.equals(status);
    }
}
