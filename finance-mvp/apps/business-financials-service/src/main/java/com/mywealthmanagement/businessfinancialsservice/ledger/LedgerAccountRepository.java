package com.mywealthmanagement.businessfinancialsservice.ledger;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface LedgerAccountRepository extends JpaRepository<LedgerAccount, Long> {

    List<LedgerAccount> findByBusinessIdAndUserIdOrderByCodeAsc(Long businessId, Long userId);

    Optional<LedgerAccount> findByBusinessIdAndCode(Long businessId, String code);

    Optional<LedgerAccount> findByIdAndBusinessIdAndUserId(Long id, Long businessId, Long userId);

    boolean existsByBusinessId(Long businessId);
}
