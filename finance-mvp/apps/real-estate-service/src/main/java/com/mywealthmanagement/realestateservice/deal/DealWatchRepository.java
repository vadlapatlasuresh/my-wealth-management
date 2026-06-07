package com.mywealthmanagement.realestateservice.deal;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DealWatchRepository extends JpaRepository<DealWatch, Long> {

    List<DealWatch> findByUserIdOrderByCreatedAtDesc(Long userId);

    boolean existsByUserIdAndDealId(Long userId, Long dealId);

    void deleteByUserIdAndDealId(Long userId, Long dealId);
}
