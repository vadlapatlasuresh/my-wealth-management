package com.mywealthmanagement.realestateservice.property;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;

public interface PropertyExpenseRepository extends JpaRepository<PropertyExpense, Long> {

    List<PropertyExpense> findByPropertyIdOrderByExpenseDateDescIdDesc(Long propertyId);

    List<PropertyExpense> findByPropertyIdAndExpenseDateBetweenOrderByExpenseDateDescIdDesc(
            Long propertyId, LocalDate from, LocalDate to);

    void deleteByUserId(Long userId);
}
