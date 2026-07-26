package com.mywealthmanagement.businessfinancialsservice.ledger;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface JournalEntryRepository extends JpaRepository<JournalEntry, Long> {

    List<JournalEntry> findByBusinessIdAndUserIdOrderByEntryDateDescIdDesc(Long businessId, Long userId);

    Optional<JournalEntry> findByIdAndBusinessIdAndUserId(Long id, Long businessId, Long userId);

    boolean existsByBusinessIdAndReversalOf(Long businessId, Long reversalOf);
}
