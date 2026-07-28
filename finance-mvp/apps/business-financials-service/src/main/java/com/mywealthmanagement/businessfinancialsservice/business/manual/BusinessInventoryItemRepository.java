package com.mywealthmanagement.businessfinancialsservice.business.manual;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BusinessInventoryItemRepository extends JpaRepository<BusinessInventoryItem, Long> {
    List<BusinessInventoryItem> findByBusinessIdAndUserIdOrderByNameAsc(Long businessId, Long userId);
    List<BusinessInventoryItem> findByBusinessIdOrderByNameAsc(Long businessId);
    Optional<BusinessInventoryItem> findByIdAndBusinessIdAndUserId(Long id, Long businessId, Long userId);
    Optional<BusinessInventoryItem> findByIdAndBusinessId(Long id, Long businessId);
}
