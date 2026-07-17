package com.mywealthmanagement.paymentservice.ledger;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mywealthmanagement.paymentservice.audit.AuditClient;
import com.mywealthmanagement.paymentservice.payment.provider.RefundProvider;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;

/**
 * The maker-checker engine for ops-initiated money movements.
 *
 * Nothing here writes to the ledger directly. A request is proposed, approved by someone else, and
 * only then executed — and every transition is audited against the ops user who caused it.
 *
 * The four-eyes rule is enforced three times over, and that redundancy is deliberate:
 *   1. permissions — finance.adjustment.create and .approve are different keys on different roles
 *   2. this service — an explicit check that the approver is not the requester
 *   3. the database — CHECK (decided_by <> requested_by), which holds even if 1 and 2 are bypassed
 *      by a future refactor, a forgotten code path, or a hand-written UPDATE
 */
@Service
@RequiredArgsConstructor
public class OpsAdjustmentService {

    private static final Logger log = LoggerFactory.getLogger(OpsAdjustmentService.class);
    private static final ObjectMapper JSON = new ObjectMapper();

    /** Fallback if the DB config row is missing/garbage. $25 — same as the seeded default. */
    private static final long DEFAULT_AUTO_APPROVE_BELOW_CENTS = 2500L;

    private final OpsAdjustmentRepository adjustments;
    private final LedgerService ledger;
    private final OpsFinanceConfigRepository config;
    private final RefundProvider refundProvider;
    private final AuditClient auditClient;

    /**
     * Propose a money movement.
     *
     * Small amounts execute immediately; at or above the threshold it waits for a second pair of
     * eyes. Requiring approval for EVERYTHING sounds safer but isn't — it gets routed around by
     * busy agents, and a control everyone works around is worse than a threshold everyone respects.
     */
    @Transactional
    public OpsAdjustment propose(String actorId, String userId, String kind, long amountCents,
                                 String reasonCode, String reasonNote, String ticketRef) {
        validate(kind, amountCents, reasonCode, reasonNote);

        OpsAdjustment a = new OpsAdjustment();
        a.setUserId(userId);
        a.setKind(kind);
        a.setAmountCents(amountCents);
        a.setReasonCode(reasonCode);
        a.setReasonNote(reasonNote.trim());
        a.setTicketRef(ticketRef);
        a.setRequestedBy(actorId);
        a.setRequestedAt(LocalDateTime.now().truncatedTo(ChronoUnit.MICROS));
        a.setStatus(OpsAdjustment.STATUS_PENDING_APPROVAL);
        OpsAdjustment saved = adjustments.save(a);

        auditClient.recordOps(actorId, "ops.adjustment.propose", "SUCCESS", userId,
                reasonCode + ": " + reasonNote.trim(), null, json(summary(saved)));

        if (amountCents < autoApproveBelowCents()) {
            // Below the bar: no second approver, but still a full audit trail and a real ledger
            // entry. "Auto-approved" means unattended, not unrecorded.
            saved.setDecidedBy("AUTO");
            saved.setDecidedAt(LocalDateTime.now().truncatedTo(ChronoUnit.MICROS));
            saved.setDecisionNote("Auto-approved: below the " + autoApproveBelowCents() + " cent threshold");
            saved.setStatus(OpsAdjustment.STATUS_APPROVED);
            adjustments.save(saved);
            auditClient.recordOps(actorId, "ops.adjustment.auto_approve", "SUCCESS", userId,
                    "below threshold", null, json(summary(saved)));
            return execute(saved, actorId);
        }
        return saved;
    }

    /**
     * Approve someone else's proposal and execute it.
     *
     * @throws ResponseStatusException 409 if the approver is the requester — the whole point
     */
    @Transactional
    public OpsAdjustment approve(String actorId, Long id, String decisionNote) {
        OpsAdjustment a = require(id);
        requirePending(a);

        if (actorId != null && actorId.equals(a.getRequestedBy())) {
            // The DB would refuse this too. Failing here just makes the reason legible.
            auditClient.recordOps(actorId, "ops.adjustment.approve", "DENIED", a.getUserId(),
                    "self-approval attempt", null, null);
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "You cannot approve your own adjustment. It needs a second pair of eyes.");
        }

