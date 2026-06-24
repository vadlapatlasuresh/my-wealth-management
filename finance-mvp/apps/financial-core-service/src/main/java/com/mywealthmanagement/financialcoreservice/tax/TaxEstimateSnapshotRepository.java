package com.mywealthmanagement.financialcoreservice.tax;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface TaxEstimateSnapshotRepository extends JpaRepository<TaxEstimateSnapshot, Long> {

    /** A user's history, most recent tax year first. */
    List<TaxEstimateSnapshot> findByUserIdOrderByTaxYearDesc(Long userId);

    Optional<TaxEstimateSnapshot> findByUserIdAndTaxYear(Long userId, Integer taxYear);

    void deleteByUserId(Long userId);
}
