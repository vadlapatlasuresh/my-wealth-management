package com.mywealthmanagement.accountaggregationservice.plaid;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PlaidItemRepository extends JpaRepository<PlaidItem, Long> {
    Optional<PlaidItem> findByUserIdAndPlaidItemId(Long userId, String plaidItemId);
    List<PlaidItem> findByUserId(Long userId);
}
