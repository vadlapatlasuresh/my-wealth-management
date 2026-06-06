package com.mywealthmanagement.accountaggregationservice.aggregation;

import com.mywealthmanagement.accountaggregationservice.account.AccountService;
import com.mywealthmanagement.accountaggregationservice.account.dto.AccountDto;
import com.mywealthmanagement.accountaggregationservice.plaid.PlaidService;
import com.mywealthmanagement.accountaggregationservice.plaid.dto.LinkTokenRequest;
import com.mywealthmanagement.accountaggregationservice.plaid.dto.PublicTokenExchangeRequest;
import com.mywealthmanagement.accountaggregationservice.transaction.TransactionService;
import com.mywealthmanagement.accountaggregationservice.transaction.dto.TransactionDto;
import lombok.RequiredArgsConstructor;
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

    private final PlaidService plaidService;
    private final AccountService accountService;
    private final TransactionService transactionService;

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
    public ResponseEntity<String> exchangePublicToken(@RequestBody PublicTokenExchangeRequest request) throws IOException {
        request.setUserId(getUserId()); // Set userId from authenticated context
        plaidService.exchangePublicToken(request);
        return ResponseEntity.ok("Public token exchanged successfully");
    }

    @GetMapping("/accounts")
    public ResponseEntity<List<AccountDto>> getAccounts() {
        List<AccountDto> accounts = accountService.getAccountsByUserId(getUserId());
        return ResponseEntity.ok(accounts);
    }

    @GetMapping("/transactions")
    public ResponseEntity<List<TransactionDto>> getTransactions() {
        List<TransactionDto> transactions = transactionService.getTransactionsByUserId(getUserId());
        return ResponseEntity.ok(transactions);
    }

    // Webhook endpoint for Plaid
    @PostMapping("/webhook")
    @ResponseStatus(HttpStatus.OK)
    public void receiveWebhook(@RequestBody Map<String, Object> webhook) {
        // In a real application, you'd verify the webhook signature
        // and process different webhook types (e.g., TRANSACTIONS_UPDATES, ITEM_ERROR)
        System.out.println("Received Plaid Webhook: " + webhook);
        // For now, just logging. Full implementation would involve:
        // 1. Verify signature
        // 2. Parse webhook type
        // 3. Fetch updated data for affected item/user
        // 4. Publish event to message queue for other services
    }
}
