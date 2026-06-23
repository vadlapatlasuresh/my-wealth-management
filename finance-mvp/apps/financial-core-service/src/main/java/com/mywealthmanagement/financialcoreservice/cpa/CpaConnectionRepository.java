package com.mywealthmanagement.financialcoreservice.cpa;

import org.springframework.data.jpa.repository.JpaRepository;

public interface CpaConnectionRepository extends JpaRepository<CpaConnection, Long> {

    boolean existsByCpaIdAndUserId(Long cpaId, Long userId);

    void deleteByUserId(Long userId);
}
