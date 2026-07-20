package com.mywealthmanagement.realestateservice.holding;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface K1RecordRepository extends JpaRepository<K1Record, Long> {

    List<K1Record> findByUserIdOrderByTaxYearDescIdAsc(Long userId);

    List<K1Record> findByUserIdAndTaxYearOrderByIdAsc(Long userId, Integer taxYear);

    Optional<K1Record> findByIdAndUserId(Long id, Long userId);

    Optional<K1Record> findByHoldingIdAndTaxYear(Long holdingId, Integer taxYear);

    void deleteByHoldingId(Long holdingId);
}
