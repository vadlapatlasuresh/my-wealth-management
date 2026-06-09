package com.mywealthmanagement.accountaggregationservice.plaid;

import com.mywealthmanagement.accountaggregationservice.account.Account;
import com.mywealthmanagement.accountaggregationservice.account.AccountRepository;
import com.mywealthmanagement.accountaggregationservice.plaid.dto.LinkTokenRequest;
import com.mywealthmanagement.accountaggregationservice.plaid.dto.PublicTokenExchangeRequest;
import com.mywealthmanagement.accountaggregationservice.transaction.Transaction;
import com.mywealthmanagement.accountaggregationservice.transaction.TransactionRepository;
import com.plaid.client.model.AccountBase;
import com.plaid.client.model.AccountsGetRequest;
import com.plaid.client.model.AccountsGetResponse;
import com.plaid.client.model.CountryCode;
import com.plaid.client.model.ItemPublicTokenExchangeRequest;
import com.plaid.client.model.ItemPublicTokenExchangeResponse;
import com.plaid.client.model.LinkTokenCreateRequest;
import com.plaid.client.model.LinkTokenCreateRequestUser;
import com.plaid.client.model.LinkTokenCreateResponse;
import com.plaid.client.model.Products;
import com.plaid.client.model.TransactionsGetRequest;
import com.plaid.client.model.TransactionsGetResponse;
import com.plaid.client.model.TransactionsSyncRequest;
import com.plaid.client.model.TransactionsSyncResponse;
import com.plaid.client.model.RemovedTransaction;
import com.plaid.client.request.PlaidApi;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import retrofit2.Response;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class PlaidService {

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(PlaidService.class);

    private final PlaidApi plaidApi;
    private final PlaidItemRepository plaidItemRepository;
    private final AccountRepository accountRepository;
    private final TransactionRepository transactionRepository;

    @Value("${plaid.client-name}")
    private String plaidClientName;

    @Value("${plaid.webhook-url:}")
    private String plaidWebhookUrl;

    public String createLinkToken(LinkTokenRequest request) throws IOException {
        LinkTokenCreateRequestUser user = new LinkTokenCreateRequestUser()
                .clientUserId(request.getUserId().toString());

        LinkTokenCreateRequest linkRequest = new LinkTokenCreateRequest()
                .user(user)
                .clientName(plaidClientName)
                .language("en")
                .countryCodes(List.of(CountryCode.US))
                .products(List.of(Products.AUTH, Products.TRANSACTIONS));

        if (plaidWebhookUrl != null && !plaidWebhookUrl.isBlank()) {
            linkRequest.webhook(plaidWebhookUrl);
        }

        Response<LinkTokenCreateResponse> response = plaidApi.linkTokenCreate(linkRequest).execute();
        if (!response.isSuccessful() || response.body() == null) {
            throw new IOException("Failed to create link token: " + errorBody(response));
        }
        return response.body().getLinkToken();
    }

    public void exchangePublicToken(PublicTokenExchangeRequest request) throws IOException {
        ItemPublicTokenExchangeRequest exchangeRequest = new ItemPublicTokenExchangeRequest()
                .publicToken(request.getPublicToken());

        Response<ItemPublicTokenExchangeResponse> response = plaidApi.itemPublicTokenExchange(exchangeRequest).execute();
        if (!response.isSuccessful() || response.body() == null) {
            throw new IOException("Failed to exchange public token: " + errorBody(response));
        }

        ItemPublicTokenExchangeResponse body = response.body();
        PlaidItem plaidItem = new PlaidItem(
                request.getUserId(),
                body.getItemId(),
                body.getAccessToken(),
                null
        );
        plaidItemRepository.save(plaidItem);

        fetchAccounts(request.getUserId(), plaidItem);
        // Transactions are frequently PRODUCT_NOT_READY right after linking — Plaid
        // fires a TRANSACTIONS webhook when they're available, and the next sync/read
        // picks them up. Don't fail the whole link if they're not ready yet.
        try {
            fetchTransactions(request.getUserId(), plaidItem);
        } catch (Exception e) {
            log.warn("Initial transactions fetch deferred for item {} (will sync on webhook/next read): {}",
                    plaidItem.getPlaidItemId(), e.getMessage());
        }
    }

    public List<Account> fetchAccounts(Long userId, PlaidItem plaidItem) throws IOException {
        AccountsGetRequest accountsGetRequest = new AccountsGetRequest()
                .accessToken(plaidItem.getAccessToken());

        Response<AccountsGetResponse> response = plaidApi.accountsGet(accountsGetRequest).execute();
        if (!response.isSuccessful() || response.body() == null) {
            throw new IOException("Failed to fetch accounts: " + errorBody(response));
        }

        List<Account> accounts = response.body().getAccounts().stream()
                .map(plaidAccount -> mapAccount(userId, plaidItem, plaidAccount))
                .collect(Collectors.toList());

        return accountRepository.saveAll(accounts);
    }

    public List<Transaction> fetchTransactions(Long userId, PlaidItem plaidItem) throws IOException {
        LocalDate endDate = LocalDate.now();
        LocalDate startDate = endDate.minusDays(30);

        TransactionsGetRequest transactionsGetRequest = new TransactionsGetRequest()
                .accessToken(plaidItem.getAccessToken())
                .startDate(startDate)
                .endDate(endDate);

        Response<TransactionsGetResponse> response = plaidApi.transactionsGet(transactionsGetRequest).execute();
        if (!response.isSuccessful() || response.body() == null) {
            throw new IOException("Failed to fetch transactions: " + errorBody(response));
        }

        List<Transaction> transactions = response.body().getTransactions().stream()
                .map(plaidTxn -> mapTransaction(userId, plaidTxn))
                .collect(Collectors.toList());

        return transactionRepository.saveAll(transactions);
    }

    /**
     * Pull-based transaction sync via Plaid /transactions/sync (no webhook needed).
     * Walks every linked item from its stored cursor, upserts added/modified, removes
     * deleted, and persists the new cursor so subsequent syncs are incremental.
     * Best-effort per item — one failing item never aborts the others. Returns the
     * number of transactions added/updated.
     */
    public int syncTransactions(Long userId) {
        int changed = 0;
        for (PlaidItem item : plaidItemRepository.findByUserId(userId)) {
            try {
                String cursor = item.getTransactionCursor();
                boolean hasMore = true;
                while (hasMore) {
                    TransactionsSyncRequest req = new TransactionsSyncRequest().accessToken(item.getAccessToken());
                    if (cursor != null && !cursor.isBlank()) req.cursor(cursor);
                    Response<TransactionsSyncResponse> resp = plaidApi.transactionsSync(req).execute();
                    if (!resp.isSuccessful() || resp.body() == null) {
                        log.warn("transactionsSync not ready for item {}: {}", item.getPlaidItemId(), errorBody(resp));
                        break;
                    }
                    TransactionsSyncResponse body = resp.body();
                    for (com.plaid.client.model.Transaction t : body.getAdded()) {
                        if (saveSynced(userId, t)) changed++;
                    }
                    for (com.plaid.client.model.Transaction t : body.getModified()) {
                        if (saveSynced(userId, t)) changed++;
                    }
                    for (RemovedTransaction r : body.getRemoved()) {
                        transactionRepository.findByPlaidTransactionId(r.getTransactionId())
                                .ifPresent(transactionRepository::delete);
                    }
                    cursor = body.getNextCursor();
                    hasMore = Boolean.TRUE.equals(body.getHasMore());
                }
                item.setTransactionCursor(cursor);
                plaidItemRepository.save(item);
            } catch (Exception e) {
                log.warn("transactionsSync failed for item {}: {}", item.getPlaidItemId(), e.getMessage());
            }
        }
        return changed;
    }

    /** Upsert one synced transaction; skips it (logs) if its account isn't linked. */
    private boolean saveSynced(Long userId, com.plaid.client.model.Transaction t) {
        try {
            transactionRepository.save(mapTransaction(userId, t));
            return true;
        } catch (Exception e) {
            log.debug("skip txn {}: {}", t.getTransactionId(), e.getMessage());
            return false;
        }
    }

    private Account mapAccount(Long userId, PlaidItem plaidItem, AccountBase plaidAccount) {
        Account account = accountRepository.findByPlaidAccountId(plaidAccount.getAccountId())
                .orElse(new Account());

        account.setUserId(userId);
        account.setPlaidAccountId(plaidAccount.getAccountId());
        account.setPlaidItem(plaidItem);
        account.setName(plaidAccount.getName());
        account.setOfficialName(plaidAccount.getOfficialName());
        account.setSubtype(plaidAccount.getSubtype() != null ? plaidAccount.getSubtype().getValue() : "other");
        account.setType(plaidAccount.getType() != null ? plaidAccount.getType().getValue() : "other");
        account.setCurrentBalance(toBigDecimal(plaidAccount.getBalances().getCurrent()));
        account.setAvailableBalance(toBigDecimal(plaidAccount.getBalances().getAvailable()));
        account.setCurrency(
                plaidAccount.getBalances().getIsoCurrencyCode() != null
                        ? plaidAccount.getBalances().getIsoCurrencyCode()
                        : "USD"
        );
        return account;
    }

    private Transaction mapTransaction(Long userId, com.plaid.client.model.Transaction plaidTxn) {
        Transaction transaction = transactionRepository.findByPlaidTransactionId(plaidTxn.getTransactionId())
                .orElse(new Transaction());

        Account associatedAccount = accountRepository.findByPlaidAccountId(plaidTxn.getAccountId())
                .orElseThrow(() -> new IllegalStateException(
                        "Account not found for transaction: " + plaidTxn.getTransactionId()));

        transaction.setUserId(userId);
        transaction.setAccountId(associatedAccount.getId());
        transaction.setPlaidTransactionId(plaidTxn.getTransactionId());
        transaction.setPlaidAccountId(plaidTxn.getAccountId());
        transaction.setName(plaidTxn.getName());
        transaction.setAmount(toBigDecimal(plaidTxn.getAmount()));
        transaction.setIsoCurrencyCode(
                plaidTxn.getIsoCurrencyCode() != null ? plaidTxn.getIsoCurrencyCode() : "USD"
        );
        transaction.setDate(plaidTxn.getDate());
        transaction.setCategory(resolveCategory(plaidTxn));
        return transaction;
    }

    /**
     * Category for a transaction. Prefers Plaid's modern personal_finance_category
     * (primary, e.g. FOOD_AND_DRINK -> "Food & Drink"); falls back to the legacy
     * category list; else "Uncategorized". The legacy `category` field is empty on
     * newer Plaid API versions, which is why everything used to be uncategorized.
     */
    private static String resolveCategory(com.plaid.client.model.Transaction txn) {
        var pfc = txn.getPersonalFinanceCategory();
        if (pfc != null && pfc.getPrimary() != null && !pfc.getPrimary().isBlank()) {
            return prettifyCategory(pfc.getPrimary());
        }
        List<String> legacy = txn.getCategory();
        if (legacy != null && !legacy.isEmpty()) {
            return legacy.get(0);
        }
        return "Uncategorized";
    }

    /** FOOD_AND_DRINK -> "Food & Drink", RENT_AND_UTILITIES -> "Rent & Utilities". */
    private static String prettifyCategory(String raw) {
        String s = raw.replace("_AND_", " & ").replace('_', ' ').toLowerCase();
        StringBuilder out = new StringBuilder();
        for (String w : s.split(" ")) {
            if (w.isEmpty()) continue;
            if (w.equals("&")) { out.append("& "); continue; }
            out.append(Character.toUpperCase(w.charAt(0))).append(w.substring(1)).append(' ');
        }
        return out.toString().trim();
    }

    private static BigDecimal toBigDecimal(Double value) {
        return value != null ? BigDecimal.valueOf(value) : BigDecimal.ZERO;
    }

    private static String errorBody(Response<?> response) throws IOException {
        if (response.errorBody() != null) {
            return response.errorBody().string();
        }
        return "HTTP " + response.code();
    }
}
