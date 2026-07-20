package com.mywealthmanagement.realestateservice.holding;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PrivateHoldingRepository extends JpaRepository<PrivateHolding, Long> {

    List<PrivateHolding> findByUserIdOrderByCreatedAtDesc(Long userId);

    Optional<PrivateHolding> findByIdAndUserId(Long id, Long userId);

    boolean existsByUserIdAndSourceDealId(Long userId, Long sourceDealId);
}
