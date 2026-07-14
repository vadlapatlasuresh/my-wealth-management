package com.mywealthmanagement.businessfinancialsservice.business.manual;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface BusinessTransactionRepository extends JpaRepository<BusinessTransaction, Long> {

    List<BusinessTransaction> findByBusinessIdAndUserIdOrderByPostedAtDescIdDesc(Long businessId, Long userId);

    List<BusinessTransaction> findByAccountIdAndUserIdOrderByPostedAtDescIdDesc(Long accountId, Long userId);

    Optional<BusinessTransaction> findByIdAndUserId(Long id, Long userId);

    void deleteByAccountIdAndUserId(Long accountId, Long userId);

    void deleteByBusinessIdAndUserId(Long businessId, Long userId);

    /* ---------- Ledger-derived aggregation for period-aware dashboards ---------- */
    // Amount sign convention: negative = money out (expense), positive = money in (revenue).
    // COALESCE keeps the result 0 (never null) when a business/period has no rows.

    /** Money in (revenue) for one business over [from, to] inclusive. */
    @Query("""
           SELECT COALESCE(SUM(t.amount), 0) FROM BusinessTransaction t
           WHERE t.userId = :userId AND t.businessId = :businessId
             AND t.amount > 0 AND t.postedAt BETWEEN :from AND :to
           """)
    BigDecimal sumInflow(@Param("userId") Long userId, @Param("businessId") Long businessId,
                         @Param("from") LocalDate from, @Param("to") LocalDate to);

    /** Money out (expenses), returned as a positive magnitude, for one business over [from, to]. */
    @Query("""
           SELECT COALESCE(-SUM(t.amount), 0) FROM BusinessTransaction t
           WHERE t.userId = :userId AND t.businessId = :businessId
             AND t.amount < 0 AND t.postedAt BETWEEN :from AND :to
           """)
    BigDecimal sumOutflow(@Param("userId") Long userId, @Param("businessId") Long businessId,
                          @Param("from") LocalDate from, @Param("to") LocalDate to);

    /** Money in across ALL of the user's businesses over [from, to] (consolidated). */
    @Query("""
           SELECT COALESCE(SUM(t.amount), 0) FROM BusinessTransaction t
           WHERE t.userId = :userId AND t.amount > 0 AND t.postedAt BETWEEN :from AND :to
           """)
    BigDecimal sumInflowAll(@Param("userId") Long userId,
                            @Param("from") LocalDate from, @Param("to") LocalDate to);

    /** Money out (positive magnitude) across ALL of the user's businesses over [from, to]. */
    @Query("""
           SELECT COALESCE(-SUM(t.amount), 0) FROM BusinessTransaction t
           WHERE t.userId = :userId AND t.amount < 0 AND t.postedAt BETWEEN :from AND :to
           """)
    BigDecimal sumOutflowAll(@Param("userId") Long userId,
                             @Param("from") LocalDate from, @Param("to") LocalDate to);
}
