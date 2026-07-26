package com.mywealthmanagement.businessfinancialsservice.ledger;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface JournalEntryRepository extends JpaRepository<JournalEntry, Long> {

    List<JournalEntry> findByBusinessIdAndUserIdOrderByEntryDateDescIdDesc(Long businessId, Long userId);

    Optional<JournalEntry> findByIdAndBusinessIdAndUserId(Long id, Long businessId, Long userId);

    boolean existsByBusinessIdAndReversalOf(Long businessId, Long reversalOf);

    /* ---- Idempotency for automated postings (GL.2): one entry per (source_type, source_ref). ---- */

    boolean existsByBusinessIdAndSourceTypeAndSourceRef(Long businessId, String sourceType, String sourceRef);

    Optional<JournalEntry> findFirstByBusinessIdAndSourceTypeAndSourceRefOrderByIdAsc(
            Long businessId, String sourceType, String sourceRef);

    /* ---- Hash chain (GL.4) ---- */

    JournalEntry findTopByBusinessIdOrderByIdDesc(Long businessId);

    List<JournalEntry> findByBusinessIdAndUserIdOrderByIdAsc(Long businessId, Long userId);
}
