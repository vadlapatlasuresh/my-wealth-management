package com.mywealthmanagement.businessfinancialsservice.business.manual;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface BusinessTeamMemberRepository extends JpaRepository<BusinessTeamMember, Long> {
    List<BusinessTeamMember> findByBusinessIdOrderByRoleAsc(Long businessId);
    Optional<BusinessTeamMember> findByIdAndBusinessId(Long id, Long businessId);
    Optional<BusinessTeamMember> findByBusinessIdAndInvitedEmailIgnoreCase(Long businessId, String invitedEmail);
    void deleteByBusinessId(Long businessId);
}
