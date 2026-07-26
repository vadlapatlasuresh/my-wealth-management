package com.mywealthmanagement.businessfinancialsservice.business.manual;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BusinessProjectMilestoneRepository extends JpaRepository<BusinessProjectMilestone, Long> {

    List<BusinessProjectMilestone> findByProjectIdOrderByPositionAsc(Long projectId);

    List<BusinessProjectMilestone> findByProjectIdInOrderByPositionAsc(List<Long> projectIds);

    Optional<BusinessProjectMilestone> findByIdAndUserId(Long id, Long userId);

    void deleteByProjectId(Long projectId);
}
