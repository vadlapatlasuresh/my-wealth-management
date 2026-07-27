package com.mywealthmanagement.businessfinancialsservice.business.manual;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BusinessPurchaseOrderRepository extends JpaRepository<BusinessPurchaseOrder, Long> {

    List<BusinessPurchaseOrder> findByBusinessIdAndUserIdOrderByCreatedAtDesc(Long businessId, Long userId);

    Optional<BusinessPurchaseOrder> findByIdAndUserId(Long id, Long userId);

    void deleteByBusinessIdAndUserId(Long businessId, Long userId);
}
