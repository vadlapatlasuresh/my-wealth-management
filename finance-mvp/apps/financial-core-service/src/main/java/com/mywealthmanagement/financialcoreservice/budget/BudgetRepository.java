package com.mywealthmanagement.financialcoreservice.budget;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BudgetRepository extends JpaRepository<Budget, Long> {
    Optional<Budget> findByUserIdAndMonth(Long userId, String month);

    /** Every user's budget for a given month — drives the weekly budget email. */
    List<Budget> findByMonth(String month);

    void deleteByUserId(Long userId);
}
