package com.mywealthmanagement.businessfinancialsservice.business.manual;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface BusinessInvoiceLineItemRepository extends JpaRepository<BusinessInvoiceLineItem, Long> {

    List<BusinessInvoiceLineItem> findByInvoiceIdOrderByPositionAsc(Long invoiceId);

    List<BusinessInvoiceLineItem> findByInvoiceIdInOrderByPositionAsc(List<Long> invoiceIds);

    void deleteByInvoiceId(Long invoiceId);
}
