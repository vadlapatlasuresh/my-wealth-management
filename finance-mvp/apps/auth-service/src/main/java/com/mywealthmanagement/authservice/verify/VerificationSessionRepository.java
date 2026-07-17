package com.mywealthmanagement.authservice.verify;

import org.springframework.data.jpa.repository.JpaRepository;

public interface VerificationSessionRepository extends JpaRepository<VerificationSession, Long> {

    /** The newest session for this agent+customer — the live one for the call in progress. */
    VerificationSession findTopByAgentIdAndCustomerIdOrderByStartedAtDesc(String agentId, String customerId);
}
