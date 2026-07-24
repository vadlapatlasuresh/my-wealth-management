package com.mywealthmanagement.authservice.family;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface FamilyLedgerEntryRepository extends JpaRepository<FamilyLedgerEntry, Long> {
    List<FamilyLedgerEntry> findByFamilyMemberIdOrderByOccurredOnDescIdDesc(Long familyMemberId);
}
