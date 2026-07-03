package com.mywealthmanagement.businessfinancialsservice.business.manual;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface TransactionOverrideRepository extends JpaRepository<TransactionOverride, Long> {

    List<TransactionOverride> findByUserId(Long userId);

    Optional<TransactionOverride> findByUserIdAndExternalId(Long userId, String externalId);

    void deleteByUserIdAndExternalId(Long userId, String externalId);
}
