package com.mywealthmanagement.businessfinancialsservice.business.manual;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface BusinessTeamMemberRepository extends JpaRepository<BusinessTeamMember, Long> {
    List<BusinessTeamMember> findByBusinessIdOrderByRoleAsc(Long businessId);
}
