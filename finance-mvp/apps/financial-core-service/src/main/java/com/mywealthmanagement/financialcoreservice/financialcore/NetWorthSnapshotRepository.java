package com.mywealthmanagement.financialcoreservice.financialcore;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface NetWorthSnapshotRepository extends JpaRepository<NetWorthSnapshot, Long> {

    Optional<NetWorthSnapshot> findByUserIdAndSnapshotDate(Long userId, LocalDate snapshotDate);

    List<NetWorthSnapshot> findByUserIdAndSnapshotDateGreaterThanEqualOrderBySnapshotDateAsc(
            Long userId, LocalDate from);

    List<NetWorthSnapshot> findByUserIdOrderBySnapshotDateAsc(Long userId);

    // Most recent snapshot on or before a given date (for "value ~30 days ago").
    Optional<NetWorthSnapshot> findFirstByUserIdAndSnapshotDateLessThanEqualOrderBySnapshotDateDesc(
            Long userId, LocalDate date);

    void deleteByUserId(Long userId);
}
