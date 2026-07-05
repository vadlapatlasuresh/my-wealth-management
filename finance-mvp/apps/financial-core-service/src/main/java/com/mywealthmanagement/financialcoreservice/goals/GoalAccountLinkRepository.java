package com.mywealthmanagement.financialcoreservice.goals;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface GoalAccountLinkRepository extends JpaRepository<GoalAccountLink, Long> {
    List<GoalAccountLink> findByGoalIdAndUserId(Long goalId, Long userId);
    List<GoalAccountLink> findByUserId(Long userId);
    Optional<GoalAccountLink> findByGoalIdAndAccountIdAndUserId(Long goalId, Long accountId, Long userId);
    boolean existsByGoalIdAndAccountIdAndUserId(Long goalId, Long accountId, Long userId);

    void deleteByGoalId(Long goalId);
    void deleteByUserId(Long userId);
}
