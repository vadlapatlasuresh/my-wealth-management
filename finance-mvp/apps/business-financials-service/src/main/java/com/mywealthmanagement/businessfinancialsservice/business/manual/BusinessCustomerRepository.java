package com.mywealthmanagement.businessfinancialsservice.business.manual;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BusinessCustomerRepository extends JpaRepository<BusinessCustomer, Long> {

    List<BusinessCustomer> findByBusinessIdAndUserIdOrderByDisplayNameAsc(Long businessId, Long userId);

    Optional<BusinessCustomer> findByIdAndUserId(Long id, Long userId);

    Optional<BusinessCustomer> findByIdAndBusinessIdAndUserId(Long id, Long businessId, Long userId);

    void deleteByBusinessIdAndUserId(Long businessId, Long userId);
}
