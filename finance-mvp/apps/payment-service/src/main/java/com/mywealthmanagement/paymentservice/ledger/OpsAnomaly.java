package com.mywealthmanagement.paymentservice.ledger;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/** A flagged financial pattern awaiting a supervisor's decision. See {@code AnomalyScanJob}. */
@Entity
@Table(name = "ops_anomalies")
@Data
@NoArgsConstructor
public class OpsAnomaly {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 48)
    private String rule;

    @Column(nullable = false, length = 16)
    private String severity;

    /** The customer involved, when the rule is about one. */
    @Column(name = "user_id", length = 64)
    private String userId;

    /** The ops user involved, for agent-behaviour rules. */
    @Column(name = "actor_id", length = 64)
    private String actorId;

    /** What was found, in words a human can act on — not a metric dump. */
    @Column(nullable = false, columnDefinition = "TEXT")
    private String detail;

    @Column(nullable = false, length = 16)
    private String status = STATUS_OPEN;

    @Column(name = "decided_by", length = 64)
    private String decidedBy;

    @Column(name = "decided_at")
    private LocalDateTime decidedAt;

    @Column(name = "decision_note", columnDefinition = "TEXT")
    private String decisionNote;

    /**
     * Stops the nightly job re-raising the same finding every night. A queue that cries wolf gets
     * ignored, which is functionally the same as not having one.
     */
    @Column(name = "dedupe_key", unique = true, length = 128)
    private String dedupeKey;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public static final String STATUS_OPEN = "OPEN";
    public static final String STATUS_ACCEPTED = "ACCEPTED";
    public static final String STATUS_DISMISSED = "DISMISSED";

    public static final String SEVERITY_LOW = "LOW";
    public static final String SEVERITY_MEDIUM = "MEDIUM";
    public static final String SEVERITY_HIGH = "HIGH";

    // ---- Rules ------------------------------------------------------------------------------
    /** A customer refunded unusually often/much in a rolling window. */
    public static final String RULE_REPEAT_REFUNDS = "REPEAT_REFUNDS";
    /** An agent's adjustment volume far above their peer group — the insider case. */
    public static final String RULE_AGENT_OUTLIER = "AGENT_ADJUSTMENT_OUTLIER";
    /** A customer's ledger balance disagrees with the sum of its entries — an integration bug. */
    public static final String RULE_LEDGER_DRIFT = "LEDGER_DRIFT";
    /** Repeated failed payments then a refund — a card-testing shape. */
    public static final String RULE_FAILED_THEN_REFUND = "FAILED_PAYMENTS_THEN_REFUND";
}
