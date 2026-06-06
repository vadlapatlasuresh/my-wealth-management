package com.mywealthmanagement.accountaggregationservice.account;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface AccountRepository extends JpaRepository<Account, Long> {
    Optional<Account> findByPlaidAccountId(String plaidAccountId);
    List<Account> findByUserId(Long userId);
    List<Account> findByPlaidItemPlaidItemId(String plaidItemId);
}