        String before = json(summary(a));
        a.setDecidedBy(actorId);
        a.setDecidedAt(LocalDateTime.now().truncatedTo(ChronoUnit.MICROS));
        a.setDecisionNote(decisionNote);
        a.setStatus(OpsAdjustment.STATUS_APPROVED);
        adjustments.save(a);

        auditClient.recordOps(actorId, "ops.adjustment.approve", "SUCCESS", a.getUserId(),
                decisionNote, before, json(summary(a)));
        return execute(a, actorId);
    }

    /** Reject a proposal. Terminal — a rejected adjustment is re-proposed, never revived. */
    @Transactional
    public OpsAdjustment reject(String actorId, Long id, String decisionNote) {
        OpsAdjustment a = require(id);
        requirePending(a);
        if (actorId != null && actorId.equals(a.getRequestedBy())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "You cannot decide your own adjustment.");
        }
        if (!StringUtils.hasText(decisionNote)) {
            // A rejection without a reason is unhelpful to the requester and useless in a review.
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "A decision note is required when rejecting.");
        }

        String before = json(summary(a));
        a.setDecidedBy(actorId);
        a.setDecidedAt(LocalDateTime.now().truncatedTo(ChronoUnit.MICROS));
        a.setDecisionNote(decisionNote);
        a.setStatus(OpsAdjustment.STATUS_REJECTED);
        adjustments.save(a);

        auditClient.recordOps(actorId, "ops.adjustment.reject", "SUCCESS", a.getUserId(),
                decisionNote, before, json(summary(a)));
        return a;
    }

    /**
     * Execute an approved adjustment: move the money (if it leaves our books), then write the
     * ledger entry.
     *
     * Idempotent on a key derived from the adjustment id, at BOTH layers — the provider dedupes on
     * the same key, and the ledger refuses a second entry for it. So a retry after a timeout is
     * safe, which matters because timeouts are exactly when someone retries.
     *
     * Private and deliberately un-@Transactional: it is only ever reached from propose/approve,
     * which already carry the transaction. Annotating a self-invoked method would suggest a
     * proxy boundary that isn't there.
     */
    private OpsAdjustment execute(OpsAdjustment a, String actorId) {
        String idempotencyKey = "adj-" + a.getId();
        try {
            String externalRef = null;
            if (OpsAdjustment.KIND_REFUND.equals(a.getKind())) {
                // Only a refund reaches outside our books; credits/goodwill are internal.
                String chargeRef = ledger.latestChargeRef(a.getUserId());
                externalRef = refundProvider.refund(chargeRef, a.getAmountCents(), a.getCurrency(), idempotencyKey);
            }

            LedgerEntry entry = new LedgerEntry();
            entry.setUserId(a.getUserId());
            entry.setEntryType(entryTypeFor(a.getKind()));
            entry.setAmountCents(signedAmount(a));
            entry.setCurrency(a.getCurrency());
            entry.setSource(LedgerEntry.SOURCE_OPS_ADJUSTMENT);
            entry.setExternalRef(externalRef);
            entry.setAdjustmentId(a.getId());
            entry.setIdempotencyKey(idempotencyKey);
            entry.setMemo(a.getReasonCode() + ": " + a.getReasonNote());
            entry.setCreatedBy(actorId);
            LedgerEntry saved = ledger.append(entry);

            a.setLedgerEntryId(saved.getId());
            a.setExecutedAt(LocalDateTime.now().truncatedTo(ChronoUnit.MICROS));
            a.setStatus(OpsAdjustment.STATUS_EXECUTED);
            adjustments.save(a);

            auditClient.recordOps(actorId, "ops.adjustment.execute", "SUCCESS", a.getUserId(),
                    a.getReasonCode(), null,
                    json(Map.of("adjustmentId", a.getId(), "ledgerEntryId", saved.getId(),
                            "amountCents", saved.getAmountCents(), "balanceAfter", saved.getBalanceAfter(),
                            "externalRef", externalRef == null ? "" : externalRef)));
            return a;

        } catch (Exception e) {
            // FAILED, loudly and permanently — never a silent pass. An adjustment that looks
            // executed while the money never moved is the worst outcome available here: the
            // customer is out of pocket and our own records agree that they aren't.
            log.error("[OpsAdjustmentService] adjustment {} failed to execute: {}", a.getId(), e.getMessage(), e);
            a.setStatus(OpsAdjustment.STATUS_FAILED);
            a.setFailureReason(e.getMessage());
            adjustments.save(a);
            auditClient.recordOps(actorId, "ops.adjustment.execute", "FAILURE", a.getUserId(),
                    a.getReasonCode(), null, json(Map.of("adjustmentId", a.getId(),
                            "error", String.valueOf(e.getMessage()))));
            return a;
        }
    }

    // ---- queries ----------------------------------------------------------------------------

    public List<OpsAdjustment> pendingQueue() {
        return adjustments.findByStatusOrderByRequestedAtAsc(OpsAdjustment.STATUS_PENDING_APPROVAL);
    }

    public List<OpsAdjustment> forUser(String userId) {
        return adjustments.findByUserIdOrderByRequestedAtDesc(userId);
    }

    public long autoApproveBelowCents() {
        return config.findById(OpsFinanceConfig.KEY_AUTO_APPROVE_BELOW_CENTS)
                .map(c -> {
                    try {
                        return Long.parseLong(c.getConfigValue());
                    } catch (NumberFormatException e) {
                        log.warn("[OpsAdjustmentService] {} is not a number ('{}') — falling back to {}",
                                OpsFinanceConfig.KEY_AUTO_APPROVE_BELOW_CENTS, c.getConfigValue(),
                                DEFAULT_AUTO_APPROVE_BELOW_CENTS);
                        return DEFAULT_AUTO_APPROVE_BELOW_CENTS;
                    }
                })
                .orElse(DEFAULT_AUTO_APPROVE_BELOW_CENTS);
    }

    // ---- helpers ----------------------------------------------------------------------------

    private void validate(String kind, long amountCents, String reasonCode, String reasonNote) {
        if (!OpsAdjustment.KINDS.contains(kind)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown adjustment kind: " + kind);
        }
        if (amountCents <= 0) {
            // Direction is a property of the kind, not of the sign the caller passes. Accepting a
            // negative here would let a "refund" quietly charge someone.
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Amount must be positive — the direction comes from the adjustment kind.");
        }
        if (!OpsAdjustment.REASON_CODES.contains(reasonCode)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Unknown reason code: " + reasonCode + ". Expected one of " + OpsAdjustment.REASON_CODES);
        }
        if (!StringUtils.hasText(reasonNote) || reasonNote.trim().length() < 8) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "A reason note of at least 8 characters is required — a reason nobody can "
                            + "understand later is the same as no reason.");
        }
    }

    private OpsAdjustment require(Long id) {
        return adjustments.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Adjustment not found"));
    }

    private static void requirePending(OpsAdjustment a) {
        if (!OpsAdjustment.STATUS_PENDING_APPROVAL.equals(a.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This adjustment is " + a.getStatus() + " and can no longer be decided.");
        }
    }

    private static String entryTypeFor(String kind) {
        return switch (kind) {
            case OpsAdjustment.KIND_REFUND -> LedgerEntry.TYPE_REFUND;
            case OpsAdjustment.KIND_CREDIT, OpsAdjustment.KIND_GOODWILL -> LedgerEntry.TYPE_CREDIT;
            case OpsAdjustment.KIND_DISPUTE_ACCEPT -> LedgerEntry.TYPE_DISPUTE_HOLD;
            default -> LedgerEntry.TYPE_ADJUSTMENT;
        };
    }

    /**
     * Ledger sign, derived from the kind so no caller has to reason about it.
     *
     * ALWAYS NEGATIVE — every ops adjustment moves money in the customer's favour. There is
     * deliberately no ops path that charges a customer: "give money back" and "take money" are
     * wildly different powers, and only the first one belongs on a support console. Correcting our
     * books in the other direction is a finance-system job with its own controls, not a button an
     * agent has during a phone call.
     */
    private static long signedAmount(OpsAdjustment a) {
        return -Math.abs(a.getAmountCents());
    }

    private static Map<String, Object> summary(OpsAdjustment a) {
        return Map.of(
                "id", a.getId(),
                "userId", a.getUserId(),
                "kind", a.getKind(),
                "amountCents", a.getAmountCents(),
                "reasonCode", a.getReasonCode(),
                "status", a.getStatus(),
                "requestedBy", a.getRequestedBy(),
                "decidedBy", a.getDecidedBy() == null ? "" : a.getDecidedBy());
    }

    private static String json(Object o) {
        try {
            return JSON.writeValueAsString(o);
        } catch (Exception e) {
            return String.valueOf(o);
        }
    }
}
