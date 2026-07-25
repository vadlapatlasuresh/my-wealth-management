package com.mywealthmanagement.authservice.household;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface HouseholdIncomeRepository extends JpaRepository<HouseholdIncome, Long> {
    List<HouseholdIncome> findByHouseholdIdOrderByIdDesc(Long householdId);
}
