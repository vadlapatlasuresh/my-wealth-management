package com.mywealthmanagement.authservice.household;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface HouseholdGoalContributionRepository
        extends JpaRepository<HouseholdGoalContribution, Long> {
    List<HouseholdGoalContribution> findByHouseholdGoalIdOrderByOccurredOnDesc(Long householdGoalId);
}
