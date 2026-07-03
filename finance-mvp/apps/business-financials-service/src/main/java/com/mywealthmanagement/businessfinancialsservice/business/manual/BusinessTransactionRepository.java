package com.mywealthmanagement.businessfinancialsservice.business.manual;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BusinessTransactionRepository extends JpaRepository<BusinessTransaction, Long> {

    List<BusinessTransaction> findByBusinessIdAndUserIdOrderByPostedAtDescIdDesc(Long businessId, Long userId);

    List<BusinessTransaction> findByAccountIdAndUserIdOrderByPostedAtDescIdDesc(Long accountId, Long userId);

    Optional<BusinessTransaction> findByIdAndUserId(Long id, Long userId);

    void deleteByAccountIdAndUserId(Long accountId, Long userId);

    void deleteByBusinessIdAndUserId(Long businessId, Long userId);
}
