package com.mywealthmanagement.realestateservice.deal;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.LinkedHashSet;
import java.util.Set;

/**
 * Weekly deal-board roundup. Once a week (Monday 08:15 by default — staggered after the
 * financial digest) it walks every user who is tracking any deal (watchlist or expressed
 * interest) and sends a short "here's your board this week" summary via
 * {@link DealBoardWeeklyNotifier}. notification-service gates delivery on each user's
 * dealBoardWeekly preference, so opted-out users are skipped there.
 *
 * Config:
 *   dealboard.weekly.cron     — schedule (default Monday 08:15)
 *   dealboard.weekly.enabled  — master switch (default true)
 */
@Component
public class DealBoardWeeklyJob {

    private static final Logger log = LoggerFactory.getLogger(DealBoardWeeklyJob.class);

    private final DealWatchRepository watchRepository;
    private final DealInterestRepository interestRepository;
    private final DealBoardWeeklyNotifier notifier;
    private final boolean enabled;

    public DealBoardWeeklyJob(DealWatchRepository watchRepository,
                              DealInterestRepository interestRepository,
                              DealBoardWeeklyNotifier notifier,
                              @Value("${dealboard.weekly.enabled:true}") boolean enabled) {
        this.watchRepository = watchRepository;
        this.interestRepository = interestRepository;
        this.notifier = notifier;
        this.enabled = enabled;
    }

    @Scheduled(cron = "${dealboard.weekly.cron:0 15 8 * * MON}")
    public void sendWeeklyRoundups() {
        if (!enabled) return;

        // Union of everyone with a watchlist and everyone who expressed interest.
        Set<Long> userIds = new LinkedHashSet<>(watchRepository.findDistinctUserIds());
        userIds.addAll(interestRepository.findDistinctInterestedUserIds());
        if (userIds.isEmpty()) return;

        int sent = 0;
        for (Long userId : userIds) {
            String body = roundupBody(
                    watchRepository.countByUserId(userId),
                    interestRepository.countByInterestedUserId(userId));
            if (notifier.send(userId, "Your deal board this week", body)) {
                sent++;
            }
        }
        log.info("deal-board-weekly: dispatched {} of {} candidate roundup(s)", sent, userIds.size());
    }

    /** Human-readable roundup line. Package-private for unit testing. */
    static String roundupBody(long watching, long interests) {
        StringBuilder sb = new StringBuilder("You're tracking ");
        sb.append(count(watching, "saved deal")).append(" on your watchlist");
        if (interests > 0) {
            sb.append(" and have ").append(count(interests, "active interest"));
        }
        sb.append(". Open TerraVest to catch up on this week's updates.");
        return sb.toString();
    }

    /** "1 saved deal" / "3 saved deals" — naive pluralization is fine for these nouns. */
    private static String count(long n, String noun) {
        return n + " " + noun + (n == 1 ? "" : "s");
    }
}
