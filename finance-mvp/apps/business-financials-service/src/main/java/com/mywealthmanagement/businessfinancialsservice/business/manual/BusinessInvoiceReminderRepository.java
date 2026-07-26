package com.mywealthmanagement.businessfinancialsservice.business.manual;

import org.springframework.data.jpa.repository.JpaRepository;

public interface BusinessInvoiceReminderRepository extends JpaRepository<BusinessInvoiceReminder, Long> {

    boolean existsByInvoiceIdAndOffsetDays(Long invoiceId, int offsetDays);
}
