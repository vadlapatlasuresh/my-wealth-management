package com.mywealthmanagement.authservice.family;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface FamilyCardRepository extends JpaRepository<FamilyCard, Long> {
    List<FamilyCard> findByHouseholdIdOrderByIdDesc(Long householdId);
    List<FamilyCard> findByFamilyMemberIdOrderByIdDesc(Long familyMemberId);
}
