package com.mywealthmanagement.accountaggregationservice.transaction;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface TransactionRepository extends JpaRepository<Transaction, Long> {
    Optional<Transaction> findByPlaidTransactionId(String plaidTransactionId);
    List<Transaction> findByAccountId(Long accountId);
    List<Transaction> findByUserId(Long userId);
    List<Transaction> findByUserIdAndDateBetween(Long userId, LocalDate startDate, LocalDate endDate);

    /**
     * Most-recent transactions for the display list, bounded so a heavy account can't
     * trigger an unbounded fetch. Ordered newest-first; pass a {@link Limit} cap.
     */
    List<Transaction> findByUserIdOrderByDateDesc(Long userId, Limit limit);

    void deleteByUserId(Long userId);
}
