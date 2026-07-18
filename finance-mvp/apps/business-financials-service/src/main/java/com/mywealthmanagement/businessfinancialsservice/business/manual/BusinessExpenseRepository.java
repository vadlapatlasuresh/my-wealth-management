package com.mywealthmanagement.businessfinancialsservice.business.manual;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface BusinessExpenseRepository extends JpaRepository<BusinessExpense, Long> {

    List<BusinessExpense> findByUserIdAndBusinessIdOrderByExpenseDateDescIdDesc(Long userId, Long businessId);

    List<BusinessExpense> findByUserIdAndBusinessIdAndExpenseDateBetweenOrderByExpenseDateDescIdDesc(
            Long userId, Long businessId, LocalDate from, LocalDate to);

    /** Cross-business (consolidated) view for the "all businesses" export/summary. */
    List<BusinessExpense> findByUserIdOrderByExpenseDateDescIdDesc(Long userId);

    List<BusinessExpense> findByUserIdAndExpenseDateBetweenOrderByExpenseDateDescIdDesc(
            Long userId, LocalDate from, LocalDate to);

    Optional<BusinessExpense> findByIdAndUserId(Long id, Long userId);

    void deleteByBusinessIdAndUserId(Long businessId, Long userId);

    void deleteByUserId(Long userId);
}
