package com.mywealthmanagement.businessfinancialsservice.business.manual;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BusinessAccountRepository extends JpaRepository<BusinessAccount, Long> {
    List<BusinessAccount> findByBusinessIdAndUserIdOrderByCreatedAtAsc(Long businessId, Long userId);

    Optional<BusinessAccount> findByIdAndUserId(Long id, Long userId);

    void deleteByBusinessIdAndUserId(Long businessId, Long userId);

    /** All of the user's business accounts (every business); used to roll up
     *  point-in-time balances for the consolidated dashboard in one query. */
    List<BusinessAccount> findByUserId(Long userId);
}
