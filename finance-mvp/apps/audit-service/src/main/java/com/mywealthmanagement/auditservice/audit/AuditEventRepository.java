package com.mywealthmanagement.auditservice.audit;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;

public interface AuditEventRepository extends JpaRepository<AuditEvent, Long> {

    Page<AuditEvent> findByUserIdOrderByCreatedAtDesc(String userId, Pageable pageable);

    // Latest entry in the chain (by insertion id) — its entry_hash is the next prev_hash.
    AuditEvent findTopByOrderByIdDesc();

    // Whole chain in insertion order, for integrity verification.
    java.util.List<AuditEvent> findAllByOrderByIdAsc();

    // Events within an analytics window (newest first), for the admin dashboard.
    java.util.List<AuditEvent> findByCreatedAtGreaterThanEqualOrderByCreatedAtDesc(LocalDateTime from);

    /**
     * Everything ever done TO this customer, by anyone. The question the old schema could not
     * answer without a LIKE scan over URL paths — now a single index hit (idx_audit_target_time).
     */
    Page<AuditEvent> findByTargetUserIdOrderByCreatedAtDesc(String targetUserId, Pageable pageable);

    /** Everything a given ops user did, across all customers — the per-agent review. */
    Page<AuditEvent> findByActorIdOrderByCreatedAtDesc(String actorId, Pageable pageable);

    /** Access review: how many distinct customers an actor touched since a given time. */
    @Query("""
        SELECT COUNT(DISTINCT a.targetUserId) FROM AuditEvent a
        WHERE a.actorId = :actorId AND a.targetUserId IS NOT NULL AND a.createdAt >= :from
        """)
    long countDistinctTargetsByActorSince(@Param("actorId") String actorId, @Param("from") LocalDateTime from);

    // Flexible filter for the admin query endpoint. Null params are ignored.
    @Query("""
        SELECT a FROM AuditEvent a
        WHERE (:userId IS NULL OR a.userId = :userId)
          AND (:action IS NULL OR a.action LIKE %:action%)
          AND (:from   IS NULL OR a.createdAt >= :from)
          AND (:to     IS NULL OR a.createdAt <= :to)
        ORDER BY a.createdAt DESC
        """)
    Page<AuditEvent> search(@Param("userId") String userId,
                            @Param("action") String action,
                            @Param("from") LocalDateTime from,
                            @Param("to") LocalDateTime to,
                            Pageable pageable);
}
