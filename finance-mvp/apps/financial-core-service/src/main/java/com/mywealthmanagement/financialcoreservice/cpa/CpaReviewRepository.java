package com.mywealthmanagement.financialcoreservice.cpa;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CpaReviewRepository extends JpaRepository<CpaReview, Long> {

    List<CpaReview> findByCpaIdOrderByCreatedAtDesc(Long cpaId);

    boolean existsByCpaIdAndUserId(Long cpaId, Long userId);

    void deleteByUserId(Long userId);
}
