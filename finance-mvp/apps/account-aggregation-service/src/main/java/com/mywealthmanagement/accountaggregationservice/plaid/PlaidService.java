package com.mywealthmanagement.accountaggregationservice.plaid;

import com.mywealthmanagement.accountaggregationservice.account.Account;
import com.mywealthmanagement.accountaggregationservice.account.AccountRepository;
import com.mywealthmanagement.accountaggregationservice.holding.Holding;
import com.mywealthmanagement.accountaggregationservice.holding.HoldingRepository;
import com.mywealthmanagement.accountaggregationservice.holding.InvestmentTransaction;
import com.mywealthmanagement.accountaggregationservice.holding.InvestmentTransactionRepository;
import com.mywealthmanagement.accountaggregationservice.plaid.dto.LinkTokenRequest;
import com.mywealthmanagement.accountaggregationservice.plaid.dto.PublicTokenExchangeRequest;
import com.mywealthmanagement.accountaggregationservice.transaction.Transaction;
import com.mywealthmanagement.accountaggregationservice.transaction.TransactionRepository;
import com.plaid.client.model.AccountBase;
import com.plaid.client.model.AccountsGetRequest;
import com.plaid.client.model.AccountsGetResponse;
import com.plaid.client.model.CountryCode;
import com.plaid.client.model.CreditCardLiability;
import com.plaid.client.model.InvestmentsHoldingsGetRequest;
import com.plaid.client.model.InvestmentsHoldingsGetResponse;
import com.plaid.client.model.InvestmentsTransactionsGetRequest;
import com.plaid.client.model.InvestmentsTransactionsGetResponse;
import com.plaid.client.model.ItemPublicTokenExchangeRequest;
import com.plaid.client.model.ItemPublicTokenExchangeResponse;
import com.plaid.client.model.ItemRemoveRequest;
import com.plaid.client.model.LiabilitiesGetRequest;
import com.plaid.client.model.LiabilitiesGetResponse;
import com.plaid.client.model.LinkTokenCreateRequest;
import com.plaid.client.model.Security;
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
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
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
    private final HoldingRepository holdingRepository;
    private final InvestmentTransactionRepository investmentTransactionRepository;
    private final com.mywealthmanagement.accountaggregationservice.comms.NotificationClient notificationClient;

    @Value("${plaid.client-name}")
    private String plaidClientName;

    @Value("${plaid.webhook-url:}")
    private String plaidWebhookUrl;

    public String createLinkToken(LinkTokenRequest request) throws IOException {
        LinkTokenCreateRequestUser user = new LinkTokenCreateRequestUser()
                .clientUserId(request.getUserId().toString());

        // TRANSACTIONS is supported by every account type (depository, credit, loan,
        // investment), so it's the only *required* product — this is what lets the user
        // link credit cards, loans and brokerage accounts, not just checking/savings.
        //
        // AUTH (bank account/routing for ACH) is depository-only: when it's required,
        // Plaid Link hides every non-depository account, which is exactly why credit
        // cards previously couldn't be linked. LIABILITIES powers credit-card due dates
        // and minimum payments for bill reminders; INVESTMENTS pulls brokerage holdings
        // (positions, quantities, prices). All three go in optionalProducts so they're
        // collected when the account supports them but never restrict what can be linked.
        LinkTokenCreateRequest linkRequest = new LinkTokenCreateRequest()
                .user(user)
                .clientName(plaidClientName)
                .language("en")
                .countryCodes(List.of(CountryCode.US))
                .products(List.of(Products.TRANSACTIONS))
                .optionalProducts(List.of(Products.AUTH, Products.LIABILITIES, Products.INVESTMENTS));

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

        List<Account> linkedAccounts = fetchAccounts(request.getUserId(), plaidItem);
        // Enrich any credit-card accounts with statement balance / minimum payment /
        // next due date for bill reminders. Best-effort: LIABILITIES is optional, so an
        // item with no credit cards (or where the product isn't ready yet) must not fail
        // the link.
        try {
            fetchLiabilities(request.getUserId(), plaidItem);
        } catch (Exception e) {
            log.warn("Liabilities fetch deferred for item {}: {}",
                    plaidItem.getPlaidItemId(), e.getMessage());
        }
        // Pull brokerage positions for any investment accounts. Best-effort: INVESTMENTS
        // is optional, so an item with no brokerage accounts must not fail the link.
        try {
            fetchHoldings(request.getUserId(), plaidItem);
        } catch (Exception e) {
            log.warn("Holdings fetch deferred for item {}: {}",
                    plaidItem.getPlaidItemId(), e.getMessage());
        }
        try {
            fetchInvestmentTransactions(request.getUserId(), plaidItem);
        } catch (Exception e) {
            log.warn("Investment transactions fetch deferred for item {}: {}",
                    plaidItem.getPlaidItemId(), e.getMessage());
        }
        // Transactions are frequently PRODUCT_NOT_READY right after linking — Plaid
        // fires a TRANSACTIONS webhook when they're available, and the next sync/read
        // picks them up. Don't fail the whole link if they're not ready yet.
        try {
            fetchTransactions(request.getUserId(), plaidItem);
        } catch (Exception e) {
            log.warn("Initial transactions fetch deferred for item {} (will sync on webhook/next read): {}",
                    plaidItem.getPlaidItemId(), e.getMessage());
        }

        // Best-effort: confirm the successful link to the user (in-app + email).
        int count = linkedAccounts == null ? 0 : linkedAccounts.size();
        String noun = count == 1 ? "account" : "accounts";
        notificationClient.notify(request.getUserId(), "ACCOUNT",
                "Accounts linked",
                count > 0
                        ? "We linked " + count + " " + noun + " to TerraVest. Your balances and transactions are syncing now."
                        : "Your bank connection was added to TerraVest. Accounts will appear as they finish syncing.");
    }

    /**
     * Unlink (disconnect) a Plaid item — the institution connection behind one or more
     * accounts. Purges the item's holdings + investment transactions (not FK-cascaded),
     * revokes the access token at Plaid (best-effort), then deletes the item, which
     * cascades its accounts and their transactions. Scoped to the owning user.
     */
    @Transactional
    public void unlinkItem(Long userId, String plaidItemId) {
        PlaidItem item = plaidItemRepository.findByUserIdAndPlaidItemId(userId, plaidItemId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Linked connection not found"));

        List<String> plaidAccountIds = accountRepository.findByPlaidItemPlaidItemId(plaidItemId)
                .stream().map(Account::getPlaidAccountId).collect(Collectors.toList());
        if (!plaidAccountIds.isEmpty()) {
            holdingRepository.deleteByPlaidAccountIdIn(plaidAccountIds);
            investmentTransactionRepository.deleteByPlaidAccountIdIn(plaidAccountIds);
        }

        try {
            plaidApi.itemRemove(new ItemRemoveRequest().accessToken(item.getAccessToken())).execute();
        } catch (Exception e) {
            log.warn("Plaid itemRemove failed for item {} (removing locally anyway): {}",
                    plaidItemId, e.getMessage());
        }

        // FK ON DELETE CASCADE removes the item's accounts, and in turn their transactions.
        plaidItemRepository.delete(item);
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

    /**
     * Pull credit-card liability details (statement balance, minimum payment, next due
     * date, purchase APR) for the item's credit accounts and persist them onto the
     * matching {@link Account} rows. Powers the bill-pay quick-amounts and due-date
     * reminders. No-op when the item has no credit cards or LIABILITIES isn't ready.
     */
    public void fetchLiabilities(Long userId, PlaidItem plaidItem) throws IOException {
        LiabilitiesGetRequest request = new LiabilitiesGetRequest()
                .accessToken(plaidItem.getAccessToken());

        Response<LiabilitiesGetResponse> response = plaidApi.liabilitiesGet(request).execute();
        if (!response.isSuccessful() || response.body() == null) {
            throw new IOException("Failed to fetch liabilities: " + errorBody(response));
        }

        var liabilities = response.body().getLiabilities();
        if (liabilities == null || liabilities.getCredit() == null) {
            return;
        }

        for (CreditCardLiability card : liabilities.getCredit()) {
            accountRepository.findByPlaidAccountId(card.getAccountId()).ifPresent(account -> {
                account.setLastStatementBalance(toBigDecimalOrNull(card.getLastStatementBalance()));
                account.setMinimumPayment(toBigDecimalOrNull(card.getMinimumPaymentAmount()));
                account.setNextPaymentDueDate(card.getNextPaymentDueDate());
                account.setAprPercentage(purchaseApr(card));
                accountRepository.save(account);
            });
        }
    }

    /** Purchase APR for the card if present, else the first APR, else null. */
    private static BigDecimal purchaseApr(CreditCardLiability card) {
        if (card.getAprs() == null || card.getAprs().isEmpty()) {
            return null;
        }
        return card.getAprs().stream()
                .filter(a -> a.getAprType() != null
                        && String.valueOf(a.getAprType().getValue()).toLowerCase().contains("purchase"))
                .findFirst()
                .or(() -> card.getAprs().stream().findFirst())
                .map(a -> toBigDecimalOrNull(a.getAprPercentage()))
                .orElse(null);
    }

    /**
     * Pull brokerage positions for the item's investment accounts via Plaid Investments
     * and upsert them as {@link Holding} rows (ticker, name, quantity, price, value,
     * cost basis) for the Investments tab. No-op when the item has no investment
     * accounts or the product isn't ready yet.
     */
    public void fetchHoldings(Long userId, PlaidItem plaidItem) throws IOException {
        InvestmentsHoldingsGetRequest request = new InvestmentsHoldingsGetRequest()
                .accessToken(plaidItem.getAccessToken());

        Response<InvestmentsHoldingsGetResponse> response = plaidApi.investmentsHoldingsGet(request).execute();
        if (!response.isSuccessful() || response.body() == null) {
            throw new IOException("Failed to fetch holdings: " + errorBody(response));
        }

        InvestmentsHoldingsGetResponse body = response.body();
        if (body.getHoldings() == null || body.getHoldings().isEmpty()) {
            return;
        }

        // security_id -> Security, so each holding can be enriched with ticker/name/type.
        java.util.Map<String, Security> securities = new java.util.HashMap<>();
        if (body.getSecurities() != null) {
            for (Security s : body.getSecurities()) {
                securities.put(s.getSecurityId(), s);
            }
        }

        for (com.plaid.client.model.Holding plaidHolding : body.getHoldings()) {
            Security security = securities.get(plaidHolding.getSecurityId());
            Holding holding = holdingRepository
                    .findByUserIdAndPlaidAccountIdAndSecurityId(
                            userId, plaidHolding.getAccountId(), plaidHolding.getSecurityId())
                    .orElseGet(Holding::new);

            holding.setUserId(userId);
            holding.setPlaidAccountId(plaidHolding.getAccountId());
            holding.setSecurityId(plaidHolding.getSecurityId());
            if (security != null) {
                holding.setSymbol(security.getTickerSymbol());
                holding.setName(security.getName());
                holding.setSecurityType(security.getType());
            }
            holding.setBroker(brokerNameFor(plaidHolding.getAccountId()));
            holding.setQuantity(toBigDecimalOrNull(plaidHolding.getQuantity()));
            holding.setPrice(toBigDecimalOrNull(plaidHolding.getInstitutionPrice()));
            holding.setValue(toBigDecimalOrNull(plaidHolding.getInstitutionValue()));
            holding.setCostBasis(toBigDecimalOrNull(plaidHolding.getCostBasis()));
            holding.setCurrency(plaidHolding.getIsoCurrencyCode() != null
                    ? plaidHolding.getIsoCurrencyCode() : "USD");

            holdingRepository.save(holding);
        }
    }

    /**
     * Pull brokerage trade/activity history (buys, sells, dividends, fees) for the last
     * two years via Plaid Investments transactions and upsert them as
     * {@link InvestmentTransaction} rows for the Activity view. No-op when the item has
     * no investment accounts.
     */
    public void fetchInvestmentTransactions(Long userId, PlaidItem plaidItem) throws IOException {
        LocalDate endDate = LocalDate.now();
        LocalDate startDate = endDate.minusYears(2);

        InvestmentsTransactionsGetRequest request = new InvestmentsTransactionsGetRequest()
                .accessToken(plaidItem.getAccessToken())
                .startDate(startDate)
                .endDate(endDate);

        Response<InvestmentsTransactionsGetResponse> response =
                plaidApi.investmentsTransactionsGet(request).execute();
        if (!response.isSuccessful() || response.body() == null) {
            throw new IOException("Failed to fetch investment transactions: " + errorBody(response));
        }

        InvestmentsTransactionsGetResponse body = response.body();
        if (body.getInvestmentTransactions() == null || body.getInvestmentTransactions().isEmpty()) {
            return;
        }

        java.util.Map<String, Security> securities = new java.util.HashMap<>();
        if (body.getSecurities() != null) {
            for (Security s : body.getSecurities()) {
                securities.put(s.getSecurityId(), s);
            }
        }

        for (com.plaid.client.model.InvestmentTransaction t : body.getInvestmentTransactions()) {
            Security security = securities.get(t.getSecurityId());
            InvestmentTransaction txn = investmentTransactionRepository
                    .findByPlaidInvestmentTxnId(t.getInvestmentTransactionId())
                    .orElseGet(InvestmentTransaction::new);

            txn.setUserId(userId);
            txn.setPlaidInvestmentTxnId(t.getInvestmentTransactionId());
            txn.setPlaidAccountId(t.getAccountId());
            txn.setSecurityId(t.getSecurityId());
            txn.setSymbol(security != null ? security.getTickerSymbol() : null);
            txn.setName(t.getName());
            txn.setBroker(brokerNameFor(t.getAccountId()));
            txn.setType(t.getType() != null ? String.valueOf(t.getType().getValue()) : null);
            txn.setSubtype(t.getSubtype() != null ? String.valueOf(t.getSubtype().getValue()) : null);
            txn.setDate(t.getDate());
            txn.setQuantity(toBigDecimalOrNull(t.getQuantity()));
            txn.setPrice(toBigDecimalOrNull(t.getPrice()));
            txn.setAmount(toBigDecimalOrNull(t.getAmount()));
            txn.setFees(toBigDecimalOrNull(t.getFees()));
            txn.setCurrency(t.getIsoCurrencyCode() != null ? t.getIsoCurrencyCode() : "USD");

            investmentTransactionRepository.save(txn);
        }
    }

    /** Display name of the institution holding an account (for the broker filter). */
    private String brokerNameFor(String plaidAccountId) {
        return accountRepository.findByPlaidAccountId(plaidAccountId)
                .map(a -> a.getOfficialName() != null && !a.getOfficialName().isBlank()
                        ? a.getOfficialName() : a.getName())
                .orElse(null);
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
     * Re-pull brokerage holdings + investment transactions for all of the user's linked
     * items. Best-effort per item — used by the Investments "Refresh" action and to
     * back-fill holdings when the Investments product wasn't ready at link time. Returns
     * the number of items processed.
     */
    public int refreshInvestments(Long userId) {
        int items = 0;
        for (PlaidItem item : plaidItemRepository.findByUserId(userId)) {
            try {
                fetchHoldings(userId, item);
            } catch (Exception e) {
                log.warn("Holdings refresh failed for item {}: {}",
                        item.getPlaidItemId(), e.getMessage());
            }
            try {
                fetchInvestmentTransactions(userId, item);
            } catch (Exception e) {
                log.warn("Investment-txns refresh failed for item {}: {}",
                        item.getPlaidItemId(), e.getMessage());
            }
            items++;
        }
        return items;
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
        account.setMask(plaidAccount.getMask());
        // For credit cards/lines, balances.limit is the credit limit (powers utilization).
        account.setCreditLimit(toBigDecimalOrNull(plaidAccount.getBalances().getLimit()));
        account.setSubtype(plaidAccount.getSubtype() != null ? plaidAccount.getSubtype().getValue() : "other");
        account.setType(plaidAccount.getType() != null ? plaidAccount.getType().getValue() : "other");
        account.setCurrentBalance(toBigDecimal(plaidAccount.getBalances().getCurrent()));
        account.setAvailableBalance(toBigDecimal(plaidAccount.getBalances().getAvailable()));
        account.setCurrency(
                plaidAccount.getBalances().getIsoCurrencyCode() != null
                        ? plaidAccount.getBalances().getIsoCurrencyCode()
                        : "USD"
        );
        // Business vs personal, when the institution reports it (Plaid holder_category).
        account.setHolderCategory(
                plaidAccount.getHolderCategory() != null ? plaidAccount.getHolderCategory().getValue() : null
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
        transaction.setMerchantName(plaidTxn.getMerchantName());
        // Plaid's `pending` flag powers status tracking (pending vs cleared). A pending
        // transaction later re-syncs as cleared under the same transaction id.
        transaction.setPending(plaidTxn.getPending());
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

    /** Like {@link #toBigDecimal} but preserves null (for optional liability fields). */
    private static BigDecimal toBigDecimalOrNull(Double value) {
        return value != null ? BigDecimal.valueOf(value) : null;
    }

    private static String errorBody(Response<?> response) throws IOException {
        if (response.errorBody() != null) {
            return response.errorBody().string();
        }
        return "HTTP " + response.code();
    }
}
