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
    // "Outstanding" = still owed: any invoice not in a terminal/non-AR state
    // (excludes PAID, VOID and DRAFT), netting off partial payments. COALESCE keeps 0.

    /** Amount still owed on one business's open invoices (amount − payments). */
    @Query("""
           SELECT COALESCE(SUM(i.amount - COALESCE(i.paidAmount, 0)), 0) FROM BusinessInvoice i
           WHERE i.userId = :userId AND i.businessId = :businessId
             AND UPPER(i.status) NOT IN ('PAID', 'VOID', 'DRAFT')
           """)
    BigDecimal sumOutstanding(@Param("userId") Long userId, @Param("businessId") Long businessId);

    /** Number of still-owed invoices for one business. */
    @Query("""
           SELECT COUNT(i) FROM BusinessInvoice i
           WHERE i.userId = :userId AND i.businessId = :businessId
             AND UPPER(i.status) NOT IN ('PAID', 'VOID', 'DRAFT')
           """)
    long countOutstanding(@Param("userId") Long userId, @Param("businessId") Long businessId);

    /** Amount still owed across ALL of the user's businesses (consolidated). */
    @Query("""
           SELECT COALESCE(SUM(i.amount - COALESCE(i.paidAmount, 0)), 0) FROM BusinessInvoice i
           WHERE i.userId = :userId AND UPPER(i.status) NOT IN ('PAID', 'VOID', 'DRAFT')
           """)
    BigDecimal sumOutstandingAll(@Param("userId") Long userId);
}
