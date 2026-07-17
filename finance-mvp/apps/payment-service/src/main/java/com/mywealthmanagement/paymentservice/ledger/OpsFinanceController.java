package com.mywealthmanagement.paymentservice.ledger;

import com.mywealthmanagement.paymentservice.audit.AuditClient;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * The financial ops surface: a customer's money history, adjustments, the approval queue and the
 * anomaly queue.
 *
 * Every route is permission-gated (@PreAuthorize) and reachable only with a typ=ops token — the
 * JwtAuthFilter refuses a member token on this path and an ops token off it. Which roles hold which
 * permission is DB state (ops_role_permissions), not a decision baked in here.
 */
@RestController
@RequestMapping("/api/v1/payments/ops")
@RequiredArgsConstructor
public class OpsFinanceController {

    private final LedgerService ledger;
    private final OpsAdjustmentService adjustmentService;
    private final OpsAnomalyRepository anomalies;
    private final AuditClient auditClient;

    // ---- A customer's money -------------------------------------------------------------------

    /**
     * The full money history for one customer, plus the current balance.
     *
     * Reading it is itself recorded: seeing what someone was charged is an access worth a trail,
     * even though it changes nothing.
     */
    @PreAuthorize("hasAuthority('finance.ledger.view')")
    @GetMapping("/customers/{userId}/ledger")
    public Map<String, Object> customerLedger(@PathVariable String userId) {
        List<LedgerEntry> entries = ledger.historyFor(userId);
        auditClient.recordOps(actor(), "ops.ledger.view", "SUCCESS", userId, null, null, null);

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("userId", userId);
        m.put("balanceCents", ledger.balanceFor(userId));
        m.put("currency", entries.isEmpty() ? "USD" : entries.get(0).getCurrency());
        m.put("entries", entries.stream().map(OpsFinanceController::entryDto).toList());
        m.put("adjustments", adjustmentService.forUser(userId).stream()
                .map(OpsFinanceController::adjustmentDto).toList());
        return m;
    }

    // ---- Adjustments ---------------------------------------------------------------------------

