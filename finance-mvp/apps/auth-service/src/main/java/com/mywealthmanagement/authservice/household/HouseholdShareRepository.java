package com.mywealthmanagement.authservice.household;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface HouseholdShareRepository extends JpaRepository<HouseholdShare, Long> {

    List<HouseholdShare> findByHouseholdIdAndResourceType(Long householdId, String resourceType);

    List<HouseholdShare> findByOwnerUserIdAndResourceType(Long ownerUserId, String resourceType);

    Optional<HouseholdShare> findByHouseholdIdAndOwnerUserIdAndResourceTypeAndResourceId(
            Long householdId, Long ownerUserId, String resourceType, String resourceId);
}
