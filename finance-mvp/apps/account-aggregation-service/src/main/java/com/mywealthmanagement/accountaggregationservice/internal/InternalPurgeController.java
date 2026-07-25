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

    /**
     * A user's swipeable card/spending accounts (credit + depository), for the household Family
     * feature: a guardian links one of THEIR OWN cards to a child, and only the guardian who owns
     * it can (auth-service passes that same userId). Read-only, server-to-server; never exposes
     * another user's accounts. Returns id/name/mask/type so the picker is meaningful.
     */
    @GetMapping("/{userId}/cards")
    public ResponseEntity<Map<String, Object>> cards(@PathVariable Long userId,
                                                     @RequestHeader(value = "X-Internal-Key", required = false) String key) {
        requireInternal(key);
        java.util.List<Map<String, Object>> cards = accountRepository.findByUserId(userId).stream()
                .filter(a -> {
                    String t = a.getType() == null ? "" : a.getType().toLowerCase();
                    return t.contains("credit") || t.contains("depository");
                })
                .map(a -> {
                    Map<String, Object> m = new java.util.LinkedHashMap<>();
                    m.put("accountId", a.getId());
                    m.put("name", a.getName());
                    m.put("officialName", a.getOfficialName());
                    m.put("mask", a.getMask());
                    m.put("type", a.getType());
                    m.put("subtype", a.getSubtype());
                    return m;
                })
                .toList();
        return ResponseEntity.ok(Map.of("cards", cards));
    }

    /**
     * A user's SPEND transactions (outflow) on the given accounts within a date range, for the
     * household Family feature's sync. auth-service passes the guardian's own userId + the accounts
     * they linked, so this only ever reads that guardian's data. In this system outflow is stored
     * as a negative amount (see monthlySpend); we return those as positive {@code spent} figures so
     * the caller doesn't have to know the sign convention. Newest transactions are the point, so
     * only real spend rows come back (income/refunds are excluded).
     */
    @GetMapping("/{userId}/transactions")
    public ResponseEntity<Map<String, Object>> transactions(
            @PathVariable Long userId,
            @RequestParam("accountIds") java.util.List<Long> accountIds,
            @RequestParam("from") String from,
            @RequestParam("to") String to,
            @RequestHeader(value = "X-Internal-Key", required = false) String key) {
        requireInternal(key);
        java.time.LocalDate start, end;
        try {
            start = java.time.LocalDate.parse(from);
            end = java.time.LocalDate.parse(to);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "from and to must be YYYY-MM-DD");
        }
        java.util.Set<Long> ids = new java.util.HashSet<>(accountIds);
        java.util.List<Map<String, Object>> txns = transactionRepository
                .findByUserIdAndDateBetween(userId, start, end).stream()
                .filter(t -> ids.contains(t.getAccountId()))
                .filter(t -> t.getAmount() != null && t.getAmount().signum() < 0) // outflow only
                .map(t -> {
                    Map<String, Object> m = new java.util.LinkedHashMap<>();
                    m.put("externalId", t.getPlaidTransactionId());
                    m.put("accountId", t.getAccountId());
                    m.put("name", t.getName());
                    m.put("merchantName", t.getMerchantName());
                    m.put("category", t.getCategory());
                    m.put("spent", t.getAmount().abs());
                    m.put("date", t.getDate());
                    return m;
                })
                .toList();
        return ResponseEntity.ok(Map.of("transactions", txns));
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
