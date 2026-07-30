package com.mywealthmanagement.businessfinancialsservice.business.manual;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;

public interface BusinessContractorPaymentRepository extends JpaRepository<BusinessContractorPayment, Long> {
    List<BusinessContractorPayment> findByBusinessIdOrderByPaidAtDescIdDesc(Long businessId);
    List<BusinessContractorPayment> findByContractorIdOrderByPaidAtDescIdDesc(Long contractorId);
    List<BusinessContractorPayment> findByBusinessIdAndPaidAtBetween(Long businessId, LocalDate from, LocalDate to);
}
