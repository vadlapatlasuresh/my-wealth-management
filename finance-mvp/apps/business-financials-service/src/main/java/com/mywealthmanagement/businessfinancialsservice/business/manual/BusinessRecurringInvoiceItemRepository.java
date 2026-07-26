package com.mywealthmanagement.businessfinancialsservice.business.manual;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface BusinessRecurringInvoiceItemRepository extends JpaRepository<BusinessRecurringInvoiceItem, Long> {

    List<BusinessRecurringInvoiceItem> findByScheduleIdOrderByPositionAsc(Long scheduleId);

    List<BusinessRecurringInvoiceItem> findByScheduleIdInOrderByPositionAsc(List<Long> scheduleIds);

    void deleteByScheduleId(Long scheduleId);
}
