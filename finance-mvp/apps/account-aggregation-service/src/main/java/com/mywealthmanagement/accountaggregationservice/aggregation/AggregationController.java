package com.mywealthmanagement.accountaggregationservice.aggregation;

import com.mywealthmanagement.accountaggregationservice.account.AccountService;
import com.mywealthmanagement.accountaggregationservice.account.dto.AccountDto;
import com.mywealthmanagement.accountaggregationservice.plaid.PlaidService;
import com.mywealthmanagement.accountaggregationservice.plaid.dto.LinkTokenRequest;
import com.mywealthmanagement.accountaggregationservice.plaid.dto.PublicTokenExchangeRequest;
import com.mywealthmanagement.accountaggregationservice.config.JwtService;
import com.mywealthmanagement.accountaggregationservice.security.PlaidWebhookVerifier;
import com.mywealthmanagement.accountaggregationservice.transaction.TransactionService;
import com.mywealthmanagement.accountaggregationservice.transaction.dto.TransactionDto;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.util.Collections;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/aggregation")
@RequiredArgsConstructor
public class AggregationController {

    private static final Logger log = LoggerFactory.getLogger(AggregationController.class);

    private final PlaidService plaidService;
    private final AccountService accountService;
    private final TransactionService transactionService;
    private final com.mywealthmanagement.accountaggregationservice.transaction.CategoryRuleService categoryRuleService;
    private final PlaidWebhookVerifier plaidWebhookVerifier;
    private final JwtService jwtService;

