package com.mywealthmanagement.businessfinancialsservice.business.manual;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BusinessProjectRepository extends JpaRepository<BusinessProject, Long> {

    List<BusinessProject> findByBusinessIdAndUserIdOrderByCreatedAtDesc(Long businessId, Long userId);

    Optional<BusinessProject> findByIdAndUserId(Long id, Long userId);

    void deleteByBusinessIdAndUserId(Long businessId, Long userId);
}
