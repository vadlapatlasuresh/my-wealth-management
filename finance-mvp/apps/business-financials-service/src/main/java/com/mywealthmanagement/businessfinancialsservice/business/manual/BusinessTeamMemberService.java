package com.mywealthmanagement.businessfinancialsservice.business.manual;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class BusinessTeamMemberService {

    private final BusinessTeamMemberRepository teamMemberRepo;

    @Transactional
    public BusinessTeamMember addMember(Long userId, Long businessId, BusinessTeamMember member) {
        member.setUserId(userId);
        member.setBusinessId(businessId);
        if (member.getRole() == null || member.getRole().isBlank()) {
            member.setRole("VIEWER");
        }
        if (member.getStatus() == null || member.getStatus().isBlank()) {
            member.setStatus("ACTIVE");
        }
        return teamMemberRepo.save(member);
    }

    @Transactional(readOnly = true)
    public List<BusinessTeamMember> listMembers(Long businessId) {
        return teamMemberRepo.findByBusinessIdOrderByRoleAsc(businessId);
    }
}
