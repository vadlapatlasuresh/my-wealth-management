package com.mywealthmanagement.businessfinancialsservice.business.manual;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class BusinessAccessServiceTest {

    private final BusinessAccessService service = new BusinessAccessService();

    @Test
    void ownerCanManage() {
        assertThat(service.canManage(42L, 42L, List.of())).isTrue();
    }

    @Test
    void adminCanManage() {
        BusinessTeamMember member = new BusinessTeamMember();
        member.setMemberUserId(7L);
        member.setRole("ADMIN");

        assertThat(service.canManage(7L, 42L, List.of(member))).isTrue();
    }

    @Test
    void viewerCannotManage() {
        BusinessTeamMember member = new BusinessTeamMember();
        member.setMemberUserId(7L);
        member.setRole("VIEWER");

        assertThat(service.canManage(7L, 42L, List.of(member))).isFalse();
    }
}
