package com.mywealthmanagement.accountaggregationservice.holding;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface HoldingRepository extends JpaRepository<Holding, Long> {

    List<Holding> findByUserIdOrderByValueDesc(Long userId);

    Optional<Holding> findByUserIdAndPlaidAccountIdAndSecurityId(
            Long userId, String plaidAccountId, String securityId);

    /** Remove positions for the given Plaid accounts (used when unlinking an item). */
    void deleteByPlaidAccountIdIn(Collection<String> plaidAccountIds);
}
