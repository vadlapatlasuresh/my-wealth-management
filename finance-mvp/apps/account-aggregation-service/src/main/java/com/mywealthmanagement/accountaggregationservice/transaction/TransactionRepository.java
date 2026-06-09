package com.mywealthmanagement.accountaggregationservice.transaction;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface TransactionRepository extends JpaRepository<Transaction, Long> {
    Optional<Transaction> findByPlaidTransactionId(String plaidTransactionId);
    List<Transaction> findByAccountId(Long accountId);
    List<Transaction> findByUserId(Long userId);
    List<Transaction> findByUserIdAndDateBetween(Long userId, LocalDate startDate, LocalDate endDate);

    void deleteByUserId(Long userId);
}
