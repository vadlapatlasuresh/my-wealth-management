package com.mywealthmanagement.businessfinancialsservice.business.manual;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface BusinessExpenseLinkRepository extends JpaRepository<BusinessExpenseLink, Long> {

    List<BusinessExpenseLink> findByExpenseIdOrderByTxDateDescIdDesc(Long expenseId);

    /** Batch-load links for a page of expenses so listing stays a single extra query. */
    List<BusinessExpenseLink> findByExpenseIdIn(Collection<Long> expenseIds);

    Optional<BusinessExpenseLink> findByExpenseIdAndTxSourceAndTxRef(Long expenseId, String txSource, String txRef);

    Optional<BusinessExpenseLink> findByIdAndUserId(Long id, Long userId);

    void deleteByExpenseId(Long expenseId);

    void deleteByUserId(Long userId);

    /**
     * Delete every link belonging to a business's expenses. Links are keyed by expense, not
     * business, so deleting a business needs this sub-select to clear them before its
     * expenses go (the DB FK cascade covers Postgres; this keeps the explicit app-level
     * cascade in deleteBusiness complete and works on stores without cascade).
     */
    @Modifying
    @Query("""
           DELETE FROM BusinessExpenseLink l
           WHERE l.expenseId IN (
               SELECT e.id FROM BusinessExpense e
               WHERE e.businessId = :businessId AND e.userId = :userId)
           """)
    void deleteByBusinessIdAndUserId(@Param("businessId") Long businessId, @Param("userId") Long userId);
}
