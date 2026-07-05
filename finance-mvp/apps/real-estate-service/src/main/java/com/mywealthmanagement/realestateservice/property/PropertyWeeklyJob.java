package com.mywealthmanagement.realestateservice.property;

import com.mywealthmanagement.realestateservice.comms.NotificationClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/**
 * Weekly property snapshot. Once a week (Monday 08:45 by default — staggered after the
 * other weekly digests) it walks every user who owns a property and sends a short
 * "portfolio value + equity" summary via {@link NotificationClient}, gated on each user's
 * weeklySummary preference. Best-effort: one user's snapshot never breaks the run for the rest.
 *
 * Config:
 *   property.weekly.cron     — schedule (default Monday 08:45)
 *   property.weekly.enabled  — master switch (default true)
 */
@Component
public class PropertyWeeklyJob {

    private static final Logger log = LoggerFactory.getLogger(PropertyWeeklyJob.class);

    private final PropertyRepository propertyRepository;
    private final NotificationClient notifier;
    private final boolean enabled;

    public PropertyWeeklyJob(PropertyRepository propertyRepository,
                             NotificationClient notifier,
                             @Value("${property.weekly.enabled:true}") boolean enabled) {
        this.propertyRepository = propertyRepository;
        this.notifier = notifier;
        this.enabled = enabled;
    }

    @Scheduled(cron = "${property.weekly.cron:0 45 8 * * MON}")
    public void sendWeeklySnapshots() {
        if (!enabled) return;
        List<Long> userIds = propertyRepository.findDistinctUserIds();
        if (userIds.isEmpty()) return;

        int sent = 0;
        for (Long userId : userIds) {
            List<Property> properties = propertyRepository.findByUserId(userId);
            if (properties.isEmpty()) continue;
            notifier.notify(userId, "PROPERTY", "Your weekly property snapshot",
                    snapshotBody(properties), "weeklySummary");
            sent++;
        }
        log.info("property-weekly: dispatched {} of {} property snapshot(s)", sent, userIds.size());
    }

    /** "You own N properties worth $X, with $Y in equity." Package-private for testing. */
    static String snapshotBody(List<Property> properties) {
        BigDecimal value = BigDecimal.ZERO;
        BigDecimal debt = BigDecimal.ZERO;
        for (Property p : properties) {
            value = value.add(nz(p.getCurrentValue()));
            debt = debt.add(nz(p.getMortgageBalance()));
        }
        BigDecimal equity = value.subtract(debt);
        int n = properties.size();
        String noun = n == 1 ? "property" : "properties";
        return "You own " + n + " " + noun + " worth " + money(value)
                + ", with " + money(equity) + " in equity. Open TerraVest for the full breakdown.";
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    private static String money(BigDecimal v) {
        return "$" + nz(v).setScale(0, RoundingMode.HALF_UP).toPlainString();
    }
}
