package com.mywealthmanagement.realestateservice.holding;

import com.mywealthmanagement.realestateservice.holding.dto.HoldingSummaryDto;
import com.mywealthmanagement.realestateservice.holding.dto.K1YearSummaryDto;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * Weekly nudge on the two things a private co-investor loses money by forgetting.
 *
 * <p><strong>Overdue K-1s.</strong> A form that has not arrived past the filing deadline
 * means an extension, and the sponsor will not chase themselves.
 *
 * <p><strong>Uncalled capital.</strong> Committed money that has not been called yet is a
 * liability the user has already agreed to. Missing the call when it lands means dilution or
 * default, and it is easy to forget how much is still owed across several deals.
 *
 * <p>Silence is the default: a user with nothing outstanding gets nothing. An alert that
 * fires every week regardless is one the user learns to ignore, which would cost them the
 * week it actually mattered.
 *
 * <p>Config:
 *   holdings.alerts.cron    — schedule (default Monday 08:30, staggered after the deal board)
 *   holdings.alerts.enabled — master switch (default true)
 */
@Component
public class HoldingAlertsJob {

    private static final Logger log = LoggerFactory.getLogger(HoldingAlertsJob.class);

    /** Below this, uncalled capital is rounding rather than something to act on. */
    private static final BigDecimal UNCALLED_ALERT_FLOOR = new BigDecimal("1000");

    private final PrivateHoldingRepository holdingRepository;
    private final PrivateHoldingService holdingService;
    private final K1Service k1Service;
    private final HoldingAlertNotifier notifier;
    private final Clock clock;
    private final boolean enabled;

    public HoldingAlertsJob(PrivateHoldingRepository holdingRepository,
                            PrivateHoldingService holdingService,
                            K1Service k1Service,
                            HoldingAlertNotifier notifier,
                            Clock clock,
                            @Value("${holdings.alerts.enabled:true}") boolean enabled) {
        this.holdingRepository = holdingRepository;
        this.holdingService = holdingService;
        this.k1Service = k1Service;
        this.notifier = notifier;
        this.clock = clock;
        this.enabled = enabled;
    }

    @Scheduled(cron = "${holdings.alerts.cron:0 30 8 * * MON}")
    public void sendWeeklyAlerts() {
        if (!enabled) return;

        List<Long> userIds = holdingRepository.findDistinctUserIds();
        if (userIds == null || userIds.isEmpty()) return;

        int sent = 0;
        for (Long userId : userIds) {
            try {
                String body = alertBodyFor(userId);
                if (body != null && notifier.send(userId, "Your private holdings need attention", body)) {
                    sent++;
                }
            } catch (Exception e) {
                // One user's failure must not stop the run for everyone else.
                log.warn("holdings alert failed for user {}: {}", userId, e.getMessage());
            }
        }
        log.info("holdings alerts: {} sent across {} users", sent, userIds.size());
    }

    /**
     * The alert body, or null when this user has nothing worth interrupting them about.
     * Package-private so the behaviour can be tested without scheduling.
     */
    String alertBodyFor(Long userId) {
        List<String> lines = new ArrayList<>();

        int taxYear = LocalDate.now(clock).getYear() - 1;
        K1YearSummaryDto k1s = k1Service.getYearForUser(userId, taxYear);
        if (k1s != null && k1s.getOverdue() > 0) {
            lines.add(k1s.getOverdue() + " Schedule K-1" + (k1s.getOverdue() == 1 ? " is" : "s are")
                    + " still outstanding for " + taxYear + ", past the filing deadline. "
                    + "You may need an extension — chase the sponsor from Fractional LLC.");
        }

        HoldingSummaryDto summary = holdingService.getSummaryForUser(userId);
        if (summary != null && summary.getUncalled() != null
                && summary.getUncalled().compareTo(UNCALLED_ALERT_FLOOR) >= 0) {
            lines.add("You have " + money(summary.getUncalled())
                    + " of committed capital not yet called across your holdings. "
                    + "Keep it available — a capital call you miss can dilute your position.");
        }

        return lines.isEmpty() ? null : String.join("\n\n", lines);
    }

    /** Whole dollars — this is a nudge, not a statement. */
    private static String money(BigDecimal v) {
        return "$" + v.setScale(0, java.math.RoundingMode.HALF_UP).toPlainString();
    }
}
