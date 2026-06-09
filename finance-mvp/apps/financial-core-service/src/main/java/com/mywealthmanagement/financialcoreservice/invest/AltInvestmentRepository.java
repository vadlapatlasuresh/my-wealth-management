package com.mywealthmanagement.financialcoreservice.invest;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface AltInvestmentRepository extends JpaRepository<AltInvestment, Long> {
    List<AltInvestment> findByUserIdOrderByAddedAtDesc(Long userId);

    Optional<AltInvestment> findByIdAndUserId(Long id, Long userId);
}
