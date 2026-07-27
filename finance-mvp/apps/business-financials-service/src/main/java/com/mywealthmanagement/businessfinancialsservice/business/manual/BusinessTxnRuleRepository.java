package com.mywealthmanagement.businessfinancialsservice.business.manual;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BusinessTxnRuleRepository extends JpaRepository<BusinessTxnRule, Long> {

    List<BusinessTxnRule> findByBusinessIdAndUserIdOrderByPositionAscIdAsc(Long businessId, Long userId);

    Optional<BusinessTxnRule> findByIdAndBusinessIdAndUserId(Long id, Long businessId, Long userId);

    Optional<BusinessTxnRule> findByIdAndUserId(Long id, Long userId);

    void deleteByBusinessIdAndUserId(Long businessId, Long userId);
}
