package com.mywealthmanagement.businessfinancialsservice.business.manual;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface BusinessInventoryMovementRepository extends JpaRepository<BusinessInventoryMovement, Long> {
    List<BusinessInventoryMovement> findByItemIdOrderByIdDesc(Long itemId);
    List<BusinessInventoryMovement> findByBusinessIdOrderByIdDesc(Long businessId);
}
