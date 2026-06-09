package com.mywealthmanagement.accountaggregationservice.plaid;

import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Keeps linked-account transactions fresh without relying on the Plaid webhook
 * (which can't reach a dev host). Periodically runs the cursor-based
 * /transactions/sync for every linked item. Uses stored access tokens, so it needs
 * no user request context. Interval is configurable (default 30 min).
 */
@Component
@RequiredArgsConstructor
public class TransactionSyncScheduler {

    private static final Logger log = LoggerFactory.getLogger(TransactionSyncScheduler.class);

    private final PlaidItemRepository plaidItemRepository;
    private final PlaidService plaidService;

    @Scheduled(
            initialDelayString = "${plaid.sync.initial-delay-ms:120000}",
            fixedDelayString = "${plaid.sync.interval-ms:1800000}")
    public void syncAllUsers() {
        var userIds = plaidItemRepository.findAll().stream()
                .map(PlaidItem::getUserId)
                .distinct()
                .toList();
        if (userIds.isEmpty()) return;
        int total = 0;
        for (Long userId : userIds) {
            try {
                total += plaidService.syncTransactions(userId);
            } catch (Exception e) {
                log.warn("scheduled transaction sync failed for user {}: {}", userId, e.getMessage());
            }
        }
        log.info("Scheduled transaction sync complete: {} user(s), {} transaction(s) changed", userIds.size(), total);
    }
}
