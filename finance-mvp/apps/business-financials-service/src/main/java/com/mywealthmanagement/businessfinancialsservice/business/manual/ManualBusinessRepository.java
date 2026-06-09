package com.mywealthmanagement.businessfinancialsservice.business.manual;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ManualBusinessRepository extends JpaRepository<ManualBusiness, Long> {
    List<ManualBusiness> findByUserIdOrderByCreatedAtAsc(Long userId);

    Optional<ManualBusiness> findByIdAndUserId(Long id, Long userId);
}
