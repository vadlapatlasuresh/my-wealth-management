package com.mywealthmanagement.authservice.household;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface HouseholdBillRepository extends JpaRepository<HouseholdBill, Long> {
    List<HouseholdBill> findByHouseholdIdOrderByIdDesc(Long householdId);
}
