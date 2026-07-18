package com.mywealthmanagement.businessfinancialsservice.business.manual;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface BusinessGoalRepository extends JpaRepository<BusinessGoal, Long> {

    Optional<BusinessGoal> findByUserIdAndBusinessId(Long userId, Long businessId);

    void deleteByBusinessIdAndUserId(Long businessId, Long userId);
}
