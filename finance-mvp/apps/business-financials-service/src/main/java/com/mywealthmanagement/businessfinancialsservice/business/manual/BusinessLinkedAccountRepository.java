package com.mywealthmanagement.businessfinancialsservice.business.manual;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface BusinessLinkedAccountRepository extends JpaRepository<BusinessLinkedAccount, Long> {

    List<BusinessLinkedAccount> findByBusinessIdAndUserId(Long businessId, Long userId);

    void deleteByBusinessIdAndUserId(Long businessId, Long userId);
}
