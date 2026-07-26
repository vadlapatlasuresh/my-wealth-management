package com.mywealthmanagement.businessfinancialsservice.business.manual;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface BusinessRecurringInvoiceRepository extends JpaRepository<BusinessRecurringInvoice, Long> {

    List<BusinessRecurringInvoice> findByBusinessIdAndUserIdOrderByCreatedAtDesc(Long businessId, Long userId);

    Optional<BusinessRecurringInvoice> findByIdAndUserId(Long id, Long userId);

    /** ACTIVE schedules whose next run has arrived — the generator's work list. */
    List<BusinessRecurringInvoice> findByStatusAndNextRunDateLessThanEqual(String status, LocalDate onOrBefore);

    void deleteByBusinessIdAndUserId(Long businessId, Long userId);
}
