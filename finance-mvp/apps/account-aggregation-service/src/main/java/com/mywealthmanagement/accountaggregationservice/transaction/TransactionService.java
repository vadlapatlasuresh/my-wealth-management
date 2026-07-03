package com.mywealthmanagement.accountaggregationservice.transaction;

import com.mywealthmanagement.accountaggregationservice.transaction.dto.TransactionDto;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Limit;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class TransactionService {

    private final TransactionRepository transactionRepository;

    // Display-list cap: a heavy account can't trigger an unbounded fetch. Normal accounts
    // are well under this, so behaviour is unchanged for them; tune via TRANSACTIONS_LIST_MAX.
    @Value("${transactions.list.max:500}")
    private int listMax;

    public List<TransactionDto> getTransactionsByUserId(Long userId) {
        return transactionRepository.findByUserIdOrderByDateDesc(userId, Limit.of(listMax)).stream()
                .map(this::convertToDto)
                .collect(Collectors.toList());
    }

    /** Detect recurring bills/subscriptions from the user's last ~13 months of history. */
    public List<RecurringBillDto> getRecurringBills(Long userId) {
        java.time.LocalDate from = java.time.LocalDate.now().minusMonths(13);
        var txns = transactionRepository.findByUserIdAndDateBetween(userId, from, java.time.LocalDate.now());
        return RecurringBillDetector.detect(txns);
    }

    /**
     * Update a transaction's category. Ownership-scoped: a transaction that does not
     * belong to the caller returns 404 (not 403) so we don't leak that the id exists.
     */
    @Transactional
    public TransactionDto updateCategory(Long userId, Long txId, String category) {
        Transaction tx = transactionRepository.findById(txId)
                .filter(t -> t.getUserId().equals(userId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Transaction not found"));
        tx.setCategory(category == null ? null : category.trim());
        tx.setUpdatedAt(LocalDateTime.now());
        return convertToDto(transactionRepository.save(tx));
    }

    private TransactionDto convertToDto(Transaction transaction) {
        return new TransactionDto(
                transaction.getId(),
                transaction.getAccountId(),
                transaction.getPlaidTransactionId(),
                transaction.getPlaidAccountId(),
                transaction.getName(),
                transaction.getAmount(),
                transaction.getIsoCurrencyCode(),
                transaction.getDate(),
                transaction.getCategory(),
                transaction.getMerchantName(),
                transaction.getPending()
        );
    }
}
