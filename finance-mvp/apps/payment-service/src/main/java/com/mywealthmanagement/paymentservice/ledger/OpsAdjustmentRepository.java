package com.mywealthmanagement.paymentservice.ledger;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface OpsAdjustmentRepository extends JpaRepository<OpsAdjustment, Long> {

    List<OpsAdjustment> findByStatusOrderByRequestedAtAsc(String status);

    List<OpsAdjustment> findByUserIdOrderByRequestedAtDesc(String userId);

    /** How many adjustments an agent raised in a window — feeds the agent-outlier rule. */
    @Query("SELECT COUNT(a) FROM OpsAdjustment a WHERE a.requestedBy = :actorId AND a.requestedAt >= :from")
    long countByRequesterSince(@Param("actorId") String actorId, @Param("from") LocalDateTime from);

    @Query("SELECT DISTINCT a.requestedBy FROM OpsAdjustment a WHERE a.requestedAt >= :from")
    List<String> findRequestersSince(@Param("from") LocalDateTime from);
}
