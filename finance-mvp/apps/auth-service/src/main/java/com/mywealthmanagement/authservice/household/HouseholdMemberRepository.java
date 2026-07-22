package com.mywealthmanagement.authservice.household;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface HouseholdMemberRepository extends JpaRepository<HouseholdMember, Long> {

    /** The user's single ACTIVE membership, if any (v1: at most one). */
    Optional<HouseholdMember> findByUserIdAndStatus(Long userId, String status);

    /** All ACTIVE members of a household. */
    List<HouseholdMember> findByHouseholdIdAndStatus(Long householdId, String status);

    Optional<HouseholdMember> findByHouseholdIdAndUserId(Long householdId, Long userId);

    boolean existsByHouseholdIdAndUserIdAndStatus(Long householdId, Long userId, String status);
}
