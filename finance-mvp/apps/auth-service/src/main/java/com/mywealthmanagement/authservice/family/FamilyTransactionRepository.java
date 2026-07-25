package com.mywealthmanagement.authservice.family;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface FamilyTransactionRepository extends JpaRepository<FamilyTransaction, Long> {
    List<FamilyTransaction> findByHouseholdIdOrderByOccurredOnDescIdDesc(Long householdId);
    List<FamilyTransaction> findByFamilyMemberIdOrderByOccurredOnDescIdDesc(Long familyMemberId);
    List<FamilyTransaction> findByHouseholdIdAndOccurredOnBetween(Long householdId, LocalDate from, LocalDate to);
    Optional<FamilyTransaction> findByHouseholdIdAndExternalId(Long householdId, String externalId);
}
