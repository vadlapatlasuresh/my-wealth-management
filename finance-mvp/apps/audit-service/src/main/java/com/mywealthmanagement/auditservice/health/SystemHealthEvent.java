package com.mywealthmanagement.auditservice.health;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * One row per monitored-service health TRANSITION (UP↔DOWN). The health monitor only
 * records changes, not every poll, so this table is the alert/audit log of outages and
 * recoveries — queryable by ops/admins.
 */
@Entity
@Table(name = "system_health_event")
@Data
@NoArgsConstructor
public class SystemHealthEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "service_name", nullable = false, length = 60)
    private String serviceName;

    @Column(nullable = false, length = 10)
    private String status; // UP | DOWN

    @Column(length = 500)
    private String detail; // e.g. HTTP code / error message on a DOWN

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
