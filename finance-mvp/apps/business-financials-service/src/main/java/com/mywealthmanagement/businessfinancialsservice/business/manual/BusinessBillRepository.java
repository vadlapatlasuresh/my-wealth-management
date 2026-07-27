package com.mywealthmanagement.businessfinancialsservice.business.manual;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

public interface BusinessBillRepository extends JpaRepository<BusinessBill, Long> {

    List<BusinessBill> findByBusinessIdAndUserIdOrderByCreatedAtDesc(Long businessId, Long userId);

    Optional<BusinessBill> findByIdAndUserId(Long id, Long userId);

    void deleteByBusinessIdAndUserId(Long businessId, Long userId);

    /** Amount still owed to vendors (open bills, netting partial payments) for one business. */
    @Query("""
           SELECT COALESCE(SUM(b.amount - COALESCE(b.paidAmount, 0)), 0) FROM BusinessBill b
           WHERE b.userId = :userId AND b.businessId = :businessId
             AND UPPER(b.status) NOT IN ('PAID', 'VOID')
           """)
    BigDecimal sumPayable(@Param("userId") Long userId, @Param("businessId") Long businessId);
}
