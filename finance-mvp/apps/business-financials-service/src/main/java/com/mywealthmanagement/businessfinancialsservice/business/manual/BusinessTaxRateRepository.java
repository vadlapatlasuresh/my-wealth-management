package com.mywealthmanagement.businessfinancialsservice.business.manual;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BusinessTaxRateRepository extends JpaRepository<BusinessTaxRate, Long> {

    List<BusinessTaxRate> findByBusinessIdAndUserIdOrderByNameAsc(Long businessId, Long userId);

    List<BusinessTaxRate> findByBusinessIdAndUserIdAndActiveTrue(Long businessId, Long userId);

    Optional<BusinessTaxRate> findByIdAndBusinessIdAndUserId(Long id, Long businessId, Long userId);

    void deleteByBusinessIdAndUserId(Long businessId, Long userId);
}
