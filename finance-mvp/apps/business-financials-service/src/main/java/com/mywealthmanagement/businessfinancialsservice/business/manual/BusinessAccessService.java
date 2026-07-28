package com.mywealthmanagement.businessfinancialsservice.business.manual;

import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class BusinessAccessService {

    public boolean canManage(Long actingUserId, Long businessOwnerId, List<BusinessTeamMember> teamMembers) {
        if (actingUserId == null || businessOwnerId == null) return false;
        if (actingUserId.equals(businessOwnerId)) return true;
        if (teamMembers == null) return false;
        return teamMembers.stream()
                .filter(member -> actingUserId.equals(member.getMemberUserId()))
                .anyMatch(member -> "ADMIN".equalsIgnoreCase(member.getRole()) || "EDITOR".equalsIgnoreCase(member.getRole()));
    }

    public boolean canView(Long actingUserId, Long businessOwnerId, List<BusinessTeamMember> teamMembers) {
        if (actingUserId == null || businessOwnerId == null) return false;
        if (actingUserId.equals(businessOwnerId)) return true;
        if (teamMembers == null) return false;
        return teamMembers.stream()
                .filter(member -> actingUserId.equals(member.getMemberUserId()))
                .anyMatch(member -> !"INVITED".equalsIgnoreCase(member.getStatus()));
    }
}
