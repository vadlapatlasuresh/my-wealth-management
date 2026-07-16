package com.mywealthmanagement.auditservice.audit;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/** A signed snapshot pinning the audit chain head at a point in time. See V6 for why. */
@Entity
@Table(name = "audit_checkpoints")
@Data
@NoArgsConstructor
public class AuditCheckpoint {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "chain_head", nullable = false, length = 64)
    private String chainHead;

    @Column(name = "last_event_id")
    private Long lastEventId;

    @Column(name = "event_count", nullable = false)
    private Long eventCount;

    @Column(nullable = false, length = 64)
    private String signature;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
