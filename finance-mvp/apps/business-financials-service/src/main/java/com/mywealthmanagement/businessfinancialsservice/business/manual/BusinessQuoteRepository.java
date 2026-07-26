package com.mywealthmanagement.businessfinancialsservice.business.manual;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BusinessQuoteRepository extends JpaRepository<BusinessQuote, Long> {

    List<BusinessQuote> findByBusinessIdAndUserIdOrderByCreatedAtDesc(Long businessId, Long userId);

    Optional<BusinessQuote> findByIdAndUserId(Long id, Long userId);

    void deleteByBusinessIdAndUserId(Long businessId, Long userId);
}
