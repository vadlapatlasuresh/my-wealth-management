package com.mywealthmanagement.financialcoreservice.tax;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface TaxProfileRepository extends JpaRepository<TaxProfile, Long> {
    Optional<TaxProfile> findByUserId(Long userId);
    void deleteByUserId(Long userId);
}
