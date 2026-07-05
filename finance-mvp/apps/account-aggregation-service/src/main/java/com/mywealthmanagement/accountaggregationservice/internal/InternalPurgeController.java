package com.mywealthmanagement.accountaggregationservice.internal;

import com.mywealthmanagement.accountaggregationservice.account.AccountRepository;
import com.mywealthmanagement.accountaggregationservice.plaid.PlaidItemRepository;
import com.mywealthmanagement.accountaggregationservice.transaction.TransactionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

/**
 * Server-to-server data purge for account deletion (GDPR/CCPA right-to-delete).
 * Guarded by the shared X-Internal-Key; the auth-service calls this when a user
 * deletes their account so no linked-bank tokens/accounts/transactions remain.
 * Also serves the read-only data export (GDPR right-to-access) for the same data.
 */
@RestController
@RequestMapping("/internal/users")
@RequiredArgsConstructor
public class InternalPurgeController {

    private final AccountRepository accountRepository;
    private final PlaidItemRepository plaidItemRepository;
    private final TransactionRepository transactionRepository;

    @Value("${internal.key:${audit.ingest.key:dev-internal-audit-key}}")
    private String internalKey;

    private void requireInternal(String key) {
        if (StringUtils.hasText(internalKey) && !internalKey.equals(key)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid internal key");
        }
    }

    /**
     * Total expense spend for a user in a calendar month (YYYY-MM). Sums the absolute value
     * of outflow (negative-amount) transactions. Powers the weekly budget email in
     * financial-core, which has no per-user token in its scheduled job. Server-to-server only.
     */
    @GetMapping("/{userId}/spend")
    public ResponseEntity<Map<String, Object>> monthlySpend(
            @PathVariable Long userId,
            @RequestParam("month") String month,
            @RequestHeader(value = "X-Internal-Key", required = false) String key) {
        requireInternal(key);
        java.time.LocalDate start;
        try {
            start = java.time.LocalDate.parse(month + "-01");
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "month must be YYYY-MM");
        }
        java.time.LocalDate end = start.plusMonths(1).minusDays(1);
        java.math.BigDecimal spent = transactionRepository
                .findByUserIdAndDateBetween(userId, start, end).stream()
                .map(t -> t.getAmount())
                .filter(a -> a != null && a.signum() < 0)
                .map(java.math.BigDecimal::abs)
                .reduce(java.math.BigDecimal.ZERO, java.math.BigDecimal::add);
        return ResponseEntity.ok(Map.of("month", month, "spent", spent));
    }

    /** GDPR data export: this service's data for the user (encrypted Plaid tokens excluded). */
    @GetMapping("/{userId}/export")
    public ResponseEntity<Map<String, Object>> export(@PathVariable Long userId,
                                                      @RequestHeader(value = "X-Internal-Key", required = false) String key) {
        requireInternal(key);
        return ResponseEntity.ok(Map.of(
                "accounts", accountRepository.findByUserId(userId),
                "transactions", transactionRepository.findByUserId(userId)));
    }

    @DeleteMapping("/{userId}")
    @Transactional
    public ResponseEntity<Void> purge(@PathVariable Long userId,
                                      @RequestHeader(value = "X-Internal-Key", required = false) String key) {
        if (StringUtils.hasText(internalKey) && !internalKey.equals(key)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid internal key");
        }
        transactionRepository.deleteByUserId(userId); // children first
        accountRepository.deleteByUserId(userId);
        plaidItemRepository.deleteByUserId(userId);    // includes encrypted access tokens
        return ResponseEntity.noContent().build();
    }
}
