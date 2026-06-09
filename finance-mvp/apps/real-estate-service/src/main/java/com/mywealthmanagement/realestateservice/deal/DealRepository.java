package com.mywealthmanagement.realestateservice.deal;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DealRepository extends JpaRepository<Deal, Long> {

    List<Deal> findByUserIdOrderByCreatedAtDesc(Long userId);

    List<Deal> findByStatusOrderByCreatedAtDesc(String status);

    void deleteByUserId(Long userId);
}
