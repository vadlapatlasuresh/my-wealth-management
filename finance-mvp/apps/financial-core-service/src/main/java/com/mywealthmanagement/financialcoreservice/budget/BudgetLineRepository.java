package com.mywealthmanagement.financialcoreservice.budget;

import org.springframework.data.jpa.repository.JpaRepository;

public interface BudgetLineRepository extends JpaRepository<BudgetLine, Long> {
}
