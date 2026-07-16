package com.mywealthmanagement.businessfinancialsservice.business.manual;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

public interface BusinessInvoiceRepository extends JpaRepository<BusinessInvoice, Long> {

    List<BusinessInvoice> findByBusinessIdAndUserIdOrderByCreatedAtDesc(Long businessId, Long userId);

    Optional<BusinessInvoice> findByIdAndUserId(Long id, Long userId);

    /** Public invoice lookup by its opaque token (unauthenticated customer view). */
    Optional<BusinessInvoice> findByShareToken(String shareToken);

    void deleteByBusinessIdAndUserId(Long businessId, Long userId);

    /* ---------- Outstanding-AR aggregation (point-in-time, not period-bound) ---------- */
    // "Outstanding" = anything not yet PAID (OPEN or OVERDUE). Matches the pending
    // view on the business page. COALESCE keeps the result 0 rather than null.

    /** Total unpaid invoice amount for one business. */
    @Query("""
           SELECT COALESCE(SUM(i.amount), 0) FROM BusinessInvoice i
           WHERE i.userId = :userId AND i.businessId = :businessId
             AND UPPER(i.status) <> 'PAID'
           """)
    BigDecimal sumOutstanding(@Param("userId") Long userId, @Param("businessId") Long businessId);

    /** Number of unpaid invoices for one business. */
    @Query("""
           SELECT COUNT(i) FROM BusinessInvoice i
           WHERE i.userId = :userId AND i.businessId = :businessId
             AND UPPER(i.status) <> 'PAID'
           """)
    long countOutstanding(@Param("userId") Long userId, @Param("businessId") Long businessId);

    /** Total unpaid invoice amount across ALL of the user's businesses (consolidated). */
    @Query("""
           SELECT COALESCE(SUM(i.amount), 0) FROM BusinessInvoice i
           WHERE i.userId = :userId AND UPPER(i.status) <> 'PAID'
           """)
    BigDecimal sumOutstandingAll(@Param("userId") Long userId);
}
