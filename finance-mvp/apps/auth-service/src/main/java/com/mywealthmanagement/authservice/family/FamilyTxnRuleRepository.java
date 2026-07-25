package com.mywealthmanagement.authservice.family;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface FamilyTxnRuleRepository extends JpaRepository<FamilyTxnRule, Long> {
    List<FamilyTxnRule> findByHouseholdIdOrderByIdDesc(Long householdId);
}
