package com.mywealthmanagement.authservice.verify;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;

public interface VerificationAttemptRepository extends JpaRepository<VerificationAttempt, Long> {

    /** Failed attempts against a customer since a cutoff — the fraud signal. */
    long countByCustomerIdAndOutcomeAndCreatedAtAfter(String customerId, String outcome, LocalDateTime since);

    List<VerificationAttempt> findBySessionIdOrderByCreatedAtAsc(Long sessionId);
}
