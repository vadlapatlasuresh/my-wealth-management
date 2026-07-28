package com.mywealthmanagement.businessfinancialsservice.business.manual;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BusinessContractorRepository extends JpaRepository<BusinessContractor, Long> {
    List<BusinessContractor> findByBusinessIdAndUserIdOrderByNameAsc(Long businessId, Long userId);
    List<BusinessContractor> findByBusinessIdOrderByNameAsc(Long businessId);
    Optional<BusinessContractor> findByIdAndBusinessIdAndUserId(Long id, Long businessId, Long userId);
    Optional<BusinessContractor> findByIdAndBusinessId(Long id, Long businessId);
}
