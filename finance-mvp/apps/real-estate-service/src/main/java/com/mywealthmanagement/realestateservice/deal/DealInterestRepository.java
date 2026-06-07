package com.mywealthmanagement.realestateservice.deal;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DealInterestRepository extends JpaRepository<DealInterest, Long> {

    List<DealInterest> findByDealIdOrderByCreatedAtDesc(Long dealId);

    List<DealInterest> findByInterestedUserIdOrderByCreatedAtDesc(Long interestedUserId);

    long countByDealId(Long dealId);

    boolean existsByDealIdAndInterestedUserId(Long dealId, Long interestedUserId);
}
