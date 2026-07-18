package com.mywealthmanagement.businessfinancialsservice.business.manual;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BusinessBudgetRepository extends JpaRepository<BusinessBudget, Long> {

    List<BusinessBudget> findByUserIdAndBusinessIdOrderByCategoryAsc(Long userId, Long businessId);

    Optional<BusinessBudget> findByUserIdAndBusinessIdAndCategory(Long userId, Long businessId, String category);

    void deleteByUserIdAndBusinessIdAndCategory(Long userId, Long businessId, String category);

    void deleteByBusinessIdAndUserId(Long businessId, Long userId);
}
