package com.mywealthmanagement.realestateservice.deal;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;

public interface DealInterestRepository extends JpaRepository<DealInterest, Long> {

    List<DealInterest> findByDealIdOrderByCreatedAtDesc(Long dealId);

    List<DealInterest> findByInterestedUserIdOrderByCreatedAtDesc(Long interestedUserId);

    long countByDealId(Long dealId);

    boolean existsByDealIdAndInterestedUserId(Long dealId, Long interestedUserId);

    @Query("select coalesce(sum(i.commitmentAmount), 0) from DealInterest i where i.dealId = :dealId")
    BigDecimal sumCommitmentByDealId(@Param("dealId") Long dealId);
}
