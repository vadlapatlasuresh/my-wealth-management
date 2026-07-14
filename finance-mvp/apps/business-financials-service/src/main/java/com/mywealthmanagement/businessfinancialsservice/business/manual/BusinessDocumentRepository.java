package com.mywealthmanagement.businessfinancialsservice.business.manual;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BusinessDocumentRepository extends JpaRepository<BusinessDocument, Long> {

    List<BusinessDocument> findByBusinessIdAndUserIdOrderByCreatedAtDesc(Long businessId, Long userId);

    List<BusinessDocument> findByBusinessIdAndUserIdAndInvoiceIdOrderByCreatedAtDesc(
            Long businessId, Long userId, Long invoiceId);

    List<BusinessDocument> findByBusinessIdAndUserIdAndPeriodYearOrderByCreatedAtDesc(
            Long businessId, Long userId, Integer periodYear);

    Optional<BusinessDocument> findByIdAndUserId(Long id, Long userId);

    void deleteByBusinessIdAndUserId(Long businessId, Long userId);
}
