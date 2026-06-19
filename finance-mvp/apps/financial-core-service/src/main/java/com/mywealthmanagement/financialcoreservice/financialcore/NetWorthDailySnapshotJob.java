package com.mywealthmanagement.financialcoreservice.financialcore;

import com.mywealthmanagement.financialcoreservice.config.JwtService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Daily net-worth snapshot. Net-worth history is otherwise captured only lazily when
 * a user opens the dashboard, so the chart has gaps for anyone who's been away (and the
 * weekly-summary email's week-over-week number can compare against a stale point). This
 * job refreshes today's datapoint for every user who already has history, keeping the
 * series continuous.
 *
 * The cross-service calls in {@link FinancialCoreService#computeAndPersistSnapshot} need
 * a user JWT; outside a request we mint a short-lived per-user token (all services share
 * JWT_SECRET) and pass it as the bearer.
 *
 * Runs before the weekly digest (financial-core's WeeklySummaryJob, Mon 08:00) so Monday's
 * summary sees a fresh point. Config:
 *   snapshot.daily.cron     — schedule (default 06:30 daily)
 *   snapshot.daily.enabled  — master switch (default true)
 */
@Component
public class NetWorthDailySnapshotJob {

    private static final Logger log = LoggerFactory.getLogger(NetWorthDailySnapshotJob.class);

    private final NetWorthSnapshotRepository snapshots;
    private final FinancialCoreService financialCoreService;
    private final JwtService jwtService;
    private final boolean enabled;

    public NetWorthDailySnapshotJob(NetWorthSnapshotRepository snapshots,
                                    FinancialCoreService financialCoreService,
                                    JwtService jwtService,
                                    @Value("${snapshot.daily.enabled:true}") boolean enabled) {
        this.snapshots = snapshots;
        this.financialCoreService = financialCoreService;
        this.jwtService = jwtService;
        this.enabled = enabled;
    }

    @Scheduled(cron = "${snapshot.daily.cron:0 30 6 * * *}")
    public void refreshAll() {
        if (!enabled) return;
        List<Long> userIds = snapshots.findDistinctUserIds();
        if (userIds.isEmpty()) return;

        int ok = 0;
        for (Long userId : userIds) {
            try {
                String bearer = "Bearer " + jwtService.generateToken(String.valueOf(userId));
                financialCoreService.refreshDailySnapshot(userId, bearer);
                ok++;
            } catch (Exception e) {
                // Best-effort per user — one failure must not stop the rest.
                log.warn("daily snapshot refresh failed for user {}: {}", userId, e.getMessage());
            }
        }
        log.info("net-worth daily snapshot: refreshed {} of {} user(s)", ok, userIds.size());
    }
}
