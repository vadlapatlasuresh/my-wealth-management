package com.mywealthmanagement.authservice.household;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface HouseholdInviteRepository extends JpaRepository<HouseholdInvite, Long> {

    Optional<HouseholdInvite> findByTokenHash(String tokenHash);

    List<HouseholdInvite> findByHouseholdIdAndStatus(Long householdId, String status);
}
