package com.mywealthmanagement.businessfinancialsservice.ledger;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface JournalLineRepository extends JpaRepository<JournalLine, Long> {

    List<JournalLine> findByEntryIdOrderByPositionAsc(Long entryId);

    List<JournalLine> findByEntryIdInOrderByPositionAsc(List<Long> entryIds);

    /**
     * Net debit/credit totals per account for a business, as rows of
     * [accountId, sumDebit, sumCredit]. Backs the trial balance and account balances.
     */
    @Query("""
           SELECT l.accountId, COALESCE(SUM(l.debit), 0), COALESCE(SUM(l.credit), 0)
           FROM JournalLine l
           JOIN JournalEntry e ON e.id = l.entryId
           WHERE e.businessId = :businessId AND e.userId = :userId
           GROUP BY l.accountId
           """)
    List<Object[]> sumByAccount(@Param("businessId") Long businessId, @Param("userId") Long userId);
}
