package com.mywealthmanagement.businessfinancialsservice.business.manual;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface BusinessLinkedAccountRepository extends JpaRepository<BusinessLinkedAccount, Long> {

    List<BusinessLinkedAccount> findByBusinessIdAndUserId(Long businessId, Long userId);

    void deleteByBusinessIdAndUserId(Long businessId, Long userId);

    /** Every linked-account assignment for a user (across all businesses); powers the
     *  global accountId -> businessId map so the UI can bind each account one-to-one. */
    List<BusinessLinkedAccount> findByUserId(Long userId);

    /** Remove a specific linked account from ANY business it's currently on (for this
     *  user). Used to enforce one-to-one: assigning it to a new business moves it. */
    void deleteByUserIdAndLinkedAccountId(Long userId, String linkedAccountId);
}