    /** What can be proposed, and the threshold above which it needs a second approver. */
    @PreAuthorize("hasAuthority('finance.adjustment.create')")
    @GetMapping("/adjustments/options")
    public Map<String, Object> options() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("kinds", OpsAdjustment.KINDS);
        m.put("reasonCodes", OpsAdjustment.REASON_CODES);
        m.put("autoApproveBelowCents", adjustmentService.autoApproveBelowCents());
        return m;
    }

    /**
     * Propose a money movement. Below the threshold it executes immediately; at or above it enters
     * the approval queue and waits for someone else.
     */
    @PreAuthorize("hasAuthority('finance.adjustment.create')")
    @PostMapping("/adjustments")
    public Map<String, Object> propose(@RequestBody Map<String, Object> body) {
        String userId = str(body.get("userId"));
        String kind = str(body.get("kind"));
        String reasonCode = str(body.get("reasonCode"));
        String reasonNote = str(body.get("reasonNote"));
        String ticketRef = str(body.get("ticketRef"));
        long amountCents = asLong(body.get("amountCents"));

        if (!StringUtils.hasText(userId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "userId is required");
        }
        return adjustmentDto(adjustmentService.propose(
                actor(), userId, kind, amountCents, reasonCode, reasonNote, ticketRef));
    }

    /**
     * The approval queue — everything waiting on a second pair of eyes.
     *
     * Carries the requester's recent volume alongside each item, deliberately. An approver deciding
     * on the amount alone is a rubber stamp; knowing this is the requester's 40th refund this month
     * is what makes the second pair of eyes worth having.
     */
    @PreAuthorize("hasAuthority('finance.adjustment.approve')")
    @GetMapping("/adjustments/queue")
    public List<Map<String, Object>> queue() {
        return adjustmentService.pendingQueue().stream().map(a -> {
            Map<String, Object> m = new LinkedHashMap<>(adjustmentDto(a));
            m.put("customerBalanceCents", ledger.balanceFor(a.getUserId()));
            m.put("customerAdjustmentCount", adjustmentService.forUser(a.getUserId()).size());
            return m;
        }).toList();
    }

    @PreAuthorize("hasAuthority('finance.adjustment.approve')")
    @PostMapping("/adjustments/{id}/approve")
    public Map<String, Object> approve(@PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
        String note = body == null ? null : str(body.get("decisionNote"));
        return adjustmentDto(adjustmentService.approve(actor(), id, note));
    }

    @PreAuthorize("hasAuthority('finance.adjustment.approve')")
    @PostMapping("/adjustments/{id}/reject")
    public Map<String, Object> reject(@PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
        String note = body == null ? null : str(body.get("decisionNote"));
        return adjustmentDto(adjustmentService.reject(actor(), id, note));
    }

    // ---- Anomalies -----------------------------------------------------------------------------

    @PreAuthorize("hasAuthority('finance.anomaly.review')")
    @GetMapping("/anomalies")
    public List<Map<String, Object>> openAnomalies() {
        return anomalies.findByStatusOrderByCreatedAtDesc(OpsAnomaly.STATUS_OPEN).stream()
                .map(OpsFinanceController::anomalyDto).toList();
    }

    /**
     * Accept or dismiss a flagged anomaly. The decision is audited either way — "a supervisor
     * looked and said it was fine" is exactly as important to record as the flag itself.
     */
    @PreAuthorize("hasAuthority('finance.anomaly.review')")
    @PostMapping("/anomalies/{id}/decide")
    public Map<String, Object> decideAnomaly(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        OpsAnomaly a = anomalies.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Anomaly not found"));
        if (!OpsAnomaly.STATUS_OPEN.equals(a.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This anomaly is already " + a.getStatus());
        }
        String decision = str(body.get("decision"));
        String note = str(body.get("decisionNote"));
        if (!OpsAnomaly.STATUS_ACCEPTED.equals(decision) && !OpsAnomaly.STATUS_DISMISSED.equals(decision)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "decision must be ACCEPTED or DISMISSED");
        }
        if (!StringUtils.hasText(note)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "A note is required — a dismissal nobody can explain later is not a decision.");
        }

        a.setStatus(decision);
        a.setDecidedBy(actor());
        a.setDecidedAt(LocalDateTime.now().truncatedTo(ChronoUnit.MICROS));
        a.setDecisionNote(note);
        anomalies.save(a);

        auditClient.recordOps(actor(), "ops.anomaly." + decision.toLowerCase(), "SUCCESS",
                a.getUserId(), note, null, null);
        return anomalyDto(a);
    }

    // ---- mapping -------------------------------------------------------------------------------

    private static Map<String, Object> entryDto(LedgerEntry e) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", e.getId());
        m.put("entryType", e.getEntryType());
        m.put("amountCents", e.getAmountCents());
        m.put("currency", e.getCurrency());
        m.put("balanceAfterCents", e.getBalanceAfter());
        m.put("source", e.getSource());
        m.put("externalRef", e.getExternalRef());
        m.put("reversesId", e.getReversesId());
        m.put("adjustmentId", e.getAdjustmentId());
        m.put("memo", e.getMemo());
        m.put("createdAt", e.getCreatedAt());
        m.put("createdBy", e.getCreatedBy());
        return m;
    }

    private static Map<String, Object> adjustmentDto(OpsAdjustment a) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", a.getId());
        m.put("userId", a.getUserId());
        m.put("kind", a.getKind());
        m.put("amountCents", a.getAmountCents());
        m.put("currency", a.getCurrency());
        m.put("reasonCode", a.getReasonCode());
        m.put("reasonNote", a.getReasonNote());
        m.put("ticketRef", a.getTicketRef());
        m.put("status", a.getStatus());
        m.put("requestedBy", a.getRequestedBy());
        m.put("requestedAt", a.getRequestedAt());
        m.put("decidedBy", a.getDecidedBy());
        m.put("decidedAt", a.getDecidedAt());
        m.put("decisionNote", a.getDecisionNote());
        m.put("executedAt", a.getExecutedAt());
        m.put("ledgerEntryId", a.getLedgerEntryId());
        m.put("failureReason", a.getFailureReason());
        return m;
    }

    private static Map<String, Object> anomalyDto(OpsAnomaly a) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", a.getId());
        m.put("rule", a.getRule());
        m.put("severity", a.getSeverity());
        m.put("userId", a.getUserId());
        m.put("actorId", a.getActorId());
        m.put("detail", a.getDetail());
        m.put("status", a.getStatus());
        m.put("decidedBy", a.getDecidedBy());
        m.put("decidedAt", a.getDecidedAt());
        m.put("decisionNote", a.getDecisionNote());
        m.put("createdAt", a.getCreatedAt());
        return m;
    }

    /** The acting ops user (subject of the typ=ops token). */
    private static String actor() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        return auth == null ? null : auth.getName();
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o).trim();
    }

    private static long asLong(Object o) {
        if (o instanceof Number n) return n.longValue();
        try {
            return Long.parseLong(String.valueOf(o));
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "amountCents must be a whole number of cents");
        }
    }
}
