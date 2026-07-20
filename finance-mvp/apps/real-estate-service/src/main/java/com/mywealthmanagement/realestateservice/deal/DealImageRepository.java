package com.mywealthmanagement.realestateservice.deal;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DealImageRepository extends JpaRepository<DealImage, Long> {

    List<DealImage> findByDealIdOrderBySortOrderAscIdAsc(Long dealId);

    List<DealImage> findByDealIdInOrderBySortOrderAscIdAsc(List<Long> dealIds);

    long countByDealId(Long dealId);

    void deleteByDealId(Long dealId);
}
