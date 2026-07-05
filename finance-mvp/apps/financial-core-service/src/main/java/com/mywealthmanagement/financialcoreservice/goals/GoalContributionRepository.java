package com.mywealthmanagement.financialcoreservice.goals;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface GoalContributionRepository extends JpaRepository<GoalContribution, Long> {
    List<GoalContribution> findByGoalIdAndUserIdOrderByCreatedAtDesc(Long goalId, Long userId);

    void deleteByGoalId(Long goalId);
    void deleteByUserId(Long userId);
}
