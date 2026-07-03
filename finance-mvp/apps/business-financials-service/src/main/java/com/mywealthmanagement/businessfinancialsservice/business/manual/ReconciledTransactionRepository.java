package com.mywealthmanagement.businessfinancialsservice.business.manual;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ReconciledTransactionRepository extends JpaRepository<ReconciledTransaction, Long> {

    List<ReconciledTransaction> findByUserId(Long userId);

    Optional<ReconciledTransaction> findByUserIdAndExternalId(Long userId, String externalId);

    boolean existsByUserIdAndExternalId(Long userId, String externalId);

    void deleteByUserIdAndExternalId(Long userId, String externalId);
}
