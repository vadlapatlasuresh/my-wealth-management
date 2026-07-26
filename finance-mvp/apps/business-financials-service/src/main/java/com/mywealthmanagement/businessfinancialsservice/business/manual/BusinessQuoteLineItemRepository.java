package com.mywealthmanagement.businessfinancialsservice.business.manual;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface BusinessQuoteLineItemRepository extends JpaRepository<BusinessQuoteLineItem, Long> {

    List<BusinessQuoteLineItem> findByQuoteIdOrderByPositionAsc(Long quoteId);

    List<BusinessQuoteLineItem> findByQuoteIdInOrderByPositionAsc(List<Long> quoteIds);

    void deleteByQuoteId(Long quoteId);
}
