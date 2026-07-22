package com.mywealthmanagement.authservice.household;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface HouseholdGoalRepository extends JpaRepository<HouseholdGoal, Long> {
    List<HouseholdGoal> findByHouseholdIdOrderByIdDesc(Long householdId);
}
