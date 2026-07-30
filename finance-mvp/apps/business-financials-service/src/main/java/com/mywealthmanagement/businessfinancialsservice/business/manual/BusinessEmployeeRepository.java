package com.mywealthmanagement.businessfinancialsservice.business.manual;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BusinessEmployeeRepository extends JpaRepository<BusinessEmployee, Long> {
    List<BusinessEmployee> findByBusinessIdOrderByNameAsc(Long businessId);
    Optional<BusinessEmployee> findByIdAndBusinessId(Long id, Long businessId);
}
