package com.mywealthmanagement.realestateservice.holding;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface HoldingEntryRepository extends JpaRepository<HoldingEntry, Long> {

    List<HoldingEntry> findByHoldingIdOrderByOccurredOnDescIdDesc(Long holdingId);

    List<HoldingEntry> findByUserIdOrderByOccurredOnDescIdDesc(Long userId);

    void deleteByHoldingId(Long holdingId);
}
