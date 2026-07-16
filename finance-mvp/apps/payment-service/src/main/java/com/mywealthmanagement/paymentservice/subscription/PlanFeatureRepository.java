package com.mywealthmanagement.paymentservice.subscription;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PlanFeatureRepository extends JpaRepository<PlanFeature, Long> {

    List<PlanFeature> findByPlanKeyOrderBySortOrderAsc(String planKey);

    List<PlanFeature> findByPlanKeyAndEnabledTrueOrderBySortOrderAsc(String planKey);
}
