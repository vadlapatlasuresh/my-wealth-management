package com.mywealthmanagement.platformconfigservice.content;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DisclaimerAcceptanceRepository extends JpaRepository<DisclaimerAcceptance, Long> {

    /** A user's full consent ledger, newest first. */
    List<DisclaimerAcceptance> findByUserIdOrderByAcceptedAtDesc(Long userId);
}