    /**
     * Authorize a customer-care read: the caller must carry a CARE/ADMIN role in their JWT.
     * Read-only support endpoints reuse this so an agent can view (not change) a member's data.
     * The access itself is audited by the gateway (actor + path + status).
     */
    private void requireSupportRole(String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Missing token");
        }
        java.util.List<String> roles = jwtService.extractRoles(authHeader.substring(7));
        if (!roles.contains("CARE") && !roles.contains("ADMIN")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Customer-care access required");
        }
    }

    private Long getUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated");
        }
        try {
            return Long.valueOf(authentication.getName());
        } catch (NumberFormatException ex) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Invalid session. Please sign out and sign in again."
            );
        }
    }

    @PostMapping("/link-token/create")
    public ResponseEntity<Map<String, String>> createLinkToken() throws IOException {
        LinkTokenRequest request = new LinkTokenRequest();
        request.setUserId(getUserId()); // Set userId from authenticated context
        String linkToken = plaidService.createLinkToken(request);
        return ResponseEntity.ok(Collections.singletonMap("link_token", linkToken));
    }

    @PostMapping("/public-token/exchange")
    public ResponseEntity<Map<String, String>> exchangePublicToken(@RequestBody PublicTokenExchangeRequest request) throws IOException {
        request.setUserId(getUserId()); // Set userId from authenticated context
        plaidService.exchangePublicToken(request);
        // Return JSON (not a bare string) so the web client's response.json() can parse it.
        return ResponseEntity.ok(Collections.singletonMap("message", "Public token exchanged successfully"));
    }

    @GetMapping("/accounts")
    public ResponseEntity<List<AccountDto>> getAccounts() {
        List<AccountDto> accounts = accountService.getAccountsByUserId(getUserId());
        return ResponseEntity.ok(accounts);
    }

    @GetMapping("/transactions")
    public ResponseEntity<List<TransactionDto>> getTransactions() {
        Long userId = getUserId();
        List<TransactionDto> transactions = transactionService.getTransactionsByUserId(userId);
        // Lazy first-load: if nothing has synced yet (common right after linking, since
        // Plaid's webhook can't reach localhost), pull on demand via /transactions/sync.
        if (transactions.isEmpty()) {
            try {
                if (plaidService.syncTransactions(userId) > 0) {
                    transactions = transactionService.getTransactionsByUserId(userId);
                }
            } catch (Exception ignored) { /* best-effort; return what we have */ }
        }
        return ResponseEntity.ok(transactions);
    }

    /** Recurring bills/subscriptions detected from transaction history (upcoming first). */
    @GetMapping("/recurring-bills")
    public ResponseEntity<List<com.mywealthmanagement.accountaggregationservice.transaction.RecurringBillDto>> recurringBills() {
        return ResponseEntity.ok(transactionService.getRecurringBills(getUserId()));
    }

    // ---- Auto-categorization rules ----
    @GetMapping("/category-rules")
    public ResponseEntity<List<com.mywealthmanagement.accountaggregationservice.transaction.CategoryRule>> listRules() {
        return ResponseEntity.ok(categoryRuleService.list(getUserId()));
    }

    @PostMapping("/category-rules")
    public ResponseEntity<com.mywealthmanagement.accountaggregationservice.transaction.CategoryRule> createRule(
            @RequestBody Map<String, String> body) {
        var b = body == null ? Map.<String, String>of() : body;
        return ResponseEntity.ok(categoryRuleService.create(
                getUserId(), b.get("matchType"), b.get("pattern"), b.get("category")));
    }

    @DeleteMapping("/category-rules/{id}")
    public ResponseEntity<Void> deleteRule(@PathVariable Long id) {
        categoryRuleService.delete(getUserId(), id);
        return ResponseEntity.noContent().build();
    }

    /** Apply all of the user's rules to their uncategorized transactions. Returns count. */
    @PostMapping("/category-rules/apply")
    public ResponseEntity<Map<String, Integer>> applyRules() {
        return ResponseEntity.ok(Map.of("updated", categoryRuleService.applyRules(getUserId())));
    }

    /** Explicit pull-based sync (e.g. a "Refresh" button). Returns how many changed. */
    @PostMapping("/transactions/sync")
    public ResponseEntity<Map<String, Integer>> syncTransactions() {
        int changed = plaidService.syncTransactions(getUserId());
        return ResponseEntity.ok(Map.of("synced", changed));
    }

    /** Update a transaction's spending category (used by the Cash page's inline editor). */
    @PatchMapping("/transactions/{id}/category")
    public ResponseEntity<TransactionDto> updateTransactionCategory(
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {
        String category = body == null ? null : body.get("category");
        return ResponseEntity.ok(transactionService.updateCategory(getUserId(), id, category));
    }

    // ---- Customer-care (CARE/ADMIN) read-only views of a member's data ----
    @GetMapping("/support/{userId}/accounts")
    public ResponseEntity<List<AccountDto>> supportAccounts(
            @PathVariable Long userId,
            @RequestHeader(value = "Authorization", required = false) String auth) {
        requireSupportRole(auth);
        return ResponseEntity.ok(accountService.getAccountsByUserId(userId));
    }

    @GetMapping("/support/{userId}/transactions")
    public ResponseEntity<List<TransactionDto>> supportTransactions(
            @PathVariable Long userId,
            @RequestHeader(value = "Authorization", required = false) String auth) {
        requireSupportRole(auth);
        return ResponseEntity.ok(transactionService.getTransactionsByUserId(userId));
    }

    // Webhook endpoint for Plaid
    @PostMapping("/webhook")
    public ResponseEntity<Void> receiveWebhook(
            @RequestBody(required = false) String rawBody,
            @RequestHeader(value = "Plaid-Verification", required = false) String verificationHeader) {
        // Verify the webhook before trusting it. Never log the raw payload (it can carry
        // account/item identifiers) — only a non-sensitive acknowledgement.
        if (!plaidWebhookVerifier.verify(rawBody == null ? "" : rawBody, verificationHeader)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).build();
        }
        log.info("Accepted a verified Plaid webhook.");
        // Full implementation would: parse webhook type, fetch updated data for the
        // affected item/user, and publish an event for downstream services.
        return ResponseEntity.ok().build();
    }
}
