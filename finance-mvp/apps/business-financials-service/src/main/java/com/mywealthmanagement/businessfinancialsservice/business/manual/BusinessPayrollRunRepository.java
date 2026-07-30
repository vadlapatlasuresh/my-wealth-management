package com.mywealthmanagement.businessfinancialsservice.business.manual;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface BusinessPayrollRunRepository extends JpaRepository<BusinessPayrollRun, Long> {
    List<BusinessPayrollRun> findByBusinessIdOrderByIdDesc(Long businessId);
    List<BusinessPayrollRun> findByEmployeeIdOrderByIdDesc(Long employeeId);
}
