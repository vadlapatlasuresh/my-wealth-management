package com.mywealthmanagement.authservice.family;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface FamilyMemberRepository extends JpaRepository<FamilyMember, Long> {
    List<FamilyMember> findByHouseholdIdAndStatusOrderByIdAsc(Long householdId, String status);
}
