package com.mywealthmanagement.accountaggregationservice.transaction;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface CategoryRuleRepository extends JpaRepository<CategoryRule, Long> {

    List<CategoryRule> findByUserIdOrderByCreatedAtAsc(Long userId);

    Optional<CategoryRule> findByIdAndUserId(Long id, Long userId);

    void deleteByUserId(Long userId);
}
