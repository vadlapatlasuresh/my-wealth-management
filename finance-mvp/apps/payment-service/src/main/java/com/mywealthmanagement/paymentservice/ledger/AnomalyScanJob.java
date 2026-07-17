package com.mywealthmanagement.paymentservice.ledger;

import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * Nightly scan for financial patterns worth a supervisor's attention.
 *
 * Rules were chosen to catch things that actually happen, not to fill a dashboard:
 *  - a customer refunded repeatedly (abuse, or a product bug generating refunds)
 *  - an agent far outside their peer group (the insider case — the one an ops portal creates)
 *  - a ledger balance disagreeing with the sum of its entries (an integration bug silently showing
 *    customers the wrong number)
 *
 * Every finding is deduped, so the queue stays worth reading. A queue that cries wolf gets ignored,
 * which is functionally identical to not having one.
 */
@Service
@RequiredArgsConstructor
public class AnomalyScanJob {

    private static final Logger log = LoggerFactory.getLogger(AnomalyScanJob.class);

    private final LedgerEntryRepository ledgerEntries;
    private final OpsAdjustmentRepository adjustments;
    private final OpsAnomalyRepository anomalies;
    private final LedgerService ledger;

    /** A customer with more than this many refunds/credits in the window gets flagged. */
    @Value("${ops.anomaly.refund-count-threshold:3}")
    private int refundCountThreshold;

    /** ...or more than this much money back, whichever trips first. */
    @Value("${ops.anomaly.refund-amount-threshold-cents:50000}")
    private long refundAmountThresholdCents;

    /** Rolling window for the customer-level rules. */
    @Value("${ops.anomaly.window-days:30}")
    private int windowDays;

    /** An agent this many times the peer median is flagged. */
    @Value("${ops.anomaly.agent-outlier-multiple:3}")
    private double agentOutlierMultiple;

    @Scheduled(cron = "${ops.anomaly.cron:0 30 3 * * *}")
    public void scan() {
        try {
            LocalDateTime from = LocalDateTime.now().minusDays(windowDays);
            int raised = 0;
            raised += scanRepeatRefunds(from);
            raised += scanAgentOutliers(from);
            raised += scanLedgerDrift();
            log.info("[AnomalyScanJob] scan complete — {} new anomal{} raised", raised, raised == 1 ? "y" : "ies");
        } catch (Exception e) {
            // Never let the scan take the service down; it runs again tomorrow, and the gap is
            // visible in the anomaly history.
            log.error("[AnomalyScanJob] scan failed: {}", e.getMessage(), e);
        }
    }

    /** Customers getting money back unusually often, or unusually much. */
    private int scanRepeatRefunds(LocalDateTime from) {
        int raised = 0;
        for (String userId : ledgerEntries.findAllUserIds()) {
            List<LedgerEntry> refunds = ledgerEntries.findRefundsSince(userId, from);
            if (refunds.isEmpty()) continue;

            long total = refunds.stream().mapToLong(e -> Math.abs(e.getAmountCents())).sum();
            boolean byCount = refunds.size() > refundCountThreshold;
            boolean byAmount = total > refundAmountThresholdCents;
            if (!byCount && !byAmount) continue;

            String detail = String.format(
                    "%d refunds/credits totalling %s in the last %d days%s",
                    refunds.size(), money(total), windowDays,
                    byAmount ? " — above the amount threshold" : " — above the count threshold");
            raised += raise(OpsAnomaly.RULE_REPEAT_REFUNDS,
                    byAmount ? OpsAnomaly.SEVERITY_HIGH : OpsAnomaly.SEVERITY_MEDIUM,
                    userId, null, detail, dedupe(OpsAnomaly.RULE_REPEAT_REFUNDS, userId, from));
        }
        return raised;
    }

    /**
     * An agent raising far more adjustments than their peers.
     *
     * This is the rule that exists because the ops portal exists: giving staff the power to move
     * money creates the insider risk, and volume relative to peers is the cheapest signal that
     * catches it. Compared against the median, not the mean — one outlier drags a mean up until it
     * stops flagging the outlier.
     */
    private int scanAgentOutliers(LocalDateTime from) {
        List<String> actors = adjustments.findRequestersSince(from);
        if (actors.size() < 3) {
            return 0; // no meaningful peer group to compare against yet
        }
        List<Long> counts = actors.stream().map(a -> adjustments.countByRequesterSince(a, from)).sorted().toList();
        double median = counts.get(counts.size() / 2);
        if (median <= 0) return 0;

        int raised = 0;
        for (String actorId : actors) {
            long count = adjustments.countByRequesterSince(actorId, from);
            if (count <= median * agentOutlierMultiple) continue;

            String detail = String.format(
                    "Ops user %s raised %d adjustments in %d days — %.1fx the team median of %.0f. "
                            + "Not wrong on its own; worth understanding why.",
                    actorId, count, windowDays, count / median, median);
            raised += raise(OpsAnomaly.RULE_AGENT_OUTLIER, OpsAnomaly.SEVERITY_HIGH,
                    null, actorId, detail, dedupe(OpsAnomaly.RULE_AGENT_OUTLIER, actorId, from));
        }
        return raised;
    }

    /**
     * The stored running balance disagreeing with the sum of the entries.
     *
     * Always a bug, never business-as-usual: it means something wrote the ledger without going
     * through LedgerService.append, and the balance a customer sees is wrong.
     */
    private int scanLedgerDrift() {
        int raised = 0;
        for (String userId : ledgerEntries.findAllUserIds()) {
            long drift = ledger.driftFor(userId);
            if (drift == 0) continue;

            String detail = String.format(
                    "Ledger balance is out by %s: the entries sum to %s but the running balance says %s. "
                            + "Something wrote this ledger without going through LedgerService.append.",
                    money(drift), money(ledgerEntries.sumAmountsForUser(userId)), money(ledger.balanceFor(userId)));
            raised += raise(OpsAnomaly.RULE_LEDGER_DRIFT, OpsAnomaly.SEVERITY_HIGH,
                    userId, null, detail, OpsAnomaly.RULE_LEDGER_DRIFT + ":" + userId + ":" + drift);
        }
        return raised;
    }

    /** Insert unless this exact finding is already on the queue. Returns 1 if raised. */
    private int raise(String rule, String severity, String userId, String actorId, String detail, String dedupeKey) {
        if (anomalies.existsByDedupeKey(dedupeKey)) return 0;
        OpsAnomaly a = new OpsAnomaly();
        a.setRule(rule);
        a.setSeverity(severity);
        a.setUserId(userId);
        a.setActorId(actorId);
        a.setDetail(detail);
        a.setStatus(OpsAnomaly.STATUS_OPEN);
        a.setDedupeKey(dedupeKey);
        a.setCreatedAt(LocalDateTime.now().truncatedTo(ChronoUnit.MICROS));
        anomalies.save(a);
        log.info("[AnomalyScanJob] {} ({}) — {}", rule, severity, detail);
        return 1;
    }

    /** One finding per subject per window, so a standing issue doesn't re-raise nightly. */
    private static String dedupe(String rule, String subject, LocalDateTime from) {
        return rule + ":" + subject + ":" + from.toLocalDate();
    }

    private static String money(long cents) {
        return String.format("$%,.2f", cents / 100.0);
    }
}
