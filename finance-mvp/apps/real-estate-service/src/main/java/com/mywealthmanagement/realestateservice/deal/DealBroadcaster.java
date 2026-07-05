package com.mywealthmanagement.realestateservice.deal;

import com.mywealthmanagement.realestateservice.comms.AuthUserClient;
import com.mywealthmanagement.realestateservice.comms.NotificationClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Broadcasts a newly-published (OPEN) marketplace deal to every user so they can review it
 * and register their interest. Runs asynchronously so publishing a deal never blocks on the
 * fan-out, and each recipient is gated on their dealAlerts preference by notification-service.
 * Best-effort throughout.
 *
 * Disable with deals.broadcast.enabled=false.
 */
@Component
public class DealBroadcaster {

    private static final Logger log = LoggerFactory.getLogger(DealBroadcaster.class);

    private final AuthUserClient authUserClient;
    private final NotificationClient notificationClient;
    private final boolean enabled;

    public DealBroadcaster(AuthUserClient authUserClient,
                           NotificationClient notificationClient,
                           @Value("${deals.broadcast.enabled:true}") boolean enabled) {
        this.authUserClient = authUserClient;
        this.notificationClient = notificationClient;
        this.enabled = enabled;
    }

    /** Notify every user (except the sponsor) that a new deal is open on the marketplace. */
    @Async
    public void broadcastNewDeal(Long sponsorUserId, String dealTitle, String category) {
        if (!enabled) return;
        List<Long> userIds = authUserClient.allUserIds();
        if (userIds.isEmpty()) return;

        String cat = (category == null || category.isBlank()) ? "" : " (" + prettyCategory(category) + ")";
        String title = "New investment opportunity";
        String body = "\"" + dealTitle + "\" just opened on the TerraVest marketplace" + cat
                + ". Review the deal and register your interest if it's a fit.";

        int sent = 0;
        for (Long userId : userIds) {
            if (sponsorUserId != null && sponsorUserId.equals(userId)) {
                continue; // the sponsor already knows
            }
            notificationClient.notify(userId, "DEAL", title, body, "dealAlerts");
            sent++;
        }
        log.info("deal-broadcast: notified {} user(s) of new deal \"{}\"", sent, dealTitle);
    }

    /** "MULTIFAMILY" -> "Multifamily"; null-safe. */
    private static String prettyCategory(String category) {
        String lower = category.trim().toLowerCase().replace('_', ' ');
        return lower.isEmpty() ? lower : Character.toUpperCase(lower.charAt(0)) + lower.substring(1);
    }
}
