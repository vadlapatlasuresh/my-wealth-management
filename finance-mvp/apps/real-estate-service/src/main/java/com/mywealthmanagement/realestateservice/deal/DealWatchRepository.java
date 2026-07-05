package com.mywealthmanagement.realestateservice.deal;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface DealWatchRepository extends JpaRepository<DealWatch, Long> {

    List<DealWatch> findByUserIdOrderByCreatedAtDesc(Long userId);

    List<DealWatch> findByDealId(Long dealId);

    long countByUserId(Long userId);

    @Query("select distinct w.userId from DealWatch w")
    List<Long> findDistinctUserIds();

    boolean existsByUserIdAndDealId(Long userId, Long dealId);

    void deleteByUserIdAndDealId(Long userId, Long dealId);

    void deleteByUserId(Long userId);
}
