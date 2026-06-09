package com.mywealthmanagement.financialcoreservice.debt;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DebtScenarioRepository extends JpaRepository<DebtScenario, Long> {
    List<DebtScenario> findByUserIdAndStrategyAndExtraPaymentMonthly(Long userId, String strategy, java.math.BigDecimal extraPaymentMonthly);

    void deleteByUserId(Long userId);
}
