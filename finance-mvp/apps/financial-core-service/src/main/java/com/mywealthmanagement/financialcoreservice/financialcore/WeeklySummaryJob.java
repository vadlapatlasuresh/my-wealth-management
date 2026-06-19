package com.mywealthmanagement.financialcoreservice.financialcore;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.NumberFormat;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;

/**
 * Weekly net-worth digest. Once a week (Monday 08:00 by default) it walks every
 * user with net-worth history and sends a short "where you stand + how it changed
 * this week" summary via {@link WeeklySummaryNotifier}. notification-service gates
 * delivery on each user's weeklySummary preference, so opted-out users are skipped
 * there.
 *
 * Config:
 *   summary.weekly.cron     — schedule (default Monday 08:00)
 *   summary.weekly.enabled  — master switch (default true)
 */
@Component
public class WeeklySummaryJob {

    private static final Logger log = LoggerFactory.getLogger(WeeklySummaryJob.class);

    private final NetWorthSnapshotRepository snapshots;
    private final WeeklySummaryNotifier notifier;
    private final boolean enabled;

    public WeeklySummaryJob(NetWorthSnapshotRepository snapshots,
                            WeeklySummaryNotifier notifier,
                            @Value("${summary.weekly.enabled:true}") boolean enabled) {
        this.snapshots = snapshots;
        this.notifier = notifier;
        this.enabled = enabled;
    }

    @Scheduled(cron = "${summary.weekly.cron:0 0 8 * * MON}")
    public void sendWeeklySummaries() {
        if (!enabled) return;
        LocalDate today = LocalDate.now();
        List<Long> userIds = snapshots.findDistinctUserIds();
        if (userIds.isEmpty()) return;

        int sent = 0;
        for (Long userId : userIds) {
            NetWorthSnapshot latest = snapshots
                    .findFirstByUserIdAndSnapshotDateLessThanEqualOrderBySnapshotDateDesc(userId, today)
                    .orElse(null);
            if (latest == null) continue;

            NetWorthSnapshot weekAgo = snapshots
                    .findFirstByUserIdAndSnapshotDateLessThanEqualOrderBySnapshotDateDesc(userId, today.minusDays(7))
                    .orElse(null);

            if (notifier.send(userId, "Your weekly summary is ready", digestBody(latest, weekAgo))) {
                sent++;
            }
        }
        log.info("weekly-summary: dispatched {} of {} candidate digest(s)", sent, userIds.size());
    }

    /** Human-readable digest line: current net worth + week-over-week change.
     *  Package-private for unit testing. */
    static String digestBody(NetWorthSnapshot latest, NetWorthSnapshot weekAgo) {
        BigDecimal total = nz(latest.getTotal());
        StringBuilder sb = new StringBuilder("Your net worth is ").append(money(total)).append(".");

        if (weekAgo != null && weekAgo.getId() != null && !weekAgo.getId().equals(latest.getId())) {
            BigDecimal prev = nz(weekAgo.getTotal());
            BigDecimal delta = total.subtract(prev);
            int cmp = delta.signum();
            String dir = cmp > 0 ? "up" : cmp < 0 ? "down" : "flat";
            sb.append(" That's ").append(dir);
            if (cmp != 0) {
                sb.append(' ').append(money(delta.abs()));
                if (prev.signum() != 0) {
                    BigDecimal pct = delta.abs()
                            .multiply(BigDecimal.valueOf(100))
                            .divide(prev.abs(), 1, RoundingMode.HALF_UP);
                    sb.append(" (").append(pct).append("%)");
                }
            }
            sb.append(" this week.");
        }
        sb.append(" Open TerraVest to see the full breakdown.");
        return sb.toString();
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    private static String money(BigDecimal v) {
        NumberFormat f = NumberFormat.getCurrencyInstance(Locale.US);
        f.setMaximumFractionDigits(0);
        return f.format(v);
    }
}
