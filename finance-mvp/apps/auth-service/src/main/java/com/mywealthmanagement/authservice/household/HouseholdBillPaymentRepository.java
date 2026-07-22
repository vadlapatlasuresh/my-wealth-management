package com.mywealthmanagement.authservice.household;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface HouseholdBillPaymentRepository extends JpaRepository<HouseholdBillPayment, Long> {
    List<HouseholdBillPayment> findByHouseholdBillIdOrderByPaidOnDesc(Long householdBillId);
}
