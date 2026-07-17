package com.mywealthmanagement.paymentservice.ledger;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface LedgerEntryRepository extends JpaRepository<LedgerEntry, Long> {

    List<LedgerEntry> findByUserIdOrderByIdDesc(String userId);

    /** The newest entry for a customer — its balance_after is the current balance. */
    LedgerEntry findTopByUserIdOrderByIdDesc(String userId);

    /** Idempotency: if this key already wrote an entry, the work is already done. */
    Optional<LedgerEntry> findByIdempotencyKey(String idempotencyKey);

    /** Independent recomputation of the balance — used to detect drift against balance_after. */
    @Query("SELECT COALESCE(SUM(l.amountCents), 0) FROM LedgerEntry l WHERE l.userId = :userId")
    long sumAmountsForUser(@Param("userId") String userId);

    @Query("SELECT DISTINCT l.userId FROM LedgerEntry l")
    List<String> findAllUserIds();

    /** Refund/credit activity for a customer in a window — feeds the repeat-refunds rule. */
    @Query("""
        SELECT l FROM LedgerEntry l
        WHERE l.userId = :userId AND l.createdAt >= :from
          AND l.entryType IN ('REFUND', 'CREDIT')
        """)
    List<LedgerEntry> findRefundsSince(@Param("userId") String userId, @Param("from") LocalDateTime from);
}
