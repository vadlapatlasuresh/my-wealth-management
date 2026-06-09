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

/**
 * Server-to-server data purge for account deletion (GDPR/CCPA right-to-delete).
 * Guarded by the shared X-Internal-Key; the auth-service calls this when a user
 * deletes their account so no linked-bank tokens/accounts/transactions remain.
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
